// Картинки для вкладки «Оформление» в кабинете ВК.
// Запуск: node tools/vk-art.js   → ВК/оформление/*.png
//   большой сниппет  1120×630
//   скриншоты        1200×600, минимум три, ВК показывает их на экране запуска в вебе
// Снимаем с настоящей игры, как tools/shots.js, но в НАСТОЛЬНОМ режиме: без эмуляции
// телефона, иначе поверх боя рисуются джойстик и кнопка огня, а ВК просит десктопный вид.
// Боем правит бот: кружит вокруг цели, подбирает ящики, уворачивается от пуль.
const { chromium, LAUNCH } = require('./pw');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'ВК', 'оформление');
fs.mkdirSync(OUT, { recursive: true });

// на компьютере башня смотрит в курсор, а огонь — на зажатой кнопке мыши,
// поэтому бот не только ездит (joy), но и водит курсором (mouse)
const BOT = `
  joy.id = 77; joy.bx = toWorld(120); joy.by = H - toWorld(110); joy.dx = 0; joy.dy = 0;
  mouse.used = true; mouse.down = true;
  if(window.__bot) clearInterval(window.__bot);
  let side = 1, flip = 2;
  window.__bot = setInterval(() => {
    if(state.mode !== 'play') return;
    const tgt = boss || enemies.filter(e => !e.entering)[0];
    let gx = 0, gy = 0;
    if(tgt){
      mouse.x = tgt.x; mouse.y = tgt.y;
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
const BATTLES = [
  { file: 'screen-1-wave',  wave: 18, score: 1240 },
  { file: 'screen-2-boss',  wave: 10, boss: true, score: 980 },
  { file: 'screen-3-biome', wave: 34, score: 5400 },
  { file: 'screen-4-super', wave: 52, score: 9900, super: true },
];

async function shootScene(pg, s, file){
  await pg.evaluate(({ s, BOT }) => {
    state.mode = 'play'; setOverlay(null);
    resetGame(s.wave);
    if(s.boss){ enemies = []; state.wave = s.wave; spawnBoss(); }
    if(s.super) player.superCharge = 1;
    if(s.score) state.score = s.score;
    const sb = document.getElementById('shareBtn'); if(sb) sb.hidden = true;
    eval(BOT);
  }, { s, BOT });
  await pg.waitForTimeout(1200);
  let best = -1, bestN = null;
  for(let i = 0; i < 22; i++){
    const n = await pg.evaluate(() => ({
      e: enemies.filter(x => !x.entering).length, b: bullets.length, p: particles.length,
      boss: !!(boss && !boss.entering), play: state.mode === 'play'
    }));
    const m = n.play ? n.e*2 + n.b + n.p*0.02 + (n.boss ? 8 : 0) : -1;
    if(m > best){ best = m; bestN = n; await pg.screenshot({ path: file }); }
    await pg.waitForTimeout(420);
  }
  return { best, bestN };
}

async function openPage(b, width, height){
  const pg = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  pg.on('pageerror', e => { if(!/ServiceWorker/.test(e.message)) console.log('ОШИБКА СТРАНИЦЫ:', e.message); });
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' })); // Supabase не дёргаем
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/'));
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { window.speechSynthesis && (speechSynthesis.speak = () => {}); });
  return pg;
}

// `node tools/vk-art.js snippet` — пересобрать только сниппет, не гоняя все скриншоты
const ONLY = process.argv[2] || '';

(async () => {
  const b = await chromium.launch(LAUNCH);

  // ——— скриншоты 1200×600
  if(ONLY !== 'snippet'){
  const pg = await openPage(b, 1200, 600);
  for(const s of BATTLES){
    const file = path.join(OUT, s.file + '.png');
    const { best, bestN } = await shootScene(pg, s, file);
    console.log(`${s.file}  волна ${s.wave} · врагов ${bestN.e} · пуль ${bestN.b} · вес ${best.toFixed(1)}`);
  }
  // гараж со скинами — показывает, что в игре есть что открывать
  await pg.evaluate(() => {
    clearInterval(window.__bot); joy.id = null; fireTouch.id = null; mouse.down = false;
    state.mode = 'menu'; renderShop(); setOverlay('shop');
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: path.join(OUT, 'screen-5-garage.png') });
  console.log('screen-5-garage  гараж');
  await pg.close();
  }

  // ——— большой сниппет 1120×630: кадр боя с названием поверх, как обложка на Яндексе
  const pg2 = await openPage(b, 1120, 630);
  const snip = path.join(OUT, 'snippet-1120x630.png');
  // накладку вешаем ДО съёмки: она статична, а бой под ней продолжает жить,
  // и цикл «лучшего кадра» снимает её вместе с боем
  await pg2.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;display:flex;'
      + 'flex-direction:column;align-items:center;justify-content:center;'
      + 'background:radial-gradient(ellipse at center,rgba(0,0,0,.34),rgba(0,0,0,.66))';
    d.innerHTML = '<div style="font-family:\'Russo One\',system-ui,sans-serif;font-size:88px;'
      + 'letter-spacing:12px;color:#f1c40f;text-shadow:0 6px 0 rgba(0,0,0,.6)">ЖЕСТЯНКИ</div>'
      + '<div style="font-family:\'Russo One\',system-ui,sans-serif;font-size:26px;'
      + 'color:#e8efe9;margin-top:18px;text-shadow:0 3px 0 rgba(0,0,0,.6)">'
      + '100 волн · 10 боссов · ни одного перекура</div>';
    document.body.appendChild(d);
  });
  const r = await shootScene(pg2, { wave: 24, score: 3400 }, snip);
  console.log(`snippet-1120x630  волна 24 · врагов ${r.bestN.e} · пуль ${r.bestN.b} · вес ${r.best.toFixed(1)}`);
  await pg2.close();

  await b.close();
})();
