const host =
  process.argv.includes("--dev") == 1
    ? "localhost:61613"
    : "20317bf4c6c6-webshare-stremio-addon.baby-beamup.club";

const url =
  process.argv.includes("--dev") == 1
    ? "http://localhost:61613/"
    : "https://20317bf4c6c6-webshare-stremio-addon.baby-beamup.club/";

module.exports = { host, url };
