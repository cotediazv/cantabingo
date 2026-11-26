// Renders the flyer (post 1080x1350 and story 1080x1920) from ' + (process.env.T || 'flyer.html') + ' with a local file server
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const D = __dirname;
const srv = http.createServer((q, r) => { const f = path.join(D, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(b); }); }).listen(3460);
const JOBS = JSON.parse(fs.readFileSync(path.join(D, 'jobs.json'), 'utf8'));
(async () => {
  const b = await chromium.launch();
  for (const j of JOBS) {
    for (const f of ['post', 'historia']) {
      const H = f === 'historia' ? 1920 : 1350;
      const p = await b.newPage({ viewport: { width: 1080, height: H } });
      const qs = new URLSearchParams({ ...j.q, f }).toString();
      await p.goto(`http://localhost:3460/${process.env.T || 'flyer.html'}?${qs}`);
      await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
      const over = await p.evaluate(() => { const c = document.querySelector('.caja'); return c.scrollHeight - c.clientHeight; });
      const out = path.join(D, `${j.name}${process.env.SUF || ''}-${f}.png`);
      await p.screenshot({ path: out });
      console.log('saved', out, 'sobra/falta', over);
      await p.close();
    }
  }
  await b.close(); srv.close();
})();
