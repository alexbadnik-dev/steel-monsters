// Запись сравнения заставок одним роликом: как было → три плана → + передний план.
// Пишет видео сам браузер (Playwright recordVideo) — кадры собирать не нужно.
// Запуск: node tools/story-video.js [номер главы, с 1]
const { chromium, LAUNCH } = require('./pw');
const INDEX = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
const fs = require('fs'), path = require('path');
const CH = Math.max(1, +(process.argv[2] || 1));      // глава (1 — Железный Кулак)
const D = path.join(__dirname, 'cmp');
const DUR = 11500;                                     // сколько длится одна заставка, мс
const VARIANTS = [
  { dir: false, fg: false, label: '1 · КАК БЫЛО' },
  { dir: true,  fg: false, label: '2 · ТРИ ПЛАНА' },
  { dir: true,  fg: true,  label: '3 · + ПЕРЕДНИЙ ПЛАН' },
];

(async () => {
  fs.mkdirSync(D, { recursive: true });
  const b = await chromium.launch(LAUNCH);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 },
    recordVideo: { dir: D, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX);
  await pg.waitForTimeout(1200);

  await pg.evaluate(() => {                            // подпись версии поверх кадра
    const d = document.createElement('div');
    d.id = 'cmpLabel';
    d.style.cssText = 'position:fixed;left:18px;top:16px;z-index:999;padding:6px 14px;' +
      'background:rgba(0,0,0,.55);color:#f1c40f;font:bold 24px "Russo One",sans-serif;border-radius:8px';
    document.body.append(d);
    window.speechSynthesis && (speechSynthesis.speak = () => {});
  });

  for (const v of VARIANTS) {
    await pg.evaluate(a => {
      STORY_DIRECTOR = a.dir; STORY_FG = a.fg;
      document.getElementById('cmpLabel').textContent = a.label;
      state.mode = 'menu'; setOverlay(null);
      startStory(STORY.bosses[a.ch - 1], () => {}, { bossDef: BOSS_DEFS[a.ch - 1], bossNum: a.ch });
      const sb = document.getElementById('shareBtn'); if (sb) sb.hidden = true;
    }, { ...v, ch: CH });
    await pg.waitForTimeout(DUR);
    console.log(v.label, '— снято');
  }

  const video = pg.video();
  await ctx.close();
  const src = await video.path();
  const out = path.join(D, 'zastavki-glava' + CH + '.webm');
  fs.renameSync(src, out);
  console.log('готово:', out);
  console.log('ошибки:', errs.filter(e => !/ServiceWorker/.test(e)));
  await b.close();
})();
