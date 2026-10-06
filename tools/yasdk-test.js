const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const MOCK = (authed, cloud) => `
window.__ya = { setData: [], setScore: [], cloud: ${JSON.stringify(cloud)}, authed: ${authed} };
window.YaGames = { init: () => Promise.resolve({
  environment: { i18n: { lang: 'ru' } },
  adv: { showRewardedVideo(){}, showFullscreenAdv(o){ o.callbacks.onClose(); } },
  features: { LoadingAPI: { ready(){} }, GameplayAPI: { start(){}, stop(){} } },
  on(){},
  auth: { openAuthDialog: () => { __ya.authed = true; return Promise.resolve(); } },
  getPlayer: () => Promise.resolve({
    getMode: () => __ya.authed ? '' : 'lite',
    getData: () => Promise.resolve(__ya.cloud ? { save: __ya.cloud } : {}),
    setData: (d) => { __ya.setData.push(JSON.parse(JSON.stringify(d))); __ya.cloud = d.save; return Promise.resolve(); }
  }),
  leaderboards: {
    setScore: (n, v, x) => { __ya.setScore.push([n, v, x]); return Promise.resolve(); },
    getEntries: () => Promise.resolve({ entries: [
      { score: 412, extraData: '310|uni|norm|98765|3600', player: { publicName: 'Рома' } },
      { score: 250, extraData: '125|heavy|hard|45000|2100', player: { publicName: 'Окак' } } ] })
  }
}) };`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function page(authed, cloud, local){
    const ctx = await b.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 } });
    const pg = await ctx.newPage();
    const errs = [], supa = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('request', r => { if (r.url().includes('supabase.co')) supa.push(r.url()); });
    await pg.route('https://yandex.ru/games/sdk/v2', r => r.fulfill({ contentType: 'application/javascript', body: MOCK(authed, cloud) }));
    if (local) await pg.addInitScript(l => { if(!sessionStorage.getItem('t_init')){ sessionStorage.setItem('t_init','1'); localStorage.setItem('sm_profile', JSON.stringify(l)); } }, local);
    await pg.goto('file:///home/user/steel-monsters/index.html?platform=yandex');
    await pg.waitForTimeout(2500);
    return { pg, ctx, errs, supa };
  }
  // 1) свежее устройство, в облаке сохранение с другого телефона
  let t = await page(false, { at: Date.now() - 60000, profile: { name: 'Окак', coins: 7777, skins: ['green','gorynych'], equipped: 'gorynych', bestWave: 120 }, cp: 101, best: 50000 }, null);
  let r = await t.pg.evaluate(() => ({ coins: profile.coins, eq: profile.equipped, cp: checkpoint, cloudBtnHidden: document.getElementById('cloudBtn').hidden }));
  console.log('1. подхват облака:', r, 'ошибки:', t.errs, 'supabase-запросов:', t.supa.length);
  await t.ctx.close();
  // 2) локально свежее — уезжает в облако; бой → рекорд в лидерборд (авторизован)
  t = await page(true, { at: 1000, profile: { coins: 1 } }, { name: 'Папа', coins: 500, savedAt: Date.now(), bestWave: 30 });
  await t.pg.waitForTimeout(3500);
  r = await t.pg.evaluate(async () => {
    const before = __ya.setData.length;
    submitScore('Папа', 12345, 37, 'uni', 'norm', 600);
    await new Promise(z => setTimeout(z, 400));
    return { setDataCalls: before, lastSavedCoins: __ya.cloud && __ya.cloud.profile && __ya.cloud.profile.coins, setScore: __ya.setScore, yaSent: profile.yaSent, net: document.querySelector('.netstat') && document.querySelector('.netstat').textContent };
  });
  console.log('2. сейв+лидерборд:', JSON.stringify(r), 'ошибки:', t.errs, 'supabase:', t.supa.length);
  // 3) экран МИР
  await t.pg.evaluate(() => { boardTab = 'world'; renderBoard(); setOverlay('board'); });
  await t.pg.waitForTimeout(500);
  console.log('3. МИР:', await t.pg.evaluate(() => [...document.querySelectorAll('#boardTabs button')].map(x => x.textContent).join(',') + ' | ' + [...document.querySelectorAll('#boardList .boardrow')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
  await t.pg.screenshot({ path: __dirname + '/ya_world.png' });
  await t.ctx.close();
  // 4) не вошёл в аккаунт — кнопка входа, после входа рекорд уходит
  t = await page(false, null, { name: 'Гость', coins: 5, savedAt: Date.now() });
  r = await t.pg.evaluate(async () => {
    submitScore('Гость', 500, 12, 'fast', 'norm', 100);
    await new Promise(z => setTimeout(z, 200));
    boardTab = 'world'; renderBoard(); setOverlay('board');
    await new Promise(z => setTimeout(z, 300));
    const btn = [...document.querySelectorAll('#boardList button')].find(x => x.textContent.includes('ВОЙТИ'));
    const had = !!btn; const sentBefore = __ya.setScore.length;
    if (btn) btn.click();
    await new Promise(z => setTimeout(z, 500));
    return { loginBtn: had, sentBefore, sentAfter: __ya.setScore, net: document.querySelector('.netstat') && document.querySelector('.netstat').textContent };
  });
  console.log('4. гость:', JSON.stringify(r), 'ошибки:', t.errs, 'supabase:', t.supa.length);
  await t.ctx.close();
  await b.close();
})();
