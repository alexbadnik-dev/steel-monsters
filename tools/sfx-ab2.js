// Ещё два варианта выстрела: обычный набор (не 8-бит) и 8-бит без «съезда» высоты.
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUT = path.join(__dirname, 'sfx-ab');
function wav(data, sr){
  const n = data.length, out = Buffer.alloc(44 + n*2);
  out.write('RIFF',0); out.writeUInt32LE(36+n*2,4); out.write('WAVE',8);
  out.write('fmt ',12); out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(1,22);
  out.writeUInt32LE(sr,24); out.writeUInt32LE(sr*2,28); out.writeUInt16LE(2,32); out.writeUInt16LE(16,34);
  out.write('data',36); out.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ const v=Math.max(-1,Math.min(1,data[i])); out.writeInt16LE(v<0?v*32768:v*32767, 44+i*2); }
  return out;
}
(async () => {
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage();
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX); await pg.waitForTimeout(1000);

  const variants = {
    // наш обычный набор, как он звучит сегодня
    'obychnyj-nabor': `Object.assign(sfx, sfxStd); for(let i=0;i<5;i++) setTimeout(0);
                       sfxStd.cannon('uni');`,
    // 8-бит, исправленный, но БЕЗ съезда высоты — «чпок» вместо «пиу»
    'bez-slajda': null,
  };

  const renderStd = async () => pg.evaluate(async () => {
    AC = new OfflineAudioContext(1, Math.round(48000*0.8), 48000); soundOn = true;
    Object.assign(sfx, sfxStd); sfx.cannon('uni');
    const buf = await AC.startRendering(); return Array.from(buf.getChannelData(0));
  });
  const renderNoSlide = async () => pg.evaluate(async () => {
    AC = new OfflineAudioContext(1, Math.round(48000*0.8), 48000); soundOn = true;
    const lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=12000;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=12; comp.ratio.value=4; comp.attack.value=0.003;
    lp.connect(comp); comp.connect(AC.destination);
    const env = (g,t0,dur,vol) => {
      g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+0.006);
      const steps = Math.round(dur*60);
      for(let i=0;i<steps;i++){ const k=i/steps;
        g.gain.setValueAtTime(vol*Math.round(15*Math.pow(1-k,2.2))/15, Math.max(t0+0.006,t0+i/60)); }
      g.gain.setValueAtTime(0,t0+dur);
    };
    // шум без съезда + короткий низкий «толчок» без глиссандо
    const t0 = 0;
    const s = AC.createBufferSource(); s.buffer = nesNoiseBuf(false); s.loop = true;
    s.playbackRate.setValueAtTime(11000/AC.sampleRate, t0);
    const g1 = AC.createGain(); env(g1,t0,0.09,0.11); s.connect(g1); g1.connect(lp); s.start(t0); s.stop(0.2);
    const o = AC.createOscillator(); o.setPeriodicWave(nesWave(0.25));
    o.frequency.setValueAtTime(300, t0);                 // ровная высота, без «пиу»
    const g2 = AC.createGain(); env(g2,t0,0.09,0.09); o.connect(g2); g2.connect(lp); o.start(t0); o.stop(0.2);
    const buf = await AC.startRendering(); return Array.from(buf.getChannelData(0));
  });

  fs.writeFileSync(path.join(OUT,'vystrel-OBYCHNYJ-NABOR.wav'), wav(await renderStd(), 48000));
  fs.writeFileSync(path.join(OUT,'vystrel-8bit-BEZ-SLAJDA.wav'), wav(await renderNoSlide(), 48000));
  console.log('готово');
  await b.close();
})();
