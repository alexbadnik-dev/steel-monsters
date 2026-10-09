// Проверка анимированной иконки для ВК: прогоняем launch-icon.json настоящим
// проигрывателем lottie-web и снимаем четыре кадра петли.
// Запуск: node tools/vk-lottie-check.js   → tools/lottie-check.png (полоса из кадров)
// Нужно затем, что ВК молча не примет кривой JSON, а глазами по тексту это не увидеть.
const { chromium, LAUNCH } = require('./pw');
const path = require('path');
const fs = require('fs');

// Можно передать несколько файлов — каждый ляжет своей строкой, удобно сравнивать варианты:
//   node tools/vk-lottie-check.js a.json b.json c.json
const FILES = process.argv.slice(2);
if(!FILES.length) FILES.push(path.join(__dirname, '..', 'ВК', 'оформление', 'launch-icon.json'));
const PLAYER = path.join(__dirname, '..', 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js');
const KADROV = 6; // столько моментов петли показываем в строке

(async () => {
  const anims = FILES.map(f => ({ name: path.basename(f, '.json'), data: fs.readFileSync(f, 'utf8') }));
  const player = fs.readFileSync(PLAYER, 'utf8');

  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage({
    viewport: { width: KADROV * 96 + 150, height: anims.length * 96 }, deviceScaleFactor: 2
  });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));

  // фон ставим тот же, что пойдёт в поле «Цвет фона за иконкой» — проверяем заодно и его
  await pg.setContent('<body style="margin:0;background:#181D23;font:13px system-ui;color:#8fa">'
    + anims.map((a, r) => '<div style="display:flex;align-items:center">'
        + [...Array(KADROV)].map((_, i) => `<div id="c${r}_${i}" style="width:96px;height:96px"></div>`).join('')
        + `<div style="padding-left:14px">${a.name}</div></div>`).join('')
    + '</body>');
  await pg.addScriptTag({ content: player });
  const got = await pg.evaluate(({ anims, KADROV }) => {
    let figur = 0;
    anims.forEach((a, r) => {
      const data = JSON.parse(a.data);
      for(let i = 0; i < KADROV; i++){
        const an = lottie.loadAnimation({
          container: document.getElementById(`c${r}_${i}`), renderer: 'svg',
          loop: false, autoplay: false, animationData: JSON.parse(a.data)
        });
        an.goToAndStop(Math.round(data.op * i / KADROV), true);
      }
    });
    figur = document.querySelectorAll('svg path, svg ellipse, svg rect').length;
    return { svgs: document.querySelectorAll('svg').length, figur };
  }, { anims, KADROV });
  await pg.waitForTimeout(600);

  const out = path.join(__dirname, 'lottie-check.png');
  await pg.screenshot({ path: out });
  await b.close();

  console.log('строк:', anims.length, '· отрисовано svg:', got.svgs, '· фигур внутри:', got.figur);
  console.log('ошибки:', errs.length ? errs : 'нет');
  console.log('картинка:', out);
  if(got.svgs !== anims.length * KADROV || got.figur === 0){
    console.log('ПЛОХО: проигрыватель не собрал анимацию'); process.exit(1);
  }
})();
