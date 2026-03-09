// ═══════════════════════════════════════════════════════════════════
// 🥷 iOS Ninja IPA Library Fetcher for Bones IPA Library
// ═══════════════════════════════════════════════════════════════════
// يسحب التطبيقات من iosninja.io ويسحب روابط IPA من WeTransfer
// ويدمجها في apps.json مع تفادي التكرار
//
// Usage: node fetch_iosninja.js
//
// إذا فشل السحب بسبب Cloudflare:
//   1. افتح https://iosninja.io/ipa-library-ios في المتصفح
//   2. Ctrl+S → احفظ كـ "iosninja_library.html" بجانب هذا الملف
//   3. شغّل السكربت مرة أخرى
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto'); // kept for potential future use
const cheerio = require('cheerio');

// ─── Configuration ───
const LIBRARY_URL = 'https://iosninja.io/ipa-library-ios';
const BASE_URL = 'https://iosninja.io';
const APPS_FILE = path.join(__dirname, 'apps.json');
const CACHE_FILE = path.join(__dirname, 'iosninja_library.html');
const DELAY_MS = 1500; // تأخير بين الطلبات لتجنب الحظر

// ─── Bones IPA Library Metadata ───
const LIBRARY_META = {
    name: 'Bones IPA Library',
    identifier: 'com.bones.sidestore.source',
    subtitle: 'By Mjeed ',
    iconURL: 'https://image.tmdb.org/t/p/original/eyTu5c8LniVciRZIOSHTvvkkgJa.jpg',
    website: 'https://raw.githubusercontent.com/Rx3671/Bones-iPA-Library/refs/heads/main/apps.json',
};

// ═══════════════════════════════════════════════════════════════════
// 🔽 Fetch HTML with proper headers
// ═══════════════════════════════════════════════════════════════════
function fetchHTML(url, maxRetries = 3) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const attempt = (n) => {
            if (resolved) return;
            const protocol = url.startsWith('https') ? https : http;
            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
                timeout: 10000,
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let redir = res.headers.location;
                    if (redir.startsWith('/')) redir = (new URL(url)).origin + redir;
                    fetchHTML(redir, 1).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    if (!resolved && n > 1) setTimeout(() => attempt(n - 1), 1000);
                    else { resolved = true; reject(new Error(`HTTP ${res.statusCode}`)); }
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
                    resolve(Buffer.concat(chunks).toString('utf-8'));
                });
                stream.on('error', err => {
                    if (resolved) return;
                    if (n > 1) setTimeout(() => attempt(n - 1), 1000);
                    else { resolved = true; reject(err); }
                });
            });
            req.on('error', err => {
                if (resolved) return;
                if (n > 1) setTimeout(() => attempt(n - 1), 1000);
                else { resolved = true; reject(err); }
            });
            req.on('timeout', () => {
                req.destroy();
                if (resolved) return;
                if (n > 1) setTimeout(() => attempt(n - 1), 1000);
                else { resolved = true; reject(new Error('Timeout')); }
            });
        };
        attempt(maxRetries);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 📄 Get library HTML (online or cached)
// ═══════════════════════════════════════════════════════════════════
async function getLibraryHTML() {
    try {
        console.log('  📡 جاري السحب من iosninja.io...');
        const html = await fetchHTML(LIBRARY_URL);
        if (html.includes('challenge-platform') || html.includes('cf-browser-verification') || html.length < 5000) {
            throw new Error('Cloudflare blocked');
        }
        console.log(`  ✅ تم سحب صفحة المكتبة (${(html.length / 1024).toFixed(1)} KB)`);
        fs.writeFileSync(CACHE_FILE, html, 'utf-8');
        return html;
    } catch (err) {
        console.log(`  ⚠️  فشل السحب المباشر: ${err.message}`);
    }
    if (fs.existsSync(CACHE_FILE)) {
        console.log('  📂 استخدام النسخة المحفوظة: iosninja_library.html');
        return fs.readFileSync(CACHE_FILE, 'utf-8');
    }
    throw new Error(
        'فشل السحب! احفظ الصفحة يدوياً:\n' +
        '  1. افتح https://iosninja.io/ipa-library-ios\n' +
        '  2. Ctrl+S → احفظ كـ "iosninja_library.html"\n' +
        '  3. شغّل السكربت مرة أخرى'
    );
}

