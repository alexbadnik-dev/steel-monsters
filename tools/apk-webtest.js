// Проверка того, что лежит ВНУТРИ APK: игра отдаётся с адреса appassets.androidplatform.net,
// шрифты свои, сервис-воркера нет, интернета нет (как в самолёте).
// Запуск: node tools/apk-webtest.js
const { chromium, devices, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path'), os = require('os');
// куда класть скриншоты: SHOTS=<папка> node tools/apk-webtest.js, иначе временная папка
const SHOTS = process.env.SHOTS || os.tmpdir();
const ROOT = path.join(__dirname, '..', 'android', 'build', 'assets');
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
  '.png':'image/png', '.woff2':'font/woff2', '.webmanifest':'application/json', '.txt':'text/plain' };

(async () => {
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage({ ...devices['Pixel 7'], viewport: { width: 1024, height: 576 } });
  const log = [], net = [];
  pg.on('pageerror', e => log.push('ОШИБКА: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') log.push('консоль: ' + m.text()); });

  await pg.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'appassets.androidplatform.net') {
      let p = u.pathname.replace(/^\//, '') || 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream',
                             body: fs.readFileSync(f) });
    }
    net.push(u.hostname);                 // всё остальное — «самолётный режим»
    return route.abort('internetdisconnected');
  });

  await pg.goto('https://appassets.androidplatform.net/index.html?platform=app');
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);

  const info = await pg.evaluate(() => ({
    platform: PLATFORM, bundled: BUNDLED, title: document.title,
    h1: document.querySelector('#menu h1').textContent.trim(),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    swRegs: 'будет проверено отдельно',
    russo: document.fonts.check('16px "Russo One"'),
    press: document.fonts.check('16px "Press Start 2P"'),
    ls: (() => { try { localStorage.setItem('t', '1'); return localStorage.getItem('t') === '1'; } catch (e) { return false; } })(),
    online: onlineEnabled()
  }));
  info.swRegs = (await pg.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : -1));

  await pg.screenshot({ path: path.join(SHOTS, 'apk-menu.png') });

  // бой: заводим игру и играем ботом
  await pg.evaluate(() => { state.mode = 'play'; setOverlay(null); resetGame(12); fireTouch.id = 99; });
  await pg.waitForTimeout(6000);
  const fight = await pg.evaluate(() => ({ mode: state.mode, wave: state.wave,
    hp: Math.round(player.hp), enemies: enemies.length, score: state.score }));
  await pg.screenshot({ path: path.join(SHOTS, 'apk-fight.png') });

  // сохранение прогресса переживает перезагрузку?
  await pg.evaluate(() => { profile.coins = 777; saveProfile(); });
  await pg.reload();
  await pg.waitForTimeout(1200);
  const after = await pg.evaluate(() => ({ coins: profile.coins }));


  // --- проверяем JS-вставку из MainActivity.java (та самая, что внедряется в APK)
  const java = fs.readFileSync(path.join(__dirname, '..', 'android', 'java', 'com', 'okakgames', 'zhestyanki', 'MainActivity.java'), 'utf8');
  const block = java.split('SHARE_SHIM =')[1].split(';\n')[0];
  const shim = (block.match(/"(?:[^"\\]|\\.)*"/g) || []).map(x => JSON.parse(x)).join('');
  const shimOut = await pg.evaluate(async code => {
    window.__shared = null;
    window.AndroidApp = { share: function (t, b) { window.__shared = { text: t, bytes: b.length }; } };
    eval(code);
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const file = new File([blob], 'x.png', { type: 'image/png' });
    const can = navigator.canShare && navigator.canShare({ files: [file] });
    await navigator.share({ files: [file], text: 'тест' });
    let fs2 = 'ok';
    try { await document.documentElement.requestFullscreen(); } catch (e) { fs2 = 'ошибка: ' + e.message; }
    return { canShare: can, shared: window.__shared, fullscreenNoop: fs2, inFullscreen: !!document.fullscreenElement };
  }, shim);
  console.log('ВСТАВКА ДЛЯ APK:', JSON.stringify(shimOut));

  console.log('ВНУТРИ APK:', JSON.stringify(info, null, 1));
  console.log('БОЙ:', JSON.stringify(fight));
  console.log('ПОСЛЕ ПЕРЕЗАГРУЗКИ: монет', after.coins, '(ждём 777)');
  console.log('запросы наружу:', [...new Set(net)].join(', ') || 'нет');
  console.log('ошибки:', log.length ? log : 'нет');
  await b.close();
})();
