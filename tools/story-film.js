// Покадровая съёмка главы: точный тайминг, чистый кадр (только холст, без кнопок)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const D = __dirname + '/ch1f';
const FPS = 25, DUR = 11;
function wav(samples, sr){
  const b = Buffer.alloc(44 + samples.length*2);
  b.write('RIFF',0); b.writeUInt32LE(36+samples.length*2,4); b.write('WAVE',8); b.write('fmt ',12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24);
  b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36);
  b.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i]*32767*2.5))), 44+i*2);
  return b;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto('file:///home/user/steel-monsters/index.html');
  await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    state.mode = 'menu'; setOverlay(null);
    startStory(STORY.bosses[0], () => {}, { bossDef: BOSS_DEFS[0], bossNum: 1 });
    document.getElementById('shareBtn').hidden = true;   // в превью кнопки не нужны
  });
  for (let i = 0; i < FPS*DUR; i++) {
    const t = i / FPS;
    const url = await pg.evaluate(v => {
      story.t = v; state.time = v;      // время идёт ровно по кадрам
      render();
      return canvas.toDataURL('image/png');
    }, t);
    fs.writeFileSync(`${D}/frames/f${String(i).padStart(4,'0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('кадров:', FPS*DUR, 'ошибки:', errs.filter(e => !e.includes('ServiceWorker')));
  await b.close();
})();
