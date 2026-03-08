// SideStore IPA JSON Source Server
// Serves data from data.json (updated locally via update_local.js)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Load data from disk
let sideStoreData = null;
try {
    sideStoreData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`Loaded ${sideStoreData.apps.length} apps from data.json`);
} catch (e) {
    console.log('WARNING: data.json not found! Run update_local.js first.');
}

// ─── Admin Page ───
function getAdminHTML() {
    const count = sideStoreData ? sideStoreData.apps.length : 0;
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
.stats{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:32px}
.stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;text-align:center}
.stat-num{font-size:36px;font-weight:800;color:#60a5fa}
.stat-label{font-size:14px;color:#888;margin-top:4px}
.btn{width:100%;padding:16px;border:none;border-radius:16px;font-family:inherit;font-size:18px;font-weight:700;cursor:pointer;transition:all 0.3s;margin-bottom:12px;display:block;text-align:center;text-decoration:none}
.btn-primary{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(59,130,246,0.4)}
.json-url{margin-top:20px;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:14px;text-align:center;word-break:break-all}
.json-url a{color:#60a5fa;text-decoration:none}
.note{margin-top:16px;padding:12px;background:rgba(255,200,50,0.08);border:1px solid rgba(255,200,50,0.2);border-radius:12px;font-size:12px;color:#fbbf24;text-align:center;line-height:1.6}
</style>
</head>
<body>
<div class="card">
    <div class="logo">SideStore IPA</div>
    <p class="sub">مصدر تطبيقات SideStore/AltStore</p>
    <div class="stats">
        <div class="stat"><div class="stat-num">${count}</div><div class="stat-label">تطبيق متاح</div></div>
    </div>
    <a href="/apps.json" target="_blank" class="btn btn-primary">📋 عرض ملف JSON</a>
    <div class="json-url">
        رابط المصدر (أضفه في SideStore):<br>
        <a href="/apps.json" id="jl">/apps.json</a>
    </div>
    <div class="note">
        💡 للتحديث: شغّل <code>node update_local.js</code> محلياً ثم ارفع على GitHub
    </div>
</div>
<script>
document.getElementById('jl').href=location.origin+'/apps.json';
document.getElementById('jl').textContent=location.origin+'/apps.json';
</script>
</body>
</html>`;
}

// ─── HTTP Server ───
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // JSON endpoint
    if (req.url === '/apps.json') {
        if (!sideStoreData) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No data available' }));
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

    // Stats API
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: sideStoreData ? sideStoreData.apps.length : 0 }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log('');
    console.log('  SideStore IPA Server Running! 🚀');
    console.log('  ─────────────────────────────────');
    console.log(`  Admin:  http://localhost:${PORT}/`);
    console.log(`  JSON:   http://localhost:${PORT}/apps.json`);
    console.log(`  Apps:   ${sideStoreData ? sideStoreData.apps.length : 0}`);
    console.log('');
});
