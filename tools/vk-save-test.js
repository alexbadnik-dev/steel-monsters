// Проверка облачного сохранения ВК без самого ВКонтакте.
// Запуск: node tools/vk-save-test.js
// Подменяем загрузку vk-bridge своим мостом: он отвечает на VKWebAppStorageSet/Get
// и держит «хранилище ВК» в отдельном ключе localStorage. Дальше гоняем настоящий круг:
//   1) игрок наиграл — сохранение уехало в хранилище;
//   2) другое устройство с пустым localStorage — профиль подхватился обратно.
// Так ловится то, что осмотром кода не увидеть: сборка строки по частям, сравнение
// отметок времени, однократная перезагрузка.
const { chromium, LAUNCH } = require('./pw');
const path = require('path');

const IGRA = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?platform=vk';

// мост-обманка: ровно те методы, которыми пользуется игра
const MOST = `
window.vkBridge = {
  supports: () => true,
  send: (m, p) => new Promise((res, rej) => {
    const SKLAD = () => { try { return JSON.parse(localStorage.getItem('__sklad_vk') || '{}'); } catch(e) { return {}; } };
    const ZAPIS = o => localStorage.setItem('__sklad_vk', JSON.stringify(o));
    if(m === 'VKWebAppInit') return res({ result: true });
    if(m === 'VKWebAppStorageSet'){
      const s = SKLAD();
      if(p.value === '') delete s[p.key]; else s[p.key] = p.value;
      ZAPIS(s);
      window.__zapisey = (window.__zapisey || 0) + 1;
      return res({ result: true });
    }
    if(m === 'VKWebAppStorageGet'){
      const s = SKLAD();
      return res({ keys: p.keys.map(k => ({ key: k, value: s[k] || '' })) });
    }
    if(m === 'VKWebAppShowNativeAds') return rej({ error_type: 'client_error' });
    return rej({ error_type: 'unsupported' });
  })
};
`;

