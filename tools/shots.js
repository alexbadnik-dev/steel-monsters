// Скриншоты для магазинов (RuStore, Play, AppGallery) и для манифеста.
// Запуск: node tools/shots.js   → media/screens/*.png (1280×720, с мобильным управлением)
// Бой играет бот на настоящем коде игры: кружит, уворачивается, стреляет.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const D = __dirname + '/../media/screens';

const BOT = `
  joy.id = 77; joy.bx = toWorld(120); joy.by = H - toWorld(110); joy.dx = 0; joy.dy = 0;
  fireTouch.id = 99; mouse.used = false;
  if(window.__bot) clearInterval(window.__bot);
  let side = 1, flip = 2;
  window.__bot = setInterval(() => {
    if(state.mode !== 'play') return;
    const tgt = boss || enemies.filter(e => !e.entering)[0];
    let gx = 0, gy = 0;
    if(tgt){
      const a = angTo(tgt.x, tgt.y, player.x, player.y), d = dist(tgt.x, tgt.y, player.x, player.y);
      gx = Math.cos(a + side*Math.PI/2) + Math.cos(a)*(300 - d)/120;
      gy = Math.sin(a + side*Math.PI/2) + Math.sin(a)*(300 - d)/120;
    }
    const near = pickups.reduce((a, p) => { const d = dist(p.x, p.y, player.x, player.y); return d < 260 && (!a || d < a.d) ? { p, d } : a; }, null);
    if(near){ gx = near.p.x - player.x; gy = near.p.y - player.y; }
    for(const bl of bullets){
      if(bl.from === 'p') continue;
      const dx = player.x - bl.x, dy = player.y - bl.y, d = Math.hypot(dx, dy);
      if(d > 140) continue;
      const v = Math.hypot(bl.vx, bl.vy) || 1;
      if((dx*bl.vx + dy*bl.vy)/(d*v) > 0.8){ gx += -bl.vy/v*side*2; gy += bl.vx/v*side*2; }
    }
    const m = 70;
    if(player.x < m) gx += 2; if(player.x > W - m) gx -= 2;
    if(player.y < m) gy += 2; if(player.y > H - m) gy -= 2;
    flip -= 0.033; if(flip <= 0){ side = -side; flip = 1.5 + Math.random()*2; }
    const gl = Math.hypot(gx, gy) || 1;
    joy.dx = gx/gl*toWorld(54); joy.dy = gy/gl*toWorld(54);
  }, 33);
`;

// из каждой сцены снимаем серию кадров и оставляем самый «живой»:
// врагов в кадре, летящих пуль и взрывов — больше всего
const SHOTS = [
  { file: '1-wave',  wave: 18, score: 1240 },
  { file: '2-boss',  wave: 10, boss: true, score: 980 },
  { file: '3-biome', wave: 34, score: 5400 },
  { file: '4-super', wave: 52, score: 9900, super: true },
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ ...devices['Pixel 7'], viewport: { width: 1024, height: 576 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto('file://' + __dirname + '/../index.html');
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { window.speechSynthesis && (speechSynthesis.speak = () => {}); });

  for(const s of SHOTS){
    await pg.evaluate(({ s, BOT }) => {
      state.mode = 'play'; setOverlay(null);
      resetGame(s.wave);
      if(s.boss){ enemies = []; state.wave = s.wave; spawnBoss(); }
      if(s.super) player.superCharge = 1;
      if(s.score) state.score = s.score;
      $('shareBtn').hidden = true; // кнопка шеринга осталась от прошлой сцены
      eval(BOT);
    }, { s, BOT });
    await pg.waitForTimeout(1200);
    let best = -1, bestN = null;
    for(let i = 0; i < 26; i++){
      const n = await pg.evaluate(() => ({
        e: enemies.filter(x => !x.entering).length, b: bullets.length, p: particles.length,
        boss: !!(boss && !boss.entering), play: state.mode === 'play'
      }));
      const m = n.play ? n.e*2 + n.b + n.p*0.02 + (n.boss ? 8 : 0) : -1;
      if(m > best){ best = m; bestN = n; await pg.screenshot({ path: `${D}/${s.file}.png` }); }
      await pg.waitForTimeout(420);
    }
    console.log(s.file, '— волна', s.wave, '· врагов', bestN.e, '· пуль', bestN.b, '· вес', best.toFixed(1));
  }

  // гараж со скинами
  await pg.evaluate(() => {
    clearInterval(window.__bot); joy.id = null; fireTouch.id = null;
    state.mode = 'menu'; renderShop(); setOverlay('shop');
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `${D}/5-garage.png` });

  // кадр кино-главы
  await pg.evaluate(() => {
    setOverlay(null);
    startStory(STORY.bosses[0], () => {}, { bossDef: BOSS_DEFS[0], bossNum: 1 });
  });
  await pg.evaluate(() => { story.t = 4.2; $('shareBtn').hidden = true; });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${D}/6-story.png` });

  console.log('ошибки:', errs.filter(e => !/ServiceWorker/.test(e)));
  await b.close();
})();
