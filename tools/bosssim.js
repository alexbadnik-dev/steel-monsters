// Запуск: node tools/bosssim.js file:///home/user/steel-monsters/index.html 5 "$(cat tools/bosssim-grid.json)"
// Вывод: время убийства босса (ttk, без въезда) и «сколько живёт» бот без уворотов-гениев (lives).
// Симулятор боя с боссом на НАСТОЯЩЕМ коде игры: бот кружит, уворачивается, собирает бонусы
const { chromium, devices, LAUNCH } = require('./pw');
const INDEX = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;  // адрес игры рядом с инструментом
const FILE = process.argv[2] || INDEX;
const RUNS = +(process.argv[3] || 4);
(async () => {
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 } });
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(FILE);
  await pg.waitForTimeout(700);
  await pg.evaluate(() => {
    window.speechSynthesis && (speechSynthesis.speak = () => {});
    window.simFight = function(cfg){
      profile.diff = cfg.diff; profile.tank = cfg.cls; profile.equipped = cfg.skin; profile.pet = cfg.pet;
      profile.customColor = null;
      profile.upg = { med:cfg.upg, shield:cfg.upg, rapid:cfg.upg, triple:cfg.upg, freeze:cfg.upg, magnet:cfg.upg, beam:cfg.upg };
      state.mode = 'play'; setOverlay(null);
      resetGame(cfg.wave);
      const realMax = player.maxHp;
      if(cfg.god !== false){ player.maxHp = 1e6; player.hp = 1e6; } // бессмертие: меряем урон, а не смерть
      let lost = 0;
      enemies = []; drones = []; bullets = []; bombs = []; pickups = []; boss = null;
      if(cfg.noDecor) decor = []; else if(cfg.freshDecor) makeScenery();
      state.wave = cfg.wave; spawnBoss();
      const maxHp = boss.maxHp;
      const dt = 1/60; let t = 0, side = 1, flipT = 2, hpMin = player.hp, t0 = null;
      fireTouch.id = 99; joy.id = 77; mouse.used = false;
      while(t < 300){
        // --- бот ---
        let gx, gy;
        const near = pickups.reduce((a, p) => { const d = dist(p.x, p.y, player.x, player.y); return d < 260 && (!a || d < a.d) ? { p, d } : a; }, null);
        if(boss && !boss.entering){
          const a = angTo(boss.x, boss.y, player.x, player.y), d = dist(boss.x, boss.y, player.x, player.y);
          const want = 300;
          gx = Math.cos(a + side*Math.PI/2) + Math.cos(a)*(want - d)/120;
          gy = Math.sin(a + side*Math.PI/2) + Math.sin(a)*(want - d)/120;
        } else { gx = 0; gy = 0; }
        if(near){ gx = near.p.x - player.x; gy = near.p.y - player.y; }
        // уклон от ближайшей летящей в нас пули
        for(const bl of bullets){
          if(bl.from === 'p') continue;
          const dx = player.x - bl.x, dy = player.y - bl.y, d = Math.hypot(dx, dy);
          if(d > 140) continue;
          const v = Math.hypot(bl.vx, bl.vy) || 1;
          if((dx*bl.vx + dy*bl.vy)/(d*v) > 0.8){ gx += -bl.vy/v*side*2; gy += bl.vx/v*side*2; }
        }
        // от стен
        const m = 60;
        if(player.x < m) gx += 2; if(player.x > W - m) gx -= 2;
        if(player.y < m) gy += 2; if(player.y > H - m) gy -= 2;
        flipT -= dt; if(flipT <= 0){ side = -side; flipT = 1.5 + Math.random()*2.5; }
        const gl = Math.hypot(gx, gy) || 1;
        joy.dx = gx/gl*toWorld(54); joy.dy = gy/gl*toWorld(54);
        if(player.superCharge >= 1 && boss && dist(player.x, player.y, boss.x, boss.y) < 340) useSuper();
        const hp0 = player.hp;
        update(dt); t += dt;
        if(boss && cfg.god !== false) lost += hp0 - player.hp; // после победы игра сама пересчитывает HP — не урон
        if(t0 === null && boss && !boss.entering) t0 = t;
        hpMin = Math.min(hpMin, player.hp);
        if(state.mode !== 'play') break;
        if(!boss && state.mode === 'play'){ break; }
      }
      fireTouch.id = null; joy.id = null;
      const res = { win: !boss && state.mode !== 'lose', tAll: Math.round(t*10)/10, hpEnd: Math.round(player.hp/realMax*100), t: Math.round((t - (t0||0))*10)/10, bossHp: maxHp,
                    bossLeft: boss ? Math.round(boss.hp/maxHp*100) : 0,
                    hpLeft: 0, hpMaxP: realMax, dps_in: lost / Math.max(1, t - (t0||0)), realMax };
      state.mode = 'menu'; boss = null; $('bossbarwrap').hidden = true;
      return res;
    };
  });
  const out = [];
  const cfgs = JSON.parse(process.argv[4]);
  for(const c of cfgs){
    const rs = [];
    for(let i = 0; i < RUNS; i++) rs.push(await pg.evaluate(cfg => simFight(cfg), c));
    const wins = rs.filter(r => r.win);
    const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length/2)] : null; };
    out.push({ ...c, bossHp: rs[0].bossHp, win: wins.length + '/' + RUNS,
               ttk: med(wins.map(r => r.t)), hpMax: rs[0].realMax, lives: med(rs.map(r => r.dps_in > 0.1 ? Math.round(r.realMax / r.dps_in) : 999)),
               hpEnd: med(wins.map(r => r.hpEnd)), tAll: med(wins.map(r => r.tAll)),
               lossT: med(rs.filter(r => !r.win).map(r => r.t)), bossLeftOnLoss: med(rs.filter(r => !r.win).map(r => r.bossLeft)) });
    console.error(JSON.stringify(out[out.length-1]));
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
