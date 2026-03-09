// ═══════════════════════════════════════════════════════════════════
// 📦 AppTesters Source Fetcher for Bones IPA Library
// ═══════════════════════════════════════════════════════════════════
// يسحب التطبيقات من مصدر AppTesters ويدمجها في apps.json
// Usage: node fetch_apptesters.js
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ─── مصادر السحب ───
const SOURCES = [
    {
        name: 'AppTesters Repo',
        url: 'https://raw.githubusercontent.com/apptesters-org/Starter/main/apps.json',
    },
    {
        name: 'AppTesters Repo (alt)',
        url: 'https://raw.githubusercontent.com/apptesters-org/AppTesters_Repo/main/apps.json',
    },
];

const APPS_FILE = path.join(__dirname, 'apps.json');

// ─── Bones IPA Library Metadata ───
const LIBRARY_META = {
    name: 'Bones IPA Library',
    identifier: 'com.bones.sidestore.source',
    subtitle: 'By Mjeed ',
    iconURL: 'https://image.tmdb.org/t/p/original/eyTu5c8LniVciRZIOSHTvvkkgJa.jpg',
    website: 'https://raw.githubusercontent.com/Rx3671/Bones-iPA-Library/refs/heads/main/apps.json',
};

// ═══════════════════════════════════════════════════════════════════
// 🔽 Fetch Helper with retry
// ═══════════════════════════════════════════════════════════════════
function fetchJSON(url, maxRetries = 3) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const attempt = (n) => {
            if (resolved) return;
            console.log(`    ↳ محاولة ${maxRetries - n + 1}/${maxRetries} ...`);

            const protocol = url.startsWith('https') ? https : require('http');
            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                    'Accept': 'application/json, */*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                },
                timeout: 20000,
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    console.log(`    ↳ إعادة توجيه → ${res.headers.location}`);
                    fetchJSON(res.headers.location, 1).then(resolve).catch(reject);
                    return;
                }

                if (res.statusCode !== 200) {
                    if (!resolved && n > 1) {
                        setTimeout(() => attempt(n - 1), 2000);
                    } else {
                        resolved = true;
                        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    }
                    return;
                }

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
                    try {
                        resolve(JSON.parse(text));
                    } catch (e) {
                        reject(new Error(`خطأ في تحليل JSON: ${e.message}`));
                    }
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
        attempt(maxRetries);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 🔄 Extract apps from raw source data