async function stranica(b, sklad){
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  // отдаём свой мост вместо настоящего — сеть в тесте не нужна
  await ctx.route('**/vk-bridge/**', r => r.fulfill({ contentType: 'application/javascript', body: MOST }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
  if(sklad) await ctx.addInitScript(s => localStorage.setItem('__sklad_vk', s), sklad);
  const pg = await ctx.newPage();
  const bedy = [];
  pg.on('pageerror', e => { if(!/ServiceWorker/.test(e.message)) bedy.push(e.message); });
  await pg.goto(IGRA);
  await pg.waitForTimeout(1200);
  return { ctx, pg, bedy };
}

(async () => {
  const b = await chromium.launch(LAUNCH);
  let plohо = 0;
  const proverka = (chto, ok, chem) => { console.log((ok ? '  ок   ' : '  ПЛОХО') + '  ' + chto + (chem ? '  — ' + chem : '')); if(!ok) plohо++; };

  // ——— 1. наиграли и сохранили
  console.log('1. игрок наиграл, сохранение уходит в хранилище ВК');
  const a = await stranica(b, null);
  proverka('платформа определилась как vk', await a.pg.evaluate(() => PLATFORM) === 'vk');
  proverka('мост подхвачен', await a.pg.evaluate(() => vk.ready) === true);
  await a.pg.evaluate(() => { profile.coins = 777; profile.bestWave = 42; saveProfile(); });
  await a.pg.waitForTimeout(3600); // у сохранения выдержка 3 секунды
  let sklad = await a.pg.evaluate(() => localStorage.getItem('__sklad_vk'));
  const chasti = JSON.parse(sklad || '{}');
  proverka('в хранилище появились части', Object.keys(chasti).length > 0, Object.keys(chasti).join(', '));
  const sobrano = ['sm_save0', 'sm_save1', 'sm_save2'].map(k => chasti[k] || '').join('');
  let raspakovano = null;
  try{ raspakovano = JSON.parse(sobrano); }catch(e){}
  proverka('части собираются обратно в JSON', !!raspakovano);
  proverka('монеты доехали', raspakovano && raspakovano.profile.coins === 777, 'монет ' + (raspakovano && raspakovano.profile.coins));
  const bytes = Math.max(...Object.values(chasti).map(v => Buffer.byteLength(v, 'utf8')));
  proverka('самая большая часть влезает в 4096 байт ВК', bytes <= 4096, bytes + ' байт');
  proverka('ошибок на странице нет', a.bedy.length === 0, a.bedy.join(' | '));

  // самое рискованное место: профиль не влезает в одну часть
  console.log('1б. раздутый профиль — сохранение режется на части и собирается обратно');
  await a.pg.evaluate(() => {
    for(let i = 0; i < 80; i++) profile.skins.push('skin_dlinnoe_imya_' + i);
    profile.coins = 31337;
    saveProfile();
  });
  await a.pg.waitForTimeout(3600);
  const sklad2 = JSON.parse(await a.pg.evaluate(() => localStorage.getItem('__sklad_vk')) || '{}');
  proverka('частей стало больше одной', Object.keys(sklad2).length > 1, Object.keys(sklad2).join(', '));
  let bolshoe = null;
  try{ bolshoe = JSON.parse(['sm_save0', 'sm_save1', 'sm_save2'].map(k => sklad2[k] || '').join('')); }catch(e){}
  proverka('склеилось обратно в JSON', !!bolshoe);
  proverka('скины на месте', bolshoe && bolshoe.profile.skins.length > 80, 'скинов ' + (bolshoe && bolshoe.profile.skins.length));
  const b2 = Math.max(...Object.values(sklad2).map(v => Buffer.byteLength(v, 'utf8')));
  proverka('каждая часть влезает в 4096 байт', b2 <= 4096, 'самая большая ' + b2 + ' байт');

  // и обратно: короткое сохранение не должно оставлять хвост от длинного
  console.log('1в. профиль снова короткий — хвост прошлого сохранения затирается');
  await a.pg.evaluate(() => { profile.skins = ['green']; saveProfile(); });
  await a.pg.waitForTimeout(3600);
  const sklad3 = JSON.parse(await a.pg.evaluate(() => localStorage.getItem('__sklad_vk')) || '{}');
  proverka('лишние части удалены', Object.keys(sklad3).length === 1, Object.keys(sklad3).join(', '));
  let korotkoe = null;
  try{ korotkoe = JSON.parse(['sm_save0', 'sm_save1', 'sm_save2'].map(k => sklad3[k] || '').join('')); }catch(e){}
  proverka('читается без мусора', !!korotkoe && korotkoe.profile.skins.length === 1);
  await a.ctx.close();

  // ——— 2. другое устройство: localStorage пуст, хранилище ВК то же
  console.log('2. другое устройство — профиль подхватывается из облака');
  const c = await stranica(b, sklad);
  await c.pg.waitForTimeout(1500); // даём время на разовую перезагрузку
  const vosst = await c.pg.evaluate(() => ({ coins: profile.coins, wave: profile.bestWave }));
  proverka('монеты вернулись', vosst.coins === 777, 'монет ' + vosst.coins);
  proverka('лучшая волна вернулась', vosst.wave === 42, 'волна ' + vosst.wave);
  proverka('ошибок на странице нет', c.bedy.length === 0, c.bedy.join(' | '));
  const sync = await c.pg.evaluate(() => sessionStorage.getItem('sm_vk_sync'));
  proverka('перезагрузка отмечена и не повторится', !!sync);
  await c.ctx.close();

  // ——— 3. другие площадки не задеты
  console.log('3. свой сайт и Яндекс не задеты');
  for(const p of ['web', 'yandex']){
    const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 201, body: '[]' }));
    await ctx.route('**/games/sdk/**', r => r.abort());
    const pg = await ctx.newPage();
    const bedy = [];
    pg.on('pageerror', e => { if(!/ServiceWorker/.test(e.message)) bedy.push(e.message); });
    await pg.goto(IGRA.replace('platform=vk', 'platform=' + p));
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => { profile.coins = 5; saveProfile(); });
    await pg.waitForTimeout(500);
    proverka(p + ': загрузилась и сохраняется без ошибок', bedy.length === 0, bedy.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(plohо ? `\nПЛОХО: ${plohо} проверок не прошло` : '\nвсё прошло');
  process.exit(plohо ? 1 : 0);
})();
