// Экспорт спрайтов и данных игры для Roblox-пакета (рисует настоящим кодом игры)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const OUT = '/home/user/steel-monsters/roblox-kit';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto('file:///home/user/steel-monsters/index.html');
  await pg.waitForTimeout(800);
  const res = await pg.evaluate(() => {
    const files = {};
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const up = { hull: -Math.PI/2, turret: -Math.PI/2, blink: 0, trackPhase: 0 };
    // танки игрока (вид сверху, ствол вверх)
    for (const s of SKINS) {
      const c = cv(160, 160);
      drawTank({ x: 80, y: 86, ...up }, { hullColor: s.hull, darkColor: s.dark, scale: 1.7, fx: s.fx || {} }, c.getContext('2d'));
      files['sprites/player/' + s.id + '.png'] = c.toDataURL();
    }
    for (const [id, T] of Object.entries(ETYPES)) {
      const c = cv(160, 160);
      drawTank({ x: 80, y: 86, ...up }, { hullColor: T.color, darkColor: T.dark, scale: 1.7, angry: id !== 'medic', fx: T.fx || {} }, c.getContext('2d'));
      files['sprites/enemies/' + id + '.png'] = c.toDataURL();
    }
    BOSS_DEFS.forEach((d, i) => {
      const c = cv(256, 256);
      drawTank({ x: 128, y: 136, ...up }, { hullColor: d.hull, darkColor: d.dark, scale: 2.6, angry: true, fx: d.fx || {} }, c.getContext('2d'));
      files['sprites/bosses/' + (i+1) + '.png'] = c.toDataURL();
      const s2 = cv(360, 220);
      drawTankSide({ x: 180, y: 140, dir: -1, tilt: 0, barrelA: 0.2 }, { ctx: s2.getContext('2d'), hullColor: d.hull, darkColor: d.dark, scale: 1.9, fx: bossSideFx(d) });
      files['sprites/bosses_side/' + (i+1) + '.png'] = s2.toDataURL();
    });
    for (const t of ['med','shield','rapid','triple','freeze','magnet','beam']) {
      const c = cv(96, 104);
      const g = c.getContext('2d'); g.scale(2, 2);
      drawPickup({ x: 24, y: 24, type: t, t: 0.4, still: true }, g);
      files['sprites/pickups/' + t + '.png'] = c.toDataURL();
    }
    { const c = cv(96, 96); const g = c.getContext('2d'); g.scale(3, 3); drawBarrel(g, 16, 16, false, 0); files['sprites/props/barrel.png'] = c.toDataURL(); }
    { const c = cv(96, 96); const g = c.getContext('2d'); g.translate(48, 46); g.scale(3, 3); drawHedge(g, false); files['sprites/props/hedge.png'] = c.toDataURL(); }
    { const c = cv(96, 96); const g = c.getContext('2d'); g.translate(48, 46); g.scale(3, 3); drawHedge(g, true); files['sprites/props/hedge_rusty.png'] = c.toDataURL(); }
    // кадры глав (для экранов загрузки/обложек)
    for (let n = 1; n <= 10; n++) {
      const c = cv(1280, 720);
      const S = n <= 9 ? { finale:false, bossDef: BOSS_DEFS[n-1], bossNum: n } : { finale:true, bossDef:null, bossNum:0 };
      drawStoryScene(c.getContext('2d'), 1280, 720, n <= 9 ? 5.2 : 7.5, S);
      files['scenes/chapter_' + n + '.png'] = c.toDataURL();
    }
    // данные
    const data = {
      classes: CLASSES, diffs: DIFFS, etypes: ETYPES,
      bosses: BOSS_DEFS.map((d, i) => ({ n: i+1, name: d.name, hpMult: d.hpMult || 1, spdMult: d.spdMult || 1, minion: d.minion, dash: !!d.dash, drones: !!d.drones, fan: d.fan || 0, spiral: !!d.spiral })),
      bossHp: [1,2,3,4,5,6,7,8,9,10].map(num => { const d = BOSS_DEFS[num-1]; const grow = 1 + 0.06*Math.min(num-1, 9);
        return Object.fromEntries(Object.entries(DIFFS).map(([k, D]) => [k, Math.round((380 + 240*num + (num === 10 ? 400 : 0)) * grow * (d.hpMult || 1) * D.hp)])); }),
      biomes: BIOMES.map(x => x.name),
      picks: PICKS, upgrades: UPGRADES.map(u => ({ id: u.id, name: u.name, costs: u.costs, lv: [0,1,2,3].map(l => u.desc(l)) })),
      skins: SKINS.map(s => ({ id: s.id, name: s.name, cost: s.cost, lock: s.lock || 0, barrel: (s.fx || {}).barrel || '' })),
      pets: PETS.map(p => ({ id: p.id, name: p.name, cost: p.cost, lock: p.lock, desc: p.desc })),
      waves: [1,5,9,15,25,45,75,99].map(n => ({ n, comp: waveComposition(n), drones: waveDroneCount(n), diff: diffFor(n) })),
      boss: { every: BOSS_EVERY, total: TOTAL_WAVES }
    };
    return { files, data };
  });
  for (const [p, url] of Object.entries(res.files)) {
    const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(OUT, 'game-data.json'), JSON.stringify(res.data, null, 1));
  console.log('файлов:', Object.keys(res.files).length, errs.filter(e => !e.includes('ServiceWorker')));
  await b.close();
})();
