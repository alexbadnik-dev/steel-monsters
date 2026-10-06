// Два листа 1024×1024: корпуса и башни (8×8 клеток по 128 px) — для Roblox (ImageRectOffset)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/user/steel-monsters/roblox-kit/sheets';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto('file:///home/user/steel-monsters/index.html');
  await pg.waitForTimeout(800);
  const res = await pg.evaluate(() => {
    const CELL = 128, COLS = 8;
    const list = [];
    for (const s of SKINS) list.push({ key: 'skin:' + s.id, hull: s.hull, dark: s.dark, fx: s.fx || {}, angry: false, sc: 1.35 });
    for (const [id, T] of Object.entries(ETYPES)) list.push({ key: 'enemy:' + id, hull: T.color, dark: T.dark, fx: T.fx || {}, angry: id !== 'medic', sc: 1.35 });
    BOSS_DEFS.forEach((d, i) => list.push({ key: 'boss:' + (i + 1), hull: d.hull, dark: d.dark, fx: d.fx || {}, angry: true, sc: 1.35 }));
    const out = {};
    for (const layer of ['hull', 'turret']) {
      const cv = document.createElement('canvas'); cv.width = cv.height = CELL * COLS;
      const c = cv.getContext('2d');
      list.forEach((it, i) => {
        const cx = (i % COLS) * CELL + CELL / 2, cy = Math.floor(i / COLS) * CELL + CELL / 2;
        drawTank({ x: cx, y: cy, hull: -Math.PI / 2, turret: -Math.PI / 2, blink: 0, trackPhase: 0 },
                 { hullColor: it.hull, darkColor: it.dark, scale: it.sc, angry: it.angry, fx: it.fx, layer }, c);
      });
      out[layer] = cv.toDataURL();
    }
    return { out, keys: list.map(x => x.key) };
  });
  for (const [k, url] of Object.entries(res.out)) fs.writeFileSync(`${OUT}/tanks_${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/cells.json`, JSON.stringify(res.keys));
  console.log('клеток:', res.keys.length, errs.filter(e => !e.includes('ServiceWorker')));
  await b.close();
})();
