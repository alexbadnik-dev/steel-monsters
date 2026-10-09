// Демонстрация текущих заставок: режиссёрская версия, выбранный скин игрока,
// каждая глава — на земле своего биома и со своим генералом.
// Запуск: node tools/story-demo.js <скин> <глава> [глава ...]
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const D = path.join(__dirname, 'cmp');
const SKIN = process.argv[2] || 'gorynych';
const CHAPTERS = process.argv.slice(3).map(Number).filter(Boolean);

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
  await pg.evaluate(skin => {
    window.speechSynthesis && (speechSynthesis.speak = () => {});
    profile.equipped = skin; saveProfile();
    STORY_DIRECTOR = true; STORY_FG = true;
    const d = document.createElement('div');
    d.id = 'cmpLabel';
    d.style.cssText = 'position:fixed;left:18px;top:16px;z-index:999;padding:6px 14px;' +
      'background:rgba(0,0,0,.55);color:#f1c40f;font:bold 22px "Russo One",sans-serif;border-radius:8px';
    document.body.append(d);
  }, SKIN);

  for (const ch of CHAPTERS) {
    await pg.evaluate(ch => {
      const bd = BOSS_DEFS[ch - 1], bi = BIOMES[(ch - 1) % BIOMES.length];
      document.getElementById('cmpLabel').textContent =
        'Глава ' + ch + ' · ' + bd.name + ' · ' + (bi.name || '');
      state.mode = 'menu'; setOverlay(null);
      startStory(STORY.bosses[ch - 1], () => {}, { bossDef: bd, bossNum: ch });
      const sb = document.getElementById('shareBtn'); if (sb) sb.hidden = true;
    }, ch);
    await pg.waitForTimeout(11500);
    console.log('глава', ch, '— снята');
  }

  const video = pg.video();
  await ctx.close();
  fs.renameSync(await video.path(), path.join(D, 'zastavki-demo.webm'));
  console.log('ошибки:', errs.filter(e => !/ServiceWorker/.test(e)));
  await b.close();
})();
