// Весь 8-битный набор подряд: выстрел, попадание, взрыв, супер. Было / стало.
// Каждый звук рендерится отдельно и склеивается — иначе в офлайн-контексте они лягут друг на друга.
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUT = path.join(__dirname, 'sfx-ab');
const SR = 48000;

const PATCH = `
(function(){
  window.__chain = function(){
    const ac = AC; if(ac.__m) return ac.__m;
    const lp = ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=12000; lp.Q.value=0.7;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=12; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.12;
    const g = ac.createGain(); g.gain.value=0.9;
    lp.connect(comp); comp.connect(g); g.connect(ac.destination);
    return ac.__m = lp;
  };
  window.nesEnv = function(g, t0, dur, vol, sustain){
    const steps = Math.max(1, Math.round(dur*60));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    for(let i = 0; i < steps; i++){
      const k = i/steps, lv = sustain ? 1 - k*k : Math.pow(1 - k, 2.2);
      g.gain.setValueAtTime(vol*Math.round(15*lv)/15, Math.max(t0 + 0.006, t0 + i/60));
    }
    g.gain.setValueAtTime(0, t0 + dur);
  };
  window.nesPulse = function(f0, dur, vol, o){
    const ac = AC; if(!ac || !soundOn) return; o = o || {};
    const t0 = ac.currentTime + (o.at||0), osc = ac.createOscillator(), g = ac.createGain();
    if(o.tri) osc.type='triangle'; else osc.setPeriodicWave(nesWave(o.duty||0.25));
    nesSteps(osc.frequency, t0, dur, f0, o.slide, f => Math.max(20, f));
    nesEnv(g, t0, dur, vol, o.sustain);
    osc.connect(g); g.connect(__chain()); osc.start(t0); osc.stop(t0+dur+0.03);
  };
  window.nesNoise = function(dur, vol, o){
    const ac = AC; if(!ac || !soundOn) return; o = o || {};
    const t0 = ac.currentTime + (o.at||0), s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = nesNoiseBuf(!!o.metal); s.loop = true;
    nesSteps(s.playbackRate, t0, dur, o.hz||9000, o.slide, hz => Math.max(0.02, hz/ac.sampleRate));
    nesEnv(g, t0, dur, vol, o.sustain);
    s.connect(g); g.connect(__chain()); s.start(t0); s.stop(t0+dur+0.03);
  };
  window.__cannonNew = function(){
    nesNoise(.09, .11, { hz: 11000, slide: .10 });
    nesPulse(520, .09, .085, { slide: .3 });
  };
})();
`;

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
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage();
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX); await pg.waitForTimeout(1000);

  // выстрел, выстрел, попадание, взрыв, супер — с паузами
  const SEQ = [['cannon',0.45],['cannon',0.45],['hit',0.5],['boom',1.0],['superBoom',1.6]];

  const renderOne = (what, after) => pg.evaluate(async ({ what, after, patch }) => {
    AC = new OfflineAudioContext(1, Math.round(48000*2.2), 48000);
    soundOn = true;
    Object.assign(sfx, sfxStd, sfx8bit);
    if(after) (0, eval)(patch);
    if(what === 'cannon'){ (after ? window.__cannonNew : sfx8bit.cannon)('uni'); }
    else sfx8bit[what]();
    const buf = await AC.startRendering();
    return Array.from(buf.getChannelData(0));
  }, { what, after, patch: PATCH });

  for (const after of [false, true]) {
    const parts = [];
    for (const [what, gap] of SEQ) parts.push([await renderOne(what, after), gap]);
    const total = parts.reduce((a,[,g]) => a + Math.round(g*SR), 0);
    const mix = new Float32Array(total);
    let pos = 0;
    for (const [data, gap] of parts) {
      const len = Math.min(data.length, total - pos);
      for (let i = 0; i < len; i++) mix[pos+i] += data[i];
      pos += Math.round(gap*SR);
    }
    fs.writeFileSync(path.join(OUT, after ? 'nabor-8bit-STALO.wav' : 'nabor-8bit-BYLO.wav'), wav(mix, SR));
    console.log(after ? 'стало' : 'было', '- готово');
  }
  await b.close();
})();
