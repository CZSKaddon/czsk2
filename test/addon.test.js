const pkg = require("../package.json");
const request = require("supertest");
const express = require("express");
const webshare = require("../src/webshare");
const app = require("../src/addon");
const { findShowInfo } = require("../src/meta");

jest.mock("../src/webshare");
jest.mock("../src/meta", () => ({ findShowInfo: jest.fn() }));

describe("GET /getUrl/:ident", () => {
  const ident = "test-ident";
  const token = "test-token";
  const fakeUrl = "https://webshare.cz/file/test";
  let server;

  beforeAll(() => {
    // Wrap the app in a server for supertest
    server = express();
    server.use(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls webshare.getUrl with correct params and redirects to returned URL", async () => {
    webshare.getUrl.mockResolvedValueOnce(fakeUrl);

    const res = await request(server)
      .get(`/getUrl/${ident}?token=${token}`)
      .expect(302);

    expect(webshare.getUrl).toHaveBeenCalledWith(ident, token);
    expect(res.headers.location).toBe(fakeUrl);
  });

  it("sets correct caching headers", async () => {
    webshare.getUrl.mockResolvedValueOnce(fakeUrl);

    const before = new Date();
    const res = await request(server)
      .get(`/getUrl/${ident}?token=${token}`)
      .expect(302);

    const expires = new Date(res.headers["expires"]);
    const lastModified = new Date(res.headers["last-modified"]);
    const cacheControl = res.headers["cache-control"];

    // Expires should be about 5 hours after last-modified
    expect(Math.abs(expires - lastModified - 5 * 60 * 60 * 1000)).toBeLessThan(
      2000,
    ); // allow 2s drift
    expect(Math.abs(lastModified - before)).toBeLessThan(5000); // allow 5s drift

    expect(cacheControl).toBe(
      "max-age=18000, must-revalidate, proxy-revalidate",
    );
  });

  it("returns 404 for missing ident param", async () => {
    // Route requires :ident, so /getUrl/ should 404
    const res = await request(server).get(`/getUrl/`).expect(404);
  });
});

describe("POST /configure", () => {
  const login = "testuser";
  const password = "testpass";
  const saltedPassword = "salted-testpass";
  const token = "test-token";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("salts password, logs in, and redirects with config if successful", async () => {
    webshare.saltPassword.mockResolvedValueOnce(saltedPassword);
    webshare.login.mockResolvedValueOnce(token);

    const res = await request(app)
      .post("/configure")
      .type("form")
      .send({ login, password });

    expect(webshare.saltPassword).toHaveBeenCalledWith(login, password);
    expect(webshare.login).toHaveBeenCalledWith(login, saltedPassword);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^stremio:\/\//);

    // Check config in redirect URL
    console.log(res.headers.location);
    const match = res.headers.location.match(
      /stremio:\/\/[^/]+\/([^/]+)\/manifest\.json/,
    );
    expect(match).toBeTruthy();
    const config = JSON.parse(decodeURIComponent(match[1]));
    expect(config).toEqual({ login, saltedPassword });
  });

  it("renders landing page with error if login fails", async () => {
    webshare.saltPassword.mockResolvedValueOnce(saltedPassword);
    webshare.login.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/configure")
      .type("form")
      .send({ login, password });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toMatch(/<html/i);
    expect(res.text).toMatch(new RegExp(login));
    expect(res.text).toContain("Login credentials are incorrect.");
  });

  it("renders landing page with error if saltPassword throws", async () => {
    webshare.saltPassword.mockRejectedValueOnce(new Error("fail"));

    const res = await request(app)
      .post("/configure")
      .type("form")
      .send({ login, password });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toMatch(/<html/i);
    expect(res.text).toMatch(new RegExp(login));
    expect(res.text).toContain("Login credentials are incorrect.");
  });
});

describe("Stream search handler", () => {
  const type = "movie";
  const id = "tt1234567";
  const info = { id, type, title: "Test Movie" };
  const login = "testuser";
  const password = "testpass";
  const saltedPassword = "salted-testpass";
  const wsToken = "test-token";
  const streams = [
    { url: "https://webshare.cz/file/1", title: "Stream 1" },
    { url: "https://webshare.cz/file/2", title: "Stream 2" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns streams when password is provided in config", async () => {
    // Mock meta and webshare
    findShowInfo.mockResolvedValue(info);
    webshare.saltPassword.mockResolvedValueOnce(saltedPassword);
    webshare.login.mockResolvedValueOnce(wsToken);
    webshare.search.mockResolvedValueOnce(streams);

    // Use /stream endpoint as defined by stremio-addon-sdk
    const config = encodeURIComponent(JSON.stringify({ login, password }));
    const res = await request(app)
      .get(`/${config}/stream/${type}/${id}.json`)
      .expect(200);

    expect(webshare.saltPassword).toHaveBeenCalledWith(login, password);
    expect(webshare.login).toHaveBeenCalledWith(login, saltedPassword);
    expect(webshare.search).toHaveBeenCalledWith(info, wsToken);
    expect(res.body).toHaveProperty("streams");
    expect(res.body.streams).toEqual(streams);
  });

  it("returns streams when saltedPassword is provided in config", async () => {
    findShowInfo.mockResolvedValue(info);
    webshare.login.mockResolvedValueOnce(wsToken);
    webshare.search.mockResolvedValueOnce(streams);

    const config = encodeURIComponent(
      JSON.stringify({ login, saltedPassword }),
    );
    const res = await request(app)
      .get(`/${config}/stream/${type}/${id}.json`)
      .expect(200);

    expect(webshare.saltPassword).not.toHaveBeenCalled();
    expect(webshare.login).toHaveBeenCalledWith(login, saltedPassword);
    expect(webshare.search).toHaveBeenCalledWith(info, wsToken);
    expect(res.body.streams).toEqual(streams);
  });

  it("returns empty streams if findShowInfo returns null", async () => {
    findShowInfo.mockResolvedValue(null);

    const config = encodeURIComponent(JSON.stringify({ login, password }));
    const res = await request(app)
      .get(`/${config}/stream/${type}/${id}.json`)
      .expect(200);

    expect(res.body).toHaveProperty("streams");
    expect(res.body.streams).toEqual([]);
  });

  it("returns empty streams if webshare.search throws", async () => {
    findShowInfo.mockResolvedValue(info);
    webshare.saltPassword.mockResolvedValueOnce(saltedPassword);
    webshare.login.mockResolvedValueOnce(wsToken);
    webshare.search.mockRejectedValueOnce(new Error("fail"));

    const config = encodeURIComponent(JSON.stringify({ login, password }));
    const res = await request(app)
      .get(`/${config}/stream/${type}/${id}.json`)
      .expect(200);

    expect(res.body).toHaveProperty("streams");
    expect(res.body.streams).toEqual([]);
  });

  it("returns empty streams if webshare.login throws", async () => {
    findShowInfo.mockResolvedValue(info);
    webshare.saltPassword.mockResolvedValueOnce(saltedPassword);
    webshare.login.mockRejectedValueOnce(new Error("fail"));

    const config = encodeURIComponent(JSON.stringify({ login, password }));
    const res = await request(app)
      .get(`/${config}/stream/${type}/${id}.json`)
      .expect(200);

    expect(res.body).toHaveProperty("streams");
    expect(res.body.streams).toEqual([]);
  });
});

describe("GET /manifest.json", () => {
  it("returns the addon manifest", async () => {
    const res = await request(app).get("/manifest.json").expect(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("types");
    expect(res.body).toHaveProperty("version");

    expect(res.body.id).toBe("community.coffei.webshare");
    expect(res.body.name).toBe("Webshare.cz");
    expect(res.body.types).toEqual(["movie", "series"]);
    expect(res.body.version).toBe(pkg.version);
  });
});
