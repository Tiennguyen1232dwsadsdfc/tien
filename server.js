/* Static server cho app Quản Lý Chi Phí Marketing — không cần dependency.
   Kèm endpoint /api/proxy chuyển tiếp request tới API Sandbox (tránh CORS).
   Chạy: node server.js  (Render: Start Command = node server.js) */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

/* Proxy: client POST { base, path, token, data, method } → forward tới API đối tác.
   method: POST (mặc định) hoặc GET — API LayFileGhiAm dùng GET kèm body JSON,
   trình duyệt không gửi được GET có body nên phải đi qua proxy này.
   Chỉ nhận đường dẫn /partner/api/... để không thành open proxy. */
function handleProxy(req, res) {
  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let p;
    try { p = JSON.parse(body || '{}'); } catch { return json(400, { error: 'Body không phải JSON hợp lệ' }); }
    let target;
    try { target = new URL(p.path || '', p.base || 'https://api.sandbox.com.vn'); }
    catch { return json(400, { error: 'Base URL hoặc đường dẫn API không hợp lệ' }); }
    if (target.protocol !== 'https:') return json(400, { error: 'Chỉ hỗ trợ HTTPS' });
    if (!target.pathname.startsWith('/partner/api/')) return json(400, { error: 'Chỉ cho phép đường dẫn /partner/api/...' });

    const method = p.method === 'GET' ? 'GET' : 'POST';
    const reqBody = p.data == null ? '' : JSON.stringify(p.data);
    const headers = { 'Accept': '*/*' };
    if (reqBody) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(reqBody);
    }
    // cURL mẫu của Sandbox dùng JWT thô (không có "Bearer ") — gửi nguyên văn token người dùng dán
    if (p.token) headers['Authorization'] = String(p.token).trim();

    const upstream = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method,
      headers,
    }, up => {
      let out = '';
      up.on('data', c => out += c);
      up.on('end', () => {
        res.writeHead(up.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8' });
        // Trả nguyên văn nếu là JSON, nếu không thì bọc lại để client đọc lỗi được
        try { JSON.parse(out); res.end(out); }
        catch { res.end(JSON.stringify({ error: 'Upstream trả về không phải JSON', raw: out.slice(0, 500) })); }
      });
    });
    upstream.setTimeout(25000, () => upstream.destroy(new Error('Hết thời gian chờ API (25s)')));
    upstream.on('error', err => json(502, { error: 'Không gọi được API: ' + err.message }));
    upstream.end(reqBody);
  });
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && urlPath === '/api/proxy') { handleProxy(req, res); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: đường dẫn lạ trả về index.html
      fs.readFile(path.join(ROOT, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Chi Phí MKT chạy tại http://localhost:${PORT}`));
