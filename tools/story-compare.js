// Три версии одной главы подряд: как было → режиссура → режиссура + передний план
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const D = __dirname + '/cmp';
const FPS = 25, DUR = 11;
const VARIANTS = [
  { id: 'v1', dir: false, fg: false, label: '1 · КАК БЫЛО' },
  { id: 'v2', dir: true,  fg: false, label: '2 · ТРИ ПЛАНА' },
  { id: 'v3', dir: true,  fg: true,  label: '3 · + ПЕРЕДНИЙ ПЛАН' },
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto('file:///home/user/steel-monsters/index.html');
  await pg.waitForTimeout(800);
  for (const v of VARIANTS) {
    fs.mkdirSync(`${D}/${v.id}`, { recursive: true });
    await pg.evaluate(cfg => {
      STORY_DIRECTOR = cfg.dir; STORY_FG = cfg.fg;
      state.mode = 'menu'; setOverlay(null);
      startStory(STORY.bosses[0], () => {}, { bossDef: BOSS_DEFS[0], bossNum: 1 });
      document.getElementById('shareBtn').hidden = true;
    }, v);
    for (let i = 0; i < FPS*DUR; i++) {
      const url = await pg.evaluate(a => {
        story.t = a.t; state.time = a.t;
        render();
        const c = canvas.getContext('2d');
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);     // подпись версии — поверх кадра
        c.font = 'bold 26px "Russo One", sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(16, 14, c.measureText(a.label).width + 24, 38);
        c.fillStyle = '#f1c40f'; c.fillText(a.label, 28, 20);
        c.restore();
        return canvas.toDataURL('image/png');
      }, { t: i/FPS, label: v.label });
      fs.writeFileSync(`${D}/${v.id}/f${String(i).padStart(4,'0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(v.id, 'снят');
  }
  console.log('ошибки:', errs.filter(e => !e.includes('ServiceWorker')));
  await b.close();
})();
