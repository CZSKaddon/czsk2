const webshare = require("../src/webshare");
const needle = require("needle");

jest.mock("needle");

const file = (id, name, size, pos, neg) => ({
  name: "file",
  children: [
    { name: "ident", value: id },
    { name: "name", value: name },
    { name: "size", value: size },
    { name: "positive_votes", value: pos },
    { name: "negative_votes", value: neg },
  ],
});
describe("search results are sorted", () => {
  test("by match", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Miracle man",
      type: "movie",
      year: "2024",
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file("1", "Morcle man 2024.avi", "600000", "1", "0"),
          file("2", "Moracle man 2024.avi", "600000", "1", "0"),
          file("3", "Miracle man 2024.avi", "600000", "1", "0"),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.map((x) => x.ident)).toStrictEqual(["3", "2", "1"]);
  });

  test("by fulltext name match", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Miracle man",
      type: "series",
      episode: "3",
      series: "1",
      year: null,
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          // these filename are parsed incorrectly by the parse-torrent-title
          file("1", "720p S01 E03 Morcle man.avi", "600000", "1", "0"),
          file("2", "720p S01 E03 Moracle man.avi", "600000", "1", "0"),
          file("3", "720p S01 E03 Miracle man.avi", "600000", "1", "0"),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.map((x) => x.ident)).toStrictEqual(["3", "2", "1"]);
  });

  test("by positive votes", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Miracle man",
      type: "movie",
      year: "2024",
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file("1", "Miracle man 2024.avi", "600000", "4", "0"),
          file("2", "Miracle man 2024.avi", "600000", "0", "0"),
          file("3", "Miracle man 2024.avi", "600000", "1", "0"),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.map((x) => x.ident)).toStrictEqual(["1", "3", "2"]);
  });

  test("by size", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Miracle man",
      type: "movie",
      year: "2024",
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file("1", "Miracle man 2024.avi", "600000", "4", "0"),
          file("2", "Miracle man 2024.avi", "1200000", "4", "0"),
          file("3", "Miracle man 2024.avi", "100000", "4", "0"),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.map((x) => x.ident)).toStrictEqual(["2", "1", "3"]);
  });
  // NEW
  test("strong matches are not sorted by fulltext match", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Miracle man",
      type: "series",
      episode: "3",
      series: "1",
      year: null,
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          // these filename are parsed incorrectly by the parse-torrent-title
          file("1", "720p S01 E03 Morcle man.avi", "600000", "1", "0"),
          file("2", "720p S01 E03 Moracle man.avi", "600000", "1", "0"),
          file("3", "720p S01 E03 Miracle man.avi", "600000", "1", "0"),
          // and these are parsed correctly, first has fulltext match 0.6, second 0.3 and third 0.4
          file("4", "Miracle man 720p S01 E03.avi", "600000", "1", "0"),
          file(
            "5",
            "Miracle man 720p VOD-gakqlqlqpapapa S01 E03.avi",
            "600000",
            "4",
            "0",
          ),
          file(
            "6",
            "Miracle man 720p VOD-qqlkl S01 E03.avi",
            "600000",
            "2",
            "0",
          ),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    // 5 is first even though the fulltext match is low
    // the last three are sorted by fulltext match
    expect(results.map((x) => x.ident)).toStrictEqual([
      "5",
      "6",
      "4",
      "3",
      "2",
      "1",
    ]);
  });
});

