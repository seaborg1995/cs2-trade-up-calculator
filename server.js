const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3001;
const CACHE_FILE = 'var/tradeup_cache.json';

function fetchJson(targetUrl) {
    return new Promise((resolve, reject) => {
        const parsed = new url.URL(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            timeout: 60000,
            headers: {'User-Agent': 'CS2 Trade-Up Calculator'}
        };

        const req = client.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        req.end();
    });
}

async function fetchAllData(forceRefresh = true) {
    const cacheExists = fs.existsSync(CACHE_FILE);

    if (!forceRefresh && cacheExists) {
        const stats = fs.statSync(CACHE_FILE);
        const age = Date.now() - stats.mtimeMs;
        if (age < 3600000) {
            console.log('Using cached data');
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    }

    console.log('Fetching CSFloat prices...');
    const prices = await fetchJson('https://csfloat.com/api/v1/listings/price-list');
    console.log(`Found ${prices.length} items`);

    console.log('Fetching collections...');
    const collections = await fetchJson('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json');
    console.log(`Found ${collections.length} collections`);

    console.log('Fetching skins for float caps...');
    const skins = await fetchJson('https://raw.githubusercontent.com/ByMykel/CSGO-API/refs/heads/main/public/api/en/skins.json');
    console.log(`Found ${skins.length} skins`);

    const floatCap = {};

    const extraordinary = [];

    for (const skin of skins) {
        if (
            (skin.rarity.id === 'rarity_ancient' && skin.rarity.name === 'Extraordinary')
            || (skin.rarity.id === 'rarity_ancient_weapon' && skin.rarity.name === 'Covert')
        ) {
            extraordinary.push(skin);
        }

        if (skin.min_float !== undefined || skin.max_float !== undefined) {
            floatCap[skin.paint_index] = {
                wear_remap_min: skin.min_float || 0,
                wear_remap_max: skin.max_float || 1
            };
        }
    }
    console.log(`Found ${Object.keys(floatCap).length} float caps`);
    console.log(`Found ${extraordinary.length} extraordinary items`);

    // For each collection, check if any extraordinary skin has matching crate
    // If yes, add that extraordinary skin to collection.contains
    for (const collection of collections) {
        if (!collection.crates || collection.crates.length === 0) continue;
        if (!collection.contains) collection.contains = [];

        // Get all crate IDs for this collection
        const collectionCrateIds = collection.crates.map(c => c.id);

        // Check each extraordinary skin
        for (const extSkin of extraordinary) {
            if (!extSkin.crates || extSkin.crates.length === 0) continue;

            // Check if any of the skin's crates match collection's crates
            const hasMatchingCrate = extSkin.crates.some(crate =>
                collectionCrateIds.includes(crate.id)
            );

            if (hasMatchingCrate) {
                // Check if this skin is already in collection.contains (check by id only)
                const alreadyExists = collection.contains.some(item =>
                    item.id === extSkin.id
                );

                if (!alreadyExists) {
                    // Add skin to collection with necessary fields
                    const skinToAdd = {
                        id: extSkin.id,
                        name: extSkin.name,
                        rarity: {
                            color: extSkin.rarity.color,
                            id: 'rarity_extraordinary',
                            name: extSkin.rarity.name,
                        },
                        weapon: extSkin.weapon,
                        image: extSkin.image,
                        min_float: extSkin.min_float,
                        max_float: extSkin.max_float,
                        paint_index: extSkin.paint_index
                    };
                    collection.contains.push(skinToAdd);
                }
            }
        }
    }

    const data = {prices, collections, floatCap, fetched_at: new Date().toISOString()};

    if (!fs.existsSync('var')) fs.mkdirSync('var');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    console.log('Cache saved');

    return data;
}

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.css': 'text/css',
};

const server = http.createServer(async (req, res) => {
    if (req.url === '/api/data') {
        try {
            const data = await fetchAllData();
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(data));
        } catch (e) {
            console.error('Error:', e.message);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: e.message}));
        }
        return;
    }

    let filePath = req.url === '/' ? '/tradeup.html' : req.url;
    filePath = path.join(__dirname, filePath);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Error');
            return;
        }
        res.writeHead(200, {'Content-Type': contentType});
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});