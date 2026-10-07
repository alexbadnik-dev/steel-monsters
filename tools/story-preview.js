const { chromium, LAUNCH } = require('./pw');
const INDEX = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;  // адрес игры рядом с инструментом
const D = __dirname + '/ch1';
(async () => {
  const b = await chromium.launch(LAUNCH);
  // --- кадры по планам
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX);
  await pg.waitForTimeout(700);
  await pg.evaluate(() => {
    state.mode = 'menu'; setOverlay(null);
    startStory(STORY.bosses[0], () => {}, { bossDef: BOSS_DEFS[0], bossNum: 1 });
  });
  for (const t of [0.8, 1.9, 2.65, 3.6, 5.2, 5.85, 7.5, 10]) {
    await pg.evaluate(v => { story.t = v; }, t);
    await pg.waitForTimeout(60);
    await pg.screenshot({ path: `${D}/t${String(t).replace('.', '_')}.png` });
  }
  console.log('ошибки:', errs.filter(e => !e.includes('ServiceWorker')));
  await pg.close();
  // --- видео главы в реальном времени
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: D + '/vid', size: { width: 1280, height: 720 } } });
  const p2 = await ctx.newPage();
  await p2.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await p2.goto(INDEX);
  await p2.waitForTimeout(900);
  await p2.evaluate(() => {
    state.mode = 'menu'; setOverlay(null);
    startStory(STORY.bosses[0], () => {}, { bossDef: BOSS_DEFS[0], bossNum: 1 });
  });
  await p2.waitForTimeout(13000);
  await p2.close();
  await ctx.close();
  await b.close();
})();
