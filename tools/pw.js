// Playwright для инструментов проверки. Работает в двух местах:
//   - на компьютере: npm install + npx playwright install chromium (браузер в своём кэше);
//   - в облачном контейнере: библиотека и chromium лежат в /opt.
const fs = require('fs');
const LIB = '/opt/node-tools/node_modules/playwright';
const BROWSER = '/opt/pw-browsers/chromium';

let pw;
try { pw = require('playwright'); }
catch (e) {
  if (!fs.existsSync(LIB)) {
    console.error('Playwright не найден. На компьютере: npm install && npx playwright install chromium');
    process.exit(1);
  }
  pw = require(LIB);
}

module.exports = {
  chromium: pw.chromium, firefox: pw.firefox, webkit: pw.webkit,
  devices: pw.devices, request: pw.request,
  // параметры запуска: в контейнере браузер по своему пути, локально — из кэша Playwright
  LAUNCH: fs.existsSync(BROWSER) ? { executablePath: BROWSER } : {},
};