// ═══════════════════════════════════════════════════════════════════
function extractApps(rawData) {
    // Try common structures
    if (rawData.apps && Array.isArray(rawData.apps)) return rawData.apps;
    if (Array.isArray(rawData)) return rawData;

    // Search for first array property
    for (const key of Object.keys(rawData)) {
        if (Array.isArray(rawData[key])) return rawData[key];
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════════
// 🏗️ Normalize app to SideStore format
// ═══════════════════════════════════════════════════════════════════
function toSideStoreApp(app) {
    const bundleId = app.bundleIdentifier || app.bundleID || '';
    const downloadURL = app.downloadURL || app.down || '';
    const iconURL = app.iconURL || app.icon || '';
    const name = app.name || '';
    const version = app.version || '';
    const size = app.size || 0;
    const desc = app.localizedDescription || app.description || '';
    const devName = app.developerName || '';
    const subtitle = app.subtitle || '';
    const tintColor = app.tintColor || '2196F3';
    const versionDate = app.versionDate || new Date().toISOString().split('T')[0];
    const versionDesc = app.versionDescription || '';

    // Build versions array
    let versions = [];
    if (app.versions && Array.isArray(app.versions) && app.versions.length > 0) {
        versions = app.versions.map(v => ({
            version: v.version || version,
            date: v.date || versionDate,
            localizedDescription: v.localizedDescription || desc,
            downloadURL: v.downloadURL || downloadURL,
            size: v.size || size,
        }));
    } else {
        versions = [{
            version: version,
            date: versionDate,
            localizedDescription: desc,
            downloadURL: downloadURL,
            size: size,
        }];
    }

    return {
        beta: app.beta || false,
        bundleIdentifier: bundleId,
        developerName: devName,
        downloadURL: downloadURL,
        iconURL: iconURL,
        localizedDescription: desc,
        name: name,
        size: size,
        subtitle: subtitle,
        tintColor: tintColor,
        version: version,
        versionDate: versionDate,
        versionDescription: versionDesc,
        versions: versions,
    };
}

// ═══════════════════════════════════════════════════════════════════
// 📊 Format bytes
// ═══════════════════════════════════════════════════════════════════
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════════
// 🚀 Main
// ═══════════════════════════════════════════════════════════════════
async function main() {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  📦 AppTesters Source Fetcher                ║');
    console.log('  ║  Bones IPA Library                           ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');

    // ─── Step 1: Load existing apps.json ───
    let existingApps = new Map();
    try {
        const existing = JSON.parse(fs.readFileSync(APPS_FILE, 'utf-8'));
        if (existing.apps && Array.isArray(existing.apps)) {
            for (const app of existing.apps) {
                const key = app.bundleIdentifier || app.name;
                if (key) existingApps.set(key, app);
            }
        }
        console.log(`  📂 تم تحميل ${existingApps.size} تطبيق من apps.json`);
    } catch (e) {
        console.log('  📂 لا يوجد apps.json - سيتم إنشاء ملف جديد');
    }

    // ─── Step 2: Fetch from all sources ───
    const allNewApps = new Map();
    let totalFetched = 0;

    for (const source of SOURCES) {
        console.log('');
        console.log(`  📡 جاري السحب من: ${source.name}`);
        console.log(`     ${source.url}`);

        try {
            const data = await fetchJSON(source.url);
            const apps = extractApps(data);
            console.log(`  ✅ تم سحب ${apps.length} تطبيق من ${source.name}`);

            for (const app of apps) {
                const normalized = toSideStoreApp(app);
                const key = normalized.bundleIdentifier || normalized.name;
                if (key && !allNewApps.has(key)) {
                    allNewApps.set(key, normalized);
                    totalFetched++;
                }
            }
        } catch (err) {
            console.log(`  ⚠️  فشل السحب من ${source.name}: ${err.message}`);
            console.log(`     سيتم تجاوز هذا المصدر والمتابعة...`);
        }
    }

    console.log('');
    console.log(`  📊 إجمالي التطبيقات المسحوبة (بعد حذف المكرر): ${allNewApps.size}`);

    // ─── Step 3: Merge with existing ───
    let added = 0, updated = 0, unchanged = 0;
    const finalApps = new Map(existingApps); // start with existing

    for (const [key, newApp] of allNewApps) {
        const existing = finalApps.get(key);

        if (!existing) {
            // New app - add it
            finalApps.set(key, newApp);
            added++;
            console.log(`    ✨ جديد: ${newApp.name} (${newApp.version})`);
        } else if (existing.version !== newApp.version) {
            // Version changed - update it
            finalApps.set(key, newApp);
            updated++;
            console.log(`    🔄 تحديث: ${newApp.name} (${existing.version} → ${newApp.version})`);
        } else {
            unchanged++;
        }
    }

    // ─── Step 4: Build final JSON ───
    const appsArray = Array.from(finalApps.values());

    // Sort by versionDate (newest first)
    appsArray.sort((a, b) => {
        const dateA = a.versionDate || '1970-01-01';
        const dateB = b.versionDate || '1970-01-01';
        return dateB.localeCompare(dateA);
    });

    const result = {
        ...LIBRARY_META,
        apps: appsArray,
    };

    // ─── Step 5: Write to apps.json ───
    fs.writeFileSync(APPS_FILE, JSON.stringify(result, null, 2), 'utf-8');

    // ─── Summary ───
    const totalSize = appsArray.reduce((sum, a) => sum + (a.size || 0), 0);

    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  ✅ تم بنجاح!                                ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log(`  📱 إجمالي التطبيقات: ${appsArray.length}`);
    console.log(`  ✨ جديد:            ${added}`);
    console.log(`  🔄 محدّث:           ${updated}`);
    console.log(`  ⏸️  بدون تغيير:      ${unchanged}`);
    console.log(`  💾 الحجم الكلي:     ${formatBytes(totalSize)}`);
    console.log('');
    console.log('  📄 تم الحفظ في: apps.json');
    console.log('');
    console.log('  للرفع على GitHub:');
    console.log('    git add apps.json && git commit -m "تحديث التطبيقات من AppTesters" && git push');
    console.log('');
}

main().catch(err => {
    console.error('');
    console.error(`  ❌ خطأ: ${err.message}`);
    console.error('');
    process.exit(1);
});
