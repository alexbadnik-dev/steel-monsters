// Рендерит пары WAV «было / стало» для выстрела. Игру НЕ трогает: новые генераторы
// подставляются в странице на лету, чтобы послушать до того, как это попадёт в код.
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUT = path.join(__dirname, 'sfx-ab');

// Правки по результатам замера образцов Battle City:
//   спад 0.16 с → ~0.03 с (в оригинале 0.011 с) — главная причина резкости;
//   низа 15% → ближе к 25% (в оригинале есть «тело» под выстрелом);
//   выше 16 кГц у оригинала ноль, у нас 3% — срезаем.
const PATCH = `
(function(){
  window.__master = null;
  function master(){                       // одна шина на весь звук: срез верха + мягкий потолок
    const ac = AC;
    if(ac.__m) return ac.__m;
    const lp = ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=12000; lp.Q.value=0.7;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=12; comp.ratio.value=4;
    comp.attack.value=0.003; comp.release.value=0.12;
    const g = ac.createGain(); g.gain.value=0.9;
    lp.connect(comp); comp.connect(g); g.connect(ac.destination);
    return ac.__m = lp;
  }
  // огибающая: короткая атака вместо скачка + быстрый спад вместо ровного
  window.nesEnv = function(g, t0, dur, vol, sustain){
    const steps = Math.max(1, Math.round(dur*60));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);     // атака 6 мс — щелчка больше нет
    for(let i = 0; i < steps; i++){
      const k = i/steps;
      const lv = sustain ? 1 - k*k : Math.pow(1 - k, 2.2); // спад круче, «чпок» вместо шипения
      g.gain.setValueAtTime(vol*Math.round(15*lv)/15, Math.max(t0 + 0.006, t0 + i/60));
    }
    g.gain.setValueAtTime(0, t0 + dur);
  };
  const oldPulse = window.nesPulse, oldNoise = window.nesNoise;
  window.nesPulse = function(f0, dur, vol, o){
    const ac = AC; if(!ac || !soundOn) return;
    o = o || {};
    const t0 = ac.currentTime + (o.at||0), osc = ac.createOscillator(), g = ac.createGain();
    if(o.tri) osc.type='triangle'; else osc.setPeriodicWave(nesWave(o.duty||0.25));
    nesSteps(osc.frequency, t0, dur, f0, o.slide, f => Math.max(20, f));
    nesEnv(g, t0, dur, vol, o.sustain);
    osc.connect(g); g.connect(master());
    osc.start(t0); osc.stop(t0+dur+0.03);
  };
  window.nesNoise = function(dur, vol, o){
    const ac = AC; if(!ac || !soundOn) return;
    o = o || {};
    const t0 = ac.currentTime + (o.at||0), s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = nesNoiseBuf(!!o.metal); s.loop = true;
    nesSteps(s.playbackRate, t0, dur, o.hz||9000, o.slide, hz => Math.max(0.02, hz/ac.sampleRate));
    nesEnv(g, t0, dur, vol, o.sustain);
    s.connect(g); g.connect(master());
    s.start(t0); s.stop(t0+dur+0.03);
  };
  // сам выстрел: короче, ниже, с телом
  window.__cannonNew = function(k){
    if(k === 'heavy'){
      nesNoise(.16, .10, { hz: 7000, slide: .12 });
      nesPulse(100, .20, .12, { tri: true, slide: .5 });
    } else if(k === 'fast'){
      nesPulse(1000, .05, .055, { duty:.125, slide:.4 });
      nesNoise(.035, .05, { hz: 16000, slide:.3 });
    } else {
      nesNoise(.09, .11, { hz: 11000, slide: .10 });   // было .18 / .14 / 18000
      nesPulse(520, .09, .085, { slide: .3 });          // было 660 / .08 / .07 — добавили низа
    }
  };
})();
`;

function wav(buf){                       // Float32 → 16-битный WAV
  const d = buf.getChannelData(0), sr = buf.sampleRate, n = d.length;
  const out = Buffer.alloc(44 + n*2);
  out.write('RIFF',0); out.writeUInt32LE(36+n*2,4); out.write('WAVE',8);
  out.write('fmt ',12); out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(1,22);
  out.writeUInt32LE(sr,24); out.writeUInt32LE(sr*2,28); out.writeUInt16LE(2,32); out.writeUInt16LE(16,34);
  out.write('data',36); out.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ let v=Math.max(-1,Math.min(1,d[i])); out.writeInt16LE(v<0?v*32768:v*32767, 44+i*2); }
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage();
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX);
  await pg.waitForTimeout(1000);

  const render = async (after, shots) => {
    const raw = await pg.evaluate(async ({ after, shots, patch }) => {
      AC = new OfflineAudioContext(1, Math.round(48000*(0.25 + shots*0.12)), 48000);
      soundOn = true;
      Object.assign(sfx, sfxStd, sfx8bit);
      if(after){ (0, eval)(patch); }
      for(let i = 0; i < shots; i++){
        const fire = after ? window.__cannonNew : sfx8bit.cannon;
        if(i === 0) fire('uni');
        else setTimeout(() => {}, 0);                       // интервал задаём через at ниже
      }
      // повторные выстрелы — через планирование, чтобы попасть в один рендер
      if(shots > 1){
        for(let i = 1; i < shots; i++){
          const t = i*0.11;
          if(after){ nesNoise(.09,.11,{hz:11000,slide:.10,at:t}); nesPulse(520,.09,.085,{slide:.3,at:t}); }
          else      { nesNoise(.18,.14,{hz:18000,slide:.09,at:t}); nesPulse(660,.08,.07,{slide:.25,at:t}); }
        }
      }
      const buf = await AC.startRendering();
      return Array.from(buf.getChannelData(0));
    }, { after, shots, patch: PATCH });
    const ac = { getChannelData: () => Float32Array.from(raw), sampleRate: 48000 };
    return wav(ac);
  };

  for (const [shots, tag] of [[1, 'odin-vystrel'], [5, 'ochered-5']]) {
    fs.writeFileSync(path.join(OUT, `${tag}-BYLO.wav`), await render(false, shots));
    fs.writeFileSync(path.join(OUT, `${tag}-STALO.wav`), await render(true, shots));
    console.log(tag, '— готово');
  }
  await b.close();
})();