// ═══════════════════════════════════════════════════════════════════
// 🔍 Parse app listings from library page
// ═══════════════════════════════════════════════════════════════════
function parseLibraryPage(html) {
    const $ = cheerio.load(html);
    const apps = [];
    const seen = new Set();

    $('a[href*="ipa-library/download-"]').each((_, el) => {
        const $el = $(el);
        let href = $el.attr('href') || '';
        if (!href.includes('ipa-library/download-')) return;
        const fullUrl = href.startsWith('http') ? href : BASE_URL + href;

        // Extract slug
        const slugMatch = fullUrl.match(/download-(.+?)$/);
        const slug = slugMatch ? slugMatch[1].replace(/-ipa-ios$|-ipa$|-ios$/, '') : '';
        if (!slug || seen.has(slug)) return;
        seen.add(slug);

        // Get icon
        const img = $el.find('img').first();
        let iconURL = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
        if (iconURL && !iconURL.startsWith('http')) iconURL = BASE_URL + iconURL;

        // Get name and version from the link's text content
        // The structure is: <a><div><img></div><div>Name</div><div>Version/Description</div></a>
        const textParts = [];
        $el.find('div').each((_, d) => {
            const txt = $(d).clone().children('div').remove().end().text().trim();
            if (txt && !txt.includes('http') && txt.length < 200) textParts.push(txt);
        });

        // If we couldn't get from divs, try direct text
        if (textParts.length === 0) {
            const directText = $el.text().trim();
            if (directText) textParts.push(directText.split('\n')[0].trim());
        }

        let name = textParts[0] || slug;
        let versionOrDesc = textParts[1] || '';

        // Clean name - remove any trailing description
        name = name.split('\n')[0].trim();

        // Extract version from version text
        let version = '';
        const vMatch = versionOrDesc.match(/v?([\d]+\.[\d.]+(?:\s*\([^)]+\))?)/i);
        if (vMatch) version = vMatch[1].trim();

        apps.push({ name, version, iconURL, detailURL: fullUrl, slug });
    });

    return apps;
}

