// Update data locally, then push to GitHub for Render to pick up
// Usage: node update_local.js
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://dzmohaipa.com/ipa/dzcrack.json';
const DATA_FILE = path.join(__dirname, 'data.json');

function fetchFromSource() {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const attempt = (n) => {
            if (resolved) return;
            console.log(`  Attempt ${6 - n}/5...`);
            const req = https.get(SOURCE_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                    'Accept': 'application/json, */*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache'
                },
                timeout: 15000
            }, (res) => {
                let stream = res;
                const enc = res.headers['content-encoding'];
                if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
                else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
                else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

                const chunks = [];
                stream.on('data', c => chunks.push(c));
                stream.on('end', () => {
                    if (resolved) return;
                    resolved = true;
                    const text = Buffer.concat(chunks).toString('utf-8');
                    try { resolve(JSON.parse(text)); }
                    catch (e) { reject(new Error('JSON parse error')); }
                });
                stream.on('error', err => {
                    if (resolved) return;
                    if (n > 1) setTimeout(() => attempt(n - 1), 2000);
                    else { resolved = true; reject(err); }
                });
            });
            req.on('error', err => {
                if (resolved) return;
                if (n > 1) setTimeout(() => attempt(n - 1), 2000);
                else { resolved = true; reject(err); }
            });
            req.on('timeout', () => {
                req.destroy();
                if (resolved) return;
                if (n > 1) setTimeout(() => attempt(n - 1), 2000);
                else { resolved = true; reject(new Error('Timeout')); }
            });
        };
        attempt(5);
    });
}

function toSideStoreApp(a) {
    return {
        beta: false,
        bundleIdentifier: a.bundleIdentifier || a.bundleID || '',
        developerName: a.developerName || 'Dzmoha',
        downloadURL: a.downloadURL || a.down || '',
        iconURL: a.iconURL || a.icon || '',
        localizedDescription: a.localizedDescription || '',
        name: a.name || '',
        size: a.size || 0,
        subtitle: '',
        tintColor: '2196F3',
        version: a.version || '',
        versionDate: a.versionDate || new Date().toISOString(),
        versionDescription: '',
        versions: [{
            version: a.version || '',
            date: a.versionDate || new Date().toISOString(),
            localizedDescription: a.localizedDescription || '',
            downloadURL: a.downloadURL || a.down || '',
            size: a.size || 0
        }]
    };
}

async function main() {
    console.log('📡 Fetching from dzmohaipa.com...');
    const rawData = await fetchFromSource();

    let sourceApps = rawData.apps || rawData;
    if (!Array.isArray(sourceApps)) {
        for (const k of Object.keys(rawData)) {
            if (Array.isArray(rawData[k])) { sourceApps = rawData[k]; break; }
        }
    }
    console.log(`📦 Raw apps: ${sourceApps.length}`);

    // De-duplicate
    const sourceMap = new Map();
    for (const app of sourceApps) {
        const key = app.bundleIdentifier || app.bundleID || app.name;
        if (!key || sourceMap.has(key)) continue;
        sourceMap.set(key, app);
    }

    // Load existing
    let existingMap = new Map();
    try {
        const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        for (const app of existing.apps) existingMap.set(app.bundleIdentifier, app);
    } catch (e) {}

    let added = 0, updated = 0, unchanged = 0;
    const finalApps = [];
    for (const [bid, srcApp] of sourceMap) {
        const existing = existingMap.get(bid);
        if (!existing) { finalApps.push(toSideStoreApp(srcApp)); added++; }
        else if (existing.version !== (srcApp.version || '')) { finalApps.push(toSideStoreApp(srcApp)); updated++; }
        else { finalApps.push(existing); unchanged++; }
    }

    const result = {
        name: 'Dzmoha IPA Library',
        identifier: 'com.dzmoha.sidestore.source',
        subtitle: 'By Mjeed',
        description: 'Using Dzmoha as IPA library for SideStore. Maintained by Mjeed.',
        iconURL: 'https://m.media-amazon.com/images/I/61H08WURv2L._AC_UF894,1000_QL80_.jpg',
        website: 'https://sidestore-ipa-4epj.onrender.com/apps.json',
        apps: finalApps
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2), 'utf-8');

    console.log('');
    console.log('✅ Done!');
    console.log(`   📱 Total: ${finalApps.length} apps`);
    console.log(`   ✨ New: ${added}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⏸️  Unchanged: ${unchanged}`);
    console.log('');
    console.log('Now push to GitHub:');
    console.log('   git add data.json && git commit -m "Update apps" && git push');
}

main().catch(err => console.error('❌ Failed:', err.message));
