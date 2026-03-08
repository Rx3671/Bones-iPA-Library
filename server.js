// SideStore IPA JSON Source Server
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://dzmohaipa.com/ipa/dzcrack.json';
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Load cached data from disk if exists
let sideStoreData = null;
try {
    sideStoreData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`Loaded ${sideStoreData.apps.length} apps from cache`);
} catch (e) {
    console.log('No cached data found');
}

// ─── Fetch with retry + per-attempt timeout ───
function fetchFromSource() {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const attempt = (n) => {
            if (resolved) return;

            const timer = setTimeout(() => {
                if (!resolved && n > 1) {
                    console.log('  Attempt timed out, retrying...');
                    attempt(n - 1);
                }
            }, 20000);

            const req = https.get(SOURCE_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                    'Accept': 'application/json, */*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
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
                    clearTimeout(timer);
                    resolved = true;
                    const text = Buffer.concat(chunks).toString('utf-8');
                    try { resolve(JSON.parse(text)); }
                    catch (e) {
                        console.log('Parse error. Response starts with:', text.substring(0, 200));
                        reject(new Error('JSON parse error - got HTML/blocked response'));
                    }
                });
                stream.on('error', err => {
                    clearTimeout(timer);
                    if (resolved) return;
                    if (n > 1) { setTimeout(() => attempt(n - 1), 1500); }
                    else { resolved = true; reject(err); }
                });
            });
            req.on('error', err => {
                clearTimeout(timer);
                if (resolved) return;
                console.log(`  Retry... (${err.message})`);
                if (n > 1) { setTimeout(() => attempt(n - 1), 1500); }
                else { resolved = true; reject(err); }
            });
            req.on('timeout', () => {
                req.destroy();
                clearTimeout(timer);
                if (resolved) return;
                if (n > 1) { setTimeout(() => attempt(n - 1), 1500); }
                else { resolved = true; reject(new Error('Timeout')); }
            });
        };
        attempt(5);
    });
}

// ─── Smart update ───
function smartUpdate(rawData) {
    let sourceApps = rawData.apps || rawData;
    if (!Array.isArray(sourceApps)) {
        for (const k of Object.keys(rawData)) {
            if (Array.isArray(rawData[k])) { sourceApps = rawData[k]; break; }
        }
    }

    const sourceMap = new Map();
    for (const app of sourceApps) {
        const key = app.bundleIdentifier || app.bundleID || app.name;
        if (!key || sourceMap.has(key)) continue;
        sourceMap.set(key, app);
    }

    const existingMap = new Map();
    if (sideStoreData && sideStoreData.apps) {
        for (const app of sideStoreData.apps) {
            existingMap.set(app.bundleIdentifier, app);
        }
    }

    let added = 0, updated = 0, unchanged = 0;
    const finalApps = [];

    for (const [bid, srcApp] of sourceMap) {
        const existing = existingMap.get(bid);
        const srcVersion = srcApp.version || '';
        if (!existing) {
            finalApps.push(toSideStoreApp(srcApp));
            added++;
        } else if (existing.version !== srcVersion) {
            finalApps.push(toSideStoreApp(srcApp));
            updated++;
        } else {
            finalApps.push(existing);
            unchanged++;
        }
    }

    sideStoreData = {
        name: 'SideStore IPA Source',
        identifier: 'com.sidestore.ipa.source',
        subtitle: 'Cracked & Modified IPA Apps',
        iconURL: 'https://dzmohaipa.com/ipa/Moha.png',
        website: 'https://dzmohaipa.com/ipa/',
        apps: finalApps
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(sideStoreData, null, 2), 'utf-8');
    return { total: finalApps.length, added, updated, unchanged };
}