describe("formatting description and name", () => {
  test("description and name are formed correctly from the filename and metadata", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "The Relic",
      type: "movie",
      year: "1999",
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file(
            "1",
            "The.Relic.1999.1080p.BluRay.x264-[YTS.AG].mkv",
            "2000000000",
            "10",
            "0",
          ),
          file(
            "2",
            "The.Relic.1999.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.5.1-SWTYBLZ.mkv",
            "30000000000",
            "15",
            "0",
          ),
          file(
            "3",
            "The.Relic.1999.REMASTERED.1080p.BluRay.H264.AAC-RARBG.mp4",
            "2500000000",
            "8",
            "0",
          ),
          file(
            "4",
            "The.Relic.1999.1080p.WEB-DL.DD5.1.H264-FGT.mkv",
            "180000000",
            "12",
            "0",
          ),
          file(
            "5",
            "The.Relic.1999.720p.BluRay.x264-[YTS.AG].mkv",
            "1000000000",
            "5",
            "0",
          ),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.length).toBe(5);
    // Results include the filename, the votes and the language in decsription
    expect(results[0].description).toContain("👍 15 👎 0");
    expect(results[0].description).toContain(
      "The.Relic.1999.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.5.1-SWTYBLZ.mkv",
    );
    expect(results[0].description).toContain("💾 30 GB");
    expect(results[0].name).toBe("Webshare ✅ 2160p");

    expect(results[1].description).toContain("👍 12 👎 0");
    expect(results[1].description).toContain(
      "The.Relic.1999.1080p.WEB-DL.DD5.1.H264-FGT.mkv",
    );
    expect(results[1].description).toContain("💾 180 MB");
    expect(results[1].name).toBe("Webshare ✅ 1080p");

    expect(results[2].description).toContain("👍 10 👎 0");
    expect(results[2].description).toContain(
      "The.Relic.1999.1080p.BluRay.x264-[YTS.AG].mkv",
    );
    expect(results[2].description).toContain("💾 2 GB");
    expect(results[2].name).toBe("Webshare ✅ 1080p");

    expect(results[3].description).toContain("👍 8 👎 0");
    expect(results[3].description).toContain(
      "The.Relic.1999.REMASTERED.1080p.BluRay.H264.AAC-RARBG.mp4",
    );
    expect(results[3].description).toContain("💾 2.5 GB");
    expect(results[3].name).toBe("Webshare ✅ 1080p");

    expect(results[4].description).toContain("👍 5 👎 0");
    expect(results[4].description).toContain(
      "The.Relic.1999.720p.BluRay.x264-[YTS.AG].mkv",
    );
    expect(results[4].description).toContain("💾 1 GB");
    expect(results[4].name).toBe("Webshare ✅ 720p");
  });

  test("handles common TV show filename patterns", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "Rolling Rad",
      type: "series",
      series: "1",
      episode: "1",
      year: null,
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file(
            "1",
            "Rolling.Rad.S01E01.1080p.BluRay.x264-[YTS.AG].mkv",
            "2000000000",
            "10",
            "0",
          ),
          file(
            "2",
            "Rolling.Rad.S01E01.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.5.1-SWTYBLZ.mkv",
            "30000000000",
            "15",
            "0",
          ),
          file(
            "3",
            "Rolling.Rad.S01E01.REMASTERED.1080p.BluRay.H264.AAC-RARBG.mp4",
            "2500000000",
            "8",
            "0",
          ),
          file(
            "5",
            "Rolling.Rad.S01E01.720p.BluRay.x264-[YTS.AG].mkv",
            "1000000000",
            "5",
            "0",
          ),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.length).toBe(4);
    expect(results[0].description).toContain("👍 15 👎 0");
    expect(results[0].description).toContain(
      "Rolling.Rad.S01E01.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.5.1-SWTYBLZ.mkv",
    );
    expect(results[0].description).toContain("💾 30 GB");
    expect(results[0].name).toBe("Webshare ✅ 2160p");

    expect(results[1].description).toContain("👍 10 👎 0");
    expect(results[1].description).toContain(
      "Rolling.Rad.S01E01.1080p.BluRay.x264-[YTS.AG].mkv",
    );
    expect(results[1].description).toContain("💾 2 GB");
    expect(results[1].name).toBe("Webshare ✅ 1080p");

    expect(results[2].description).toContain("👍 8 👎 0");
    expect(results[2].description).toContain(
      "Rolling.Rad.S01E01.REMASTERED.1080p.BluRay.H264.AAC-RARBG.mp4",
    );
    expect(results[2].description).toContain("💾 2.5 GB");
    expect(results[2].name).toBe("Webshare ✅ 1080p");

    expect(results[3].description).toContain("👍 5 👎 0");
    expect(results[3].description).toContain(
      "Rolling.Rad.S01E01.720p.BluRay.x264-[YTS.AG].mkv",
    );
    expect(results[3].description).toContain("💾 1 GB");
    expect(results[3].name).toBe("Webshare ✅ 720p");
  });

  test("handles filenames with language and subtitle information", async () => {
    const showInfo = {
      name: null,
      nameSk: null,
      originalName: "The LongTrain",
      type: "movie",
      year: "1999",
    };

    needle.mockImplementation((method, url, data, headers) => ({
      body: {
        children: [
          file(
            "1",
            "The.LongTrain.1999.1080p.BluRay.x264-[YTS.AG].mkv",
            "2000000000",
            "5",
            "0",
          ),
          file(
            "2",
            "The.LongTrain.1999.1080p.BluRay.x264-[YTS.AG].CZ.EN.mkv",
            "2000000000",
            "4",
            "0",
          ),
          file(
            "3",
            "The.LongTrain.1999.1080p.BluRay.x264-[YTS.AG].EN.CZ.mkv",
            "2000000000",
            "3",
            "0",
          ),
          file(
            "4",
            "The.LongTrain.1999.1080p.BluRay.x264-[YTS.AG].CZ.mkv",
            "2000000000",
            "2",
            "0",
          ),
          file(
            "5",
            "The.LongTrain.1999.1080p.BluRay.x264-[YTS.AG].EN.mkv",
            "2000000000",
            "1",
            "0",
          ),
        ],
      },
    }));

    const results = await webshare.search(showInfo, null);
    expect(results.length).toBe(5);
    // Check that language information is correctly extracted
    expect(results[0].description).not.toContain("🌐");
    expect(results[1].description).toContain("🌐 CZ|EN");
    expect(results[2].description).toContain("🌐 CZ|EN");
    expect(results[3].description).toContain("🌐 CZ");
    expect(results[4].description).toContain("🌐 EN");
  });
});
