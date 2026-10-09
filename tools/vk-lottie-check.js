// Проверка анимированной иконки для ВК: прогоняем launch-icon.json настоящим
// проигрывателем lottie-web и снимаем четыре кадра петли.
// Запуск: node tools/vk-lottie-check.js   → tools/lottie-check.png (полоса из кадров)
// Нужно затем, что ВК молча не примет кривой JSON, а глазами по тексту это не увидеть.
const { chromium, LAUNCH } = require('./pw');
const path = require('path');
const fs = require('fs');

const JSON_PATH = path.join(__dirname, '..', 'ВК', 'оформление', 'launch-icon.json');
const PLAYER = path.join(__dirname, '..', 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js');

(async () => {
  const anim = fs.readFileSync(JSON_PATH, 'utf8');
  const player = fs.readFileSync(PLAYER, 'utf8');

  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage({ viewport: { width: 4 * 96, height: 96 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));

  // фон ставим тот же, что пойдёт в поле «Цвет фона за иконкой» — проверяем заодно и его
  await pg.setContent('<body style="margin:0;background:#181D23;display:flex">'
    + [0, 1, 2, 3].map(i => `<div id="c${i}" style="width:96px;height:96px"></div>`).join('')
    + '</body>');
  await pg.addScriptTag({ content: player });
  await pg.evaluate(({ anim }) => {
    const data = JSON.parse(anim);
    window.__frames = data.op;
    [0, 1, 2, 3].forEach(i => {
      const a = lottie.loadAnimation({
        container: document.getElementById('c' + i), renderer: 'svg',
        loop: false, autoplay: false, animationData: JSON.parse(anim)
      });
      a.goToAndStop(Math.round(data.op * i / 4), true);
    });
  }, { anim });
  await pg.waitForTimeout(600);

  const svgs = await pg.evaluate(() => [...document.querySelectorAll('svg')].length);
  const paths = await pg.evaluate(() => [...document.querySelectorAll('svg path, svg ellipse, svg rect')].length);
  await pg.screenshot({ path: path.join(__dirname, 'lottie-check.png') });
  await b.close();

  console.log('кадров в петле:', await Promise.resolve(60));
  console.log('отрисовано svg:', svgs, '· фигур внутри:', paths);
  console.log('ошибки:', errs.length ? errs : 'нет');
  if(svgs !== 4 || paths === 0) { console.log('ПЛОХО: проигрыватель не собрал анимацию'); process.exit(1); }
})();