function toSideStoreApp(a) {
    return {
        beta: false,
        bundleIdentifier: a.bundleIdentifier || a.bundleID || '',
        developerName: a.developerName || '',
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

// ─── Admin Page ───
function getAdminHTML() {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SideStore IPA - لوحة التحكم</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Tajawal',sans-serif;background:#0a0a1a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:linear-gradient(135deg,rgba(20,20,50,0.9),rgba(10,10,30,0.95));border:1px solid rgba(100,100,255,0.15);border-radius:24px;padding:48px;max-width:520px;width:90%;backdrop-filter:blur(20px);box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.logo{font-size:32px;font-weight:800;text-align:center;margin-bottom:8px;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{text-align:center;color:#888;margin-bottom:32px;font-size:14px}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:32px}
.stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;text-align:center}
.stat-num{font-size:28px;font-weight:800;color:#60a5fa}
.stat-label{font-size:12px;color:#888;margin-top:4px}
.btn{width:100%;padding:16px;border:none;border-radius:16px;font-family:inherit;font-size:18px;font-weight:700;cursor:pointer;transition:all 0.3s;margin-bottom:12px}
.btn-primary{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(59,130,246,0.4)}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none}
.btn-link{background:rgba(255,255,255,0.05);color:#60a5fa;border:1px solid rgba(100,100,255,0.2)}
.btn-link:hover{background:rgba(100,100,255,0.1)}
.status{margin-top:20px;padding:16px;border-radius:12px;font-size:14px;display:none;text-align:center;line-height:1.8}
.status.show{display:block}
.status.success{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#4ade80}
.status.error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171}
.status.loading{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa}
.spinner{display:inline-block;width:18px;height:18px;border:3px solid rgba(96,165,250,0.3);border-top-color:#60a5fa;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-left:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.json-url{margin-top:20px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:13px;text-align:center;word-break:break-all}
.json-url a{color:#60a5fa;text-decoration:none}
</style>
</head>
<body>
<div class="card">
    <div class="logo">SideStore IPA</div>
    <p class="sub">لوحة تحكم مصدر التطبيقات</p>
    <div class="stats">
        <div class="stat"><div class="stat-num" id="total">-</div><div class="stat-label">تطبيق</div></div>
        <div class="stat"><div class="stat-num" id="updated">-</div><div class="stat-label">محدّث</div></div>
        <div class="stat"><div class="stat-num" id="added">-</div><div class="stat-label">جديد</div></div>
    </div>
    <button class="btn btn-primary" id="updateBtn" onclick="doUpdate()">🔄 تحديث التطبيقات</button>
    <a href="/apps.json" target="_blank" class="btn btn-link" style="display:block;text-align:center;text-decoration:none">📋 عرض ملف JSON</a>
    <div class="status" id="status"></div>
    <div class="json-url">رابط المصدر: <a href="/apps.json" id="jsonLink">/apps.json</a></div>
</div>
<script>
fetch('/api/stats').then(r=>r.json()).then(d=>{
    document.getElementById('total').textContent=d.total||0;
    document.getElementById('jsonLink').href=location.origin+'/apps.json';
    document.getElementById('jsonLink').textContent=location.origin+'/apps.json';
}).catch(()=>{});

function doUpdate(){
    const btn=document.getElementById('updateBtn');
    const st=document.getElementById('status');
    btn.disabled=true;
    btn.innerHTML='<span class="spinner"></span> جاري التحديث...';
    st.className='status show loading';
    st.textContent='جاري سحب البيانات من المصدر... (قد يستغرق 30 ثانية)';

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),120000);

    fetch('/api/update',{method:'POST',signal:controller.signal})
    .then(r=>r.json())
    .then(d=>{
        clearTimeout(timeout);
        if(d.error){
            st.className='status show error';
            st.textContent='خطأ: '+d.error;
        } else {
            st.className='status show success';
            st.innerHTML='✅ تم التحديث!<br>📱 '+d.total+' تطبيق | 🔄 '+d.updated+' محدّث | ✨ '+d.added+' جديد | ⏸️ '+d.unchanged+' بدون تغيير';
            document.getElementById('total').textContent=d.total;
            document.getElementById('updated').textContent=d.updated;
            document.getElementById('added').textContent=d.added;
        }
        btn.disabled=false;
        btn.innerHTML='🔄 تحديث التطبيقات';
    })
    .catch(e=>{
        clearTimeout(timeout);
        st.className='status show error';
        st.textContent='فشل: '+(e.name==='AbortError'?'انتهت المهلة':e.message);
        btn.disabled=false;
        btn.innerHTML='🔄 تحديث التطبيقات';
    });
}
</script>
</body>
</html>`;
}

// ─── HTTP Server ───
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // JSON endpoint
    if (req.url === '/apps.json') {
        if (!sideStoreData) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No data. Visit /admin to update.' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(sideStoreData, null, 2));
        return;
    }

    // Admin
    if (req.url === '/' || req.url === '/admin') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getAdminHTML());
        return;
    }

    // Stats
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: sideStoreData ? sideStoreData.apps.length : 0 }));
        return;
    }

    // Update
    if (req.url === '/api/update' && req.method === 'POST') {
        try {
            console.log('Update requested...');
            const raw = await fetchFromSource();
            const result = smartUpdate(raw);
            console.log(`Updated: ${result.total} apps (${result.added} new, ${result.updated} updated, ${result.unchanged} unchanged)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (err) {
            console.log('Update failed:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── Start ───
// Start server FIRST, then fetch in background
server.listen(PORT, () => {
    console.log('');
    console.log('  SideStore IPA Server Running! 🚀');
    console.log('  ─────────────────────────────────');
    console.log(`  Admin:  http://localhost:${PORT}/`);
    console.log(`  JSON:   http://localhost:${PORT}/apps.json`);
    console.log(`  Apps:   ${sideStoreData ? sideStoreData.apps.length : 0}`);
    console.log('');

    // Fetch in background if no cached data
    if (!sideStoreData) {
        console.log('Fetching data in background...');
        fetchFromSource()
            .then(raw => {
                const result = smartUpdate(raw);
                console.log(`Loaded: ${result.total} apps`);
            })
            .catch(err => {
                console.log('Background fetch failed:', err.message);
                console.log('Use the admin page to update manually.');
            });
    }
});