// ═══════════════════════════════════════════════════════════════════
// 📱 Parse app detail page
// ═══════════════════════════════════════════════════════════════════
function parseDetailPage(html, appInfo) {
    const $ = cheerio.load(html);
    const result = { ...appInfo };
    const bodyText = $('body').text();

    // Title from h1
    const h1 = $('h1').first().text().trim();
    if (h1) result.name = h1;

    // Version
    const vm = bodyText.match(/Version:\s*([\d][^\n]*)/i);
    if (vm) result.version = vm[1].trim().replace(/^v/i, '');

    // Developer
    const dm = bodyText.match(/Developer:\s*([^\n]+)/i);
    if (dm) result.developerName = dm[1].trim();

    // Size
    const sm = bodyText.match(/Size:\s*([^\n]+)/i);
    if (sm) result.sizeText = sm[1].trim();

    // Description - from list items or paragraphs
    const descParts = [];
    $('ul li, .entry-content p').each((_, el) => {
        const t = $(el).text().trim();
        if (t && t.length > 10 && t.length < 500 && !t.includes('Installation') && !t.includes('AltStore')) {
            descParts.push(t);
        }
    });
    if (descParts.length) result.localizedDescription = descParts[0];

    // ─── WeTransfer download link ───
    const greenBtn = $('a.green-btn, a[class*="green-btn"]').first();
    if (greenBtn.length) {
        let wtURL = greenBtn.attr('href') || '';
        if (wtURL && !wtURL.startsWith('http')) wtURL = BASE_URL + wtURL;
        if (wtURL && wtURL !== '#') {
            result.downloadURL = wtURL;
        }
    }

    // Fallback: look for any .ipa link
    if (!result.downloadURL) {
        $('a[href*=".ipa"]').each((_, el) => {
            const h = $(el).attr('href');
            if (h && !result.downloadURL) {
                result.downloadURL = h.startsWith('http') ? h : BASE_URL + h;
            }
        });
    }

    // Fallback: look for any wetransfer link in the page
    if (!result.downloadURL) {
        $('a[href*="wetransfer.com"]').each((_, el) => {
            const h = $(el).attr('href');
            if (h && !result.downloadURL) {
                result.downloadURL = h;
            }
        });
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════
// 📏 Parse size text to bytes
// ═══════════════════════════════════════════════════════════════════
function parseSizeToBytes(sizeText) {
    if (!sizeText) return 0;
    const m = sizeText.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    return Math.round(num * ({ B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[unit] || 1));
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════
// 🏗️ Convert to SideStore format
// ═══════════════════════════════════════════════════════════════════
function toSideStoreApp(app) {
    const bundleId = app.bundleIdentifier || `io.iosninja.${app.slug || app.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`;
    const downloadURL = app.downloadURL || app.wetransferURL || '';
    const size = app.size || parseSizeToBytes(app.sizeText) || 0;
    const now = new Date().toISOString().split('T')[0];

    return {
        beta: false,
        bundleIdentifier: bundleId,
        developerName: app.developerName || 'iOS Ninja',
        downloadURL,
        iconURL: app.iconURL || '',
        localizedDescription: app.localizedDescription || app.name || '',
        name: app.name || '',
        size,
        subtitle: '',
        tintColor: '4CAF50',
        version: app.version || '',
        versionDate: now,
        versionDescription: '',
        versions: [{
            version: app.version || '',
            date: now,
            localizedDescription: app.localizedDescription || app.name || '',
            downloadURL,
            size,
        }],
    };
}

// ═══════════════════════════════════════════════════════════════════
// 🚀 Main
// ═══════════════════════════════════════════════════════════════════
async function main() {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  🥷 iOS Ninja IPA Library Fetcher                ║');
    console.log('  ║  Bones IPA Library                               ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');

    // ─── Step 1: Load existing apps.json ───
    const existingByBundle = new Map();
    const existingByName = new Set();
    try {
        const data = JSON.parse(fs.readFileSync(APPS_FILE, 'utf-8'));
        if (data.apps && Array.isArray(data.apps)) {
            for (const app of data.apps) {
                if (app.bundleIdentifier) existingByBundle.set(app.bundleIdentifier, app);
                if (app.name) existingByName.add(app.name.toLowerCase().trim());
            }
        }
        console.log(`  📂 تم تحميل ${existingByBundle.size} تطبيق من apps.json`);
    } catch (e) {
        console.log('  📂 لا يوجد apps.json - سيتم إنشاء ملف جديد');
    }

    // ─── Step 2: Get and parse library ───
    const libraryHTML = await getLibraryHTML();
    const listings = parseLibraryPage(libraryHTML);
    console.log(`  📋 تم العثور على ${listings.length} تطبيق في المكتبة`);

    if (!listings.length) {
        console.log('  ❌ لم يتم العثور على تطبيقات!');
        return;
    }

    // ─── Step 3: Fetch details for each app ───
    const detailedApps = [];
    let fetched = 0, skipped = 0, failed = 0;
    console.log('');

    for (let i = 0; i < listings.length; i++) {
        const app = listings[i];
        const tag = `[${i + 1}/${listings.length}]`;

        // Skip if already exists with same version
        const nameLower = app.name.toLowerCase().trim();
        if (existingByName.has(nameLower)) {
            // Find existing by name to check version
            let existingApp = null;
            for (const ea of existingByBundle.values()) {
                if (ea.name && ea.name.toLowerCase().trim() === nameLower) {
                    existingApp = ea;
                    break;
                }
            }
            if (existingApp && existingApp.version === app.version && app.version) {
                skipped++;
                continue;
            }
        }

        console.log(`  ${tag} 📱 ${app.name} (${app.version || '?'})...`);

        try {
            const html = await fetchHTML(app.detailURL, 1);
            if (html.includes('challenge-platform') || html.length < 2000) {
                console.log(`    ⚠️  Cloudflare blocked`);
                detailedApps.push(app);
                failed++;
            } else {
                const detailed = parseDetailPage(html, app);
                detailedApps.push(detailed);
                fetched++;
                const dlStatus = detailed.downloadURL ? '✅' : '⛔';
                console.log(`    ${dlStatus} ${detailed.name} | v${detailed.version || '?'} | ${detailed.sizeText || '?'}`);
                if (detailed.downloadURL) {
                    console.log(`       🔗 ${detailed.downloadURL.substring(0, 80)}...`);
                }
            }
        } catch (err) {
            console.log(`    ⚠️  خطأ: ${err.message}`);
            detailedApps.push(app);
            failed++;
        }

        if (i < listings.length - 1) await sleep(DELAY_MS);
    }

    console.log('');
    console.log(`  📊 نتائج سحب التفاصيل: ✅ ${fetched} | ⏭️ تم تخطيه ${skipped} | ⚠️ فشل ${failed}`);

    // ─── Step 4: Merge with dedup ───
    console.log('');
    let added = 0, updated = 0, unchanged = 0;
    const finalMap = new Map(existingByBundle);
    const finalNames = new Set(existingByName);

    for (const app of detailedApps) {
        const sApp = toSideStoreApp(app);
        const bid = sApp.bundleIdentifier;
        const nameLower = sApp.name.toLowerCase().trim();

        // ── تخطي تطبيقات بدون رابط تحميل ──
        if (!sApp.downloadURL) {
            continue;
        }

        // ── تفادي التكرار ──
        // 1. Check by bundle ID
        if (finalMap.has(bid)) {
            const ex = finalMap.get(bid);
            if (ex.version !== sApp.version && sApp.version) {
                finalMap.set(bid, sApp);
                updated++;
                console.log(`  🔄 تحديث: ${sApp.name} (${ex.version} → ${sApp.version})`);
            } else {
                unchanged++;
            }
            continue;
        }

        // 2. Check by name (avoid same app under different bundle ID)
        if (finalNames.has(nameLower)) {
            unchanged++;
            continue;
        }

        // 3. New app!
        finalMap.set(bid, sApp);
        finalNames.add(nameLower);
        added++;
        console.log(`  ✨ جديد: ${sApp.name} (${sApp.version || '?'})`);
    }

    // ─── Step 5: Save ───
    const appsArray = Array.from(finalMap.values());
    appsArray.sort((a, b) => (b.versionDate || '').localeCompare(a.versionDate || ''));

    const result = { ...LIBRARY_META, apps: appsArray };
    fs.writeFileSync(APPS_FILE, JSON.stringify(result, null, 2), 'utf-8');

    const totalSize = appsArray.reduce((s, a) => s + (a.size || 0), 0);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  ✅ تم بنجاح!                                    ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
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
    console.log('    git add apps.json && git commit -m "إضافة تطبيقات iOS Ninja" && git push');
    console.log('');
}

main().catch(err => {
    console.error(`\n  ❌ خطأ: ${err.message}\n`);
    process.exit(1);
});
