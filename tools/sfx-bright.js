// Три степени яркости выстрела 8-бит. В каждом файле: два одиночных, пауза, очередь из пяти.
// Общее для всех: атака 6 мс, крутой спад, мягкий ограничитель. Разное: тактирование шума,
// высота импульса и где срезан верх. Слайд («пиу») оставлен везде.
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUT = path.join(__dirname, 'sfx-ab');
const SR = 48000;

const V = {
  'A-YARKIJ':  { hz: 15000, dur: 0.07, pf: 700, pd: 0.07, lp: 16000 },
  'B-SREDNIJ': { hz: 13000, dur: 0.08, pf: 620, pd: 0.08, lp: 14000 },
  'C-MYAGKIJ': { hz: 11000, dur: 0.09, pf: 520, pd: 0.09, lp: 12000 },
};

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

  for (const [name, p] of Object.entries(V)) {
    const raw = await pg.evaluate(async p => {
      AC = new OfflineAudioContext(1, Math.round(48000*3.2), 48000);
      soundOn = true;
      const lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=p.lp; lp.Q.value=0.7;
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value=-18; comp.knee.value=12; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.12;
      lp.connect(comp); comp.connect(AC.destination);
      const env = (g, t0, dur, vol) => {
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
        const steps = Math.round(dur*60);
        for(let i=0;i<steps;i++){ const k=i/steps;
          g.gain.setValueAtTime(vol*Math.round(15*Math.pow(1-k,2.2))/15, Math.max(t0+0.006, t0+i/60)); }
        g.gain.setValueAtTime(0, t0+dur);
      };
      const shot = t0 => {
        const s = AC.createBufferSource(); s.buffer = nesNoiseBuf(false); s.loop = true;
        const steps = Math.round(p.dur*60);
        for(let i=0;i<steps;i++){ const k=i/steps;
          s.playbackRate.setValueAtTime(p.hz*Math.pow(0.12, k)/AC.sampleRate, t0+i/60); } // съезд вниз
        const g1 = AC.createGain(); env(g1, t0, p.dur, 0.11);
        s.connect(g1); g1.connect(lp); s.start(t0); s.stop(t0+p.dur+0.05);
        const o = AC.createOscillator(); o.setPeriodicWave(nesWave(0.25));
        const st2 = Math.round(p.pd*60);
        for(let i=0;i<st2;i++){ const k=i/st2;
          o.frequency.setValueAtTime(Math.max(40, p.pf*Math.pow(0.3, k)), t0+i/60); }   // «пиу»
        const g2 = AC.createGain(); env(g2, t0, p.pd, 0.085);
        o.connect(g2); g2.connect(lp); o.start(t0); o.stop(t0+p.pd+0.05);
      };
      shot(0); shot(0.45);                       // два одиночных
      for(let i=0;i<5;i++) shot(1.3 + i*0.11);   // очередь
      const buf = await AC.startRendering();
      return Array.from(buf.getChannelData(0));
    }, p);
    fs.writeFileSync(path.join(OUT, 'vystrel-' + name + '.wav'), wav(Float32Array.from(raw), SR));
    console.log(name, '- готово');
  }
  await b.close();
})();
