const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
  id: "org.stremio.webshare.private",
  version: "1.0.0",
  name: "Webshare Private",
  description: "Private addon for Stremio that searches Webshare.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: {
    configurable: false,
    adult: false,
  }
};

const builder = new addonBuilder(manifest);

// --- Webshare API Functions ---
async function searchWebshare(query, wstToken) {
    if (!wstToken) return [];
    try {
        const response = await axios.get(`https://webshare.cz/api/search/`, { params: { q: query, wst: wstToken, limit: 50, category: 'video' } });
        const files = response.data.match(/<file>[\s\S]*?<\/file>/g) || [];
        return files.map(file => {
            const nameMatch = file.match(/<name>(.*?)<\/name>/);
            const identMatch = file.match(/<ident>(.*?)<\/ident>/);
            const sizeMatch = file.match(/<size>(.*?)<\/size>/);
            return { title: nameMatch?.[1], ident: identMatch?.[1], size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0 };
        }).filter(r => r.ident);
    } catch (error) {
        console.error("Webshare search error:", error.message);
        return [];
    }
}

async function getWebshareStreamUrl(ident, wstToken) {
    if (!wstToken || !ident) return null;
    try {
        const response = await axios.get(`https://webshare.cz/api/file_link/`, { params: { ident, wst: wstToken } });
        const linkMatch = response.data.match(/<link>(.*?)<\/link>/);
        return linkMatch ? linkMatch[1] : null;
    } catch (error) {
        console.error("Webshare get link error:", error.message);
        return null;
    }
}

// --- Stream Handler ---
builder.defineStreamHandler(async (args) => {
    const { type, id, config } = args;
    if (!config || !config.wstToken) {
        return { streams: [] };
    }

    // Zde by byla pokročilejší logika pro získání názvu z IMDb ID
    // Pro jednoduchost teď použijeme jen ID jako vyhledávací dotaz
    let query = id.split(':')[0]; 
    if (type === 'series') {
        const [imdbId, season, episode] = id.split(':');
        query = `${imdbId} S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`;
    }

    const results = await searchWebshare(query, config.wstToken);
    if (results.length === 0) {
        return { streams: [] };
    }

    const streams = [];
    for (const result of results.slice(0, 10)) {
        const streamUrl = await getWebshareStreamUrl(result.ident, config.wstToken);
        if (streamUrl) {
            const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(0) + " MB" : "";
            streams.push({
                url: streamUrl,
                title: `[Webshare] ${result.title}\n${sizeMB}`,
                name: `Webshare`
            });
        }
    }

    return { streams };
});

module.exports = builder.getInterface();
