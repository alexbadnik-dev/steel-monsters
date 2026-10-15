// Что делает звук «резким»: меряем образцы и наши синтезированные одним и тем же способом.
// Запуск: node tools/sfx-analyze.js [файл.mp3 ...]
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs'), path = require('path');
const INDEX = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

const ANALYSER = `
function fft(re, im){                       // радикс-2, на месте
  const n = re.length;
  for(let i = 1, j = 0; i < n; i++){
    let bit = n >> 1;
    for(; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if(i < j){ [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; }
  }
  for(let len = 2; len <= n; len <<= 1){
    const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
    for(let i = 0; i < n; i += len){
      let cr = 1, ci = 0;
      for(let k = 0; k < len/2; k++){
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi;
        re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const nr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = nr;
      }
    }
  }
}
function analyse(data, sr, name){
  // обрезаем тишину по краям: всё тише −40 дБ от пика
  let peak = 0; for(const v of data) peak = Math.max(peak, Math.abs(v));
  const thr = peak*0.01;
  let a = 0, b = data.length-1;
  while(a < b && Math.abs(data[a]) < thr) a++;
  while(b > a && Math.abs(data[b]) < thr) b--;
  const d = data.subarray(a, b+1), dur = d.length/sr;
  // время спада до −20 дБ от пика
  let pi = 0, pv = 0;
  for(let i=0;i<d.length;i++) if(Math.abs(d[i])>pv){ pv=Math.abs(d[i]); pi=i; }
  let dec = d.length - pi;
  for(let i=pi;i<d.length;i++){
    let m=0; for(let k=i;k<Math.min(i+256,d.length);k++) m=Math.max(m,Math.abs(d[k]));
    if(m < pv*0.1){ dec = i-pi; break; }
  }
  // средний спектр
  const N = 2048, hop = 1024, mag = new Float64Array(N/2);
  let frames = 0;
  for(let off = 0; off + N <= d.length; off += hop){
    const re = new Float64Array(N), im = new Float64Array(N);
    for(let i=0;i<N;i++) re[i] = d[off+i] * (0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1)));
    fft(re, im);
    for(let i=0;i<N/2;i++) mag[i] += Math.hypot(re[i], im[i]);
    frames++;
  }
  if(!frames){ const re=new Float64Array(N), im=new Float64Array(N);
    for(let i=0;i<Math.min(N,d.length);i++) re[i]=d[i]; fft(re,im);
    for(let i=0;i<N/2;i++) mag[i]=Math.hypot(re[i],im[i]); frames=1; }
  for(let i=0;i<N/2;i++) mag[i] /= frames;
  const hz = i => i*sr/N;
  let sum=0, cent=0;
  for(let i=1;i<N/2;i++){ sum += mag[i]; cent += mag[i]*hz(i); }
  cent = sum ? cent/sum : 0;
  const bands = [[0,500],[500,1000],[1000,2000],[2000,4000],[4000,8000],[8000,16000],[16000,1e9]];
  const be = bands.map(([lo,hi]) => {
    let e=0; for(let i=1;i<N/2;i++) if(hz(i)>=lo && hz(i)<hi) e+=mag[i];
    return sum ? Math.round(e/sum*100) : 0;
  });
  return { name, sr, dur:+dur.toFixed(3), decay:+(dec/sr).toFixed(3), peak:+peak.toFixed(2),
           centroid:Math.round(cent), bands:be };
}
`;

(async () => {
  const files = process.argv.slice(2);
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage();
  await pg.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  await pg.goto(INDEX);
  await pg.waitForTimeout(1000);
  await pg.evaluate(src => { (0, eval)(src); }, ANALYSER);  // косвенный eval — объявления уходят в глобальную область

  const rows = [];
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    rows.push(await pg.evaluate(async ({ b64, name }) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const ac = new OfflineAudioContext(1, 48000, 48000);
      const buf = await ac.decodeAudioData(bin.buffer);
      return analyse(buf.getChannelData(0), buf.sampleRate, name);
    }, { b64, name: path.basename(f).replace(/\.mp3$/i, '') }));
  }

  // наши синтезированные: выстрел обычного танка в обоих наборах
  for (const [set, label] of [['8bit', 'НАШ выстрел · 8-БИТ'], ['std', 'НАШ выстрел · обычный']]) {
    rows.push(await pg.evaluate(async ({ set, label }) => {
      AC = new OfflineAudioContext(1, Math.round(48000*0.8), 48000);
      soundOn = true;
      const src = set === '8bit' ? sfx8bit : sfxStd;
      Object.assign(sfx, sfxStd, set === '8bit' ? sfx8bit : {});
      sfx.cannon('uni');
      const buf = await AC.startRendering();
      return analyse(buf.getChannelData(0), buf.sampleRate, label);
    }, { set, label }));
  }

  const pad = (s,n) => String(s).padEnd(n).slice(0,n);
  console.log(pad('звук',42), pad('длит',7), pad('спад',7), pad('центр',7), 'энергия по полосам, %: <0.5к 0.5-1 1-2 2-4 4-8 8-16 >16');
  for (const r of rows)
    console.log(pad(r.name,42), pad(r.dur+'с',7), pad(r.decay+'с',7), pad(r.centroid+'Гц',7),
                '              ' + r.bands.map(x=>String(x).padStart(4)).join(' '));
  await b.close();
})();
