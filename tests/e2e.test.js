// Testy end-to-end (Playwright + Chromium + pdftotext) – funkcje, PDF i bezpieczeństwo płatności.
// Uruchom: node tests/e2e.test.js   (wymaga: playwright z przeglądarką Chromium, poppler-utils)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'public'); // katalog publikowany (Cloudflare Pages: output directory = public)
const OUT = path.join(REPO, 'test-output');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS', name);
  else { failures++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); }
}

/* ---------- nagłówki z pliku _headers (blok "/*") ---------- */
const HEADERS = {};
{
  let inBlock = false;
  for (const line of fs.readFileSync(path.join(SITE, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) inBlock = line.trim() === '/*';
    else if (inBlock && line.includes(':')) { const i = line.indexOf(':'); HEADERS[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
}

/* ---------- atrapa Stripe + funkcja weryfikująca uruchamiana jak na Cloudflare ---------- */
const STRIPE = new Map();
const MODE = { paymentUrl: '', verifyDown: false };
const ENV = { STRIPE_SECRET_KEY: 'rk_live_e2etest', PAYMENT_LINK_ID: 'plink_1E2E', EXPECTED_AMOUNT: '1499' };
globalThis.fetch = async (url) => {
  const m = String(url).match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(.+)$/);
  if (!m) throw new Error('unexpected fetch ' + url);
  const s = STRIPE.get(m[1]);
  return { ok: !!s, status: s ? 200 : 404, json: async () => s || { error: {} } };
};
let verifyMod = null;
async function verify(req, url) {
  if (!verifyMod) verifyMod = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(REPO, 'functions/api/verify.js')).toString('base64'));
  if (MODE.verifyDown) return { status: 503, body: '{"ready":false}' };
  const res = await verifyMod.onRequest({ request: new Request('http://x' + url, { method: req.method }), env: ENV });
  return { status: res.status, body: await res.text() };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain', '.xml': 'application/xml' };
const server = http.createServer(async (req, res) => {
  const url = req.url;
  if (url.startsWith('/api/verify')) {
    const r = await verify(req, url);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(r.body);
  }
  const rel = decodeURIComponent(url.split('?')[0]).replace(/^\/$/, '/index.html');
  const p = path.join(SITE, rel);
  if (!p.startsWith(SITE + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(p);
  if (rel === '/assets/config.js' && MODE.paymentUrl) body = Buffer.from(body.toString('utf8').replace("paymentUrl: '',", `paymentUrl: '${MODE.paymentUrl}',`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', ...HEADERS });
  res.end(body);
});

async function newPage(browser, opts = {}) {
  const context = await browser.newContext({ locale: 'pl-PL', acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...opts });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const page = await context.newPage();
  page.errors = [];
  page.external = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  // Chrome ignoruje nagłówek COOP na testowym hoście http (na produkcji jest HTTPS) – to nie jest błąd aplikacji.
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Cross-Origin-Opener-Policy header has been ignored')) page.errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(http:\/\/(127\.0\.0\.1|kara\.test)(:\d+)?\/|data:|blob:)/.test(u)) page.external.push(u); });
  return { context, page };
}
async function pdfText(download, name) {
  const f = path.join(OUT, name);
  await download.saveAs(f);
  const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pages = +execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1];
  return { txt, pages };
}
async function fillApplicant(page) {
  for (const [s, v] of [['#f_fullName', 'Łukasz Żółkiewski'], ['#f_street', 'ul. Źródlana 5/12'], ['#f_postal', '00-950'], ['#f_city', 'Gdańsk'], ['#f_amount', '9610'], ['#f_reg', 'gd12345']]) await page.fill(s, v);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const LOCAL = `http://127.0.0.1:${port}`;
  const PROD = `http://kara.test:${port}`; // „prawdziwa” domena (nie-lokalna) – tryb demo musi być wyłączony
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP kara.test 127.0.0.1`] });

  /* ======================= 1. Silnik obliczeń ======================= */
  console.log('UNIT (calc)');
  let { context, page } = await newPage(browser);
  await page.goto(LOCAL + '/');
  const unit = await page.evaluate(() => {
    const K = window.KaraOC, o = {};
    o.f25 = K.ratesFromWage(4666); o.f26 = K.ratesFromWage(4806); o.t25 = K.PENALTIES[2025]; o.t26 = K.PENALTIES[2026];
    o.ex1 = K.calculate({ category: 'osobowy', start: '2025-12-20', end: '2026-01-20', detectionYear: 2026 });
    o.ex2 = K.calculate({ category: 'osobowy', start: '2025-12-01', end: '2026-01-31', detectionYear: 2026 });
    o.d4 = K.calculate({ category: 'osobowy', start: '2026-03-01', end: '2026-03-04', detectionYear: 2026 });
    o.d15 = K.calculate({ category: 'ciezarowy', start: '2026-03-01', end: '2026-03-15', detectionYear: 2026 });
    o.badCat = K.calculate({ category: '__proto__', start: '2026-03-01', end: '2026-03-04', detectionYear: 2026 });
    o.plan = K.installmentPlan(9610, 24);
    o.dl2 = K.deadlineInfo('2026-10-02', '2026-10-24');
    o.pesel = [K.validPesel('44051401359'), K.validPesel('44051401358')];
    o.exposed = ['buildLetter', 'pdfDoc', 'downloadPdf', 'onPay', 'setUnlocked', 'isUnlocked', 'state'].filter(k => k in K || typeof window[k] !== 'undefined');
    o.frozen = Object.isFrozen(K);
    return o;
  });
  check('formula 2025 == table', JSON.stringify(unit.f25) === JSON.stringify(unit.t25));
  check('formula 2026 == table', JSON.stringify(unit.f26) === JSON.stringify(unit.t26));
  check('cross-year 14 280 / 14 420', unit.ex1.totalA === 14280 && unit.ex1.totalB === 14420);
  check('cross-year max 18 940 / 19 220', unit.ex2.totalA === 18940 && unit.ex2.totalB === 19220);
  check('thresholds 4 days = 4810, truck 15 days = 14420', unit.d4.totalA === 4810 && unit.d15.totalA === 14420);
  check('invalid category is sanitised (no crash)', unit.badCat.totalA === 4810, unit.badCat);
  check('installments 400,42 + 400,34', unit.plan.rate === 400.42 && unit.plan.last === 400.34);
  check('deadline moved off holiday', unit.dl2.effective === '2026-11-02');
  check('PESEL checksum', unit.pesel[0] && !unit.pesel[1]);
  check('SECURITY: no letter/PDF/payment functions reachable from console', unit.exposed.length === 0, unit.exposed);
  check('SECURITY: public API frozen', unit.frozen);

  /* ======================= 2. SEO ======================= */
  console.log('SEO');
  const seo = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => JSON.parse(s.textContent));
    const faq = blocks.find(b => b['@type'] === 'FAQPage');
    const dom = Array.from(document.querySelectorAll('#faq details')).map(d => ({ q: d.querySelector('h3').textContent.trim(), a: d.querySelector('p').textContent.trim() }));
    return { types: blocks.map(b => b['@type']), faq: faq.mainEntity.map(e => ({ q: e.name, a: e.acceptedAnswer.text })), dom };
  });
  check('JSON-LD types', JSON.stringify(seo.types) === '["SoftwareApplication","FAQPage"]');
  check('FAQ JSON-LD identical to visible FAQ', seo.faq.length === seo.dom.length && seo.faq.every((e, i) => e.q === seo.dom[i].q && e.a === seo.dom[i].a));

  /* ======================= 3. Funkcje (tryb demo – tylko lokalnie) ======================= */
  console.log('FUNCTIONAL (local demo mode)');
  await page.fill('#k_start', '2025-12-20');
  await page.fill('#k_end', '2026-01-20');
  await page.fill('#k_delivery', '2026-10-20');
  await page.waitForTimeout(200);
  const calcText = await page.textContent('#calcOut');
  check('calc 14 280 zł + cross-year warning + variant 14 420', /14\s280 zł/.test(calcText) && calcText.includes('Pułapka przełomu roku') && /14\s420 zł/.test(calcText));
  check('progress bars sized via CSSOM (CSP-safe)', await page.$eval('#calcResult [data-w]', el => el.style.width.endsWith('%') && el.style.width !== '0%'));
  await page.screenshot({ path: path.join(OUT, 'desktop-calc.png') });
  await page.click('#toWizard');
  await page.waitForTimeout(150);
  await page.check('input[name=pathway][value=A]', { force: true });
  await fillApplicant(page);
  await page.check('[data-f=aIncludeBudget]');
  await page.fill('#f_persons', '3');
  await page.fill('#f_inc_salary', '4200');
  await page.fill('#f_exp_rent', '1800');
  await page.waitForTimeout(300);
  check('demo: preview fully visible', await page.$eval('#paywallOverlay', e => e.hidden));
  await page.click('#btnBuy');
  check('demo: note visible', await page.$eval('#coDemo', e => !e.hidden));
  await page.check('#coTerms'); await page.check('#coWithdraw');
  let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#coPay')]);
  const pa = await pdfText(dl, 'A.pdf');
  check('PDF A: Polish characters + raty + annex', pa.txt.includes('Łukasz Żółkiewski') && /24 nieoprocentowane\s+raty/.test(pa.txt) && pa.txt.includes('OŚWIADCZENIE'), pa.txt.slice(0, 300));
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.selectOption('#f_cGround', 'zbycie');
  await page.fill('#c_saleDate', '2025-11-30');
  await page.selectOption('#f_gender', 'K');
  await page.waitForTimeout(250);
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#btnBuy')]);
  const pc = await pdfText(dl, 'C.pdf');
  check('PDF C: feminine forms + art. 10 ust. 2', pc.txt.includes('zbyłam') && pc.txt.includes('przestałam') && pc.txt.includes('art. 10 ust. 2'));
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#btnInstr')]);
  const pi = await pdfText(dl, 'instr.pdf');
  check('PDF instructions', pi.txt.includes('INSTRUKCJA I LISTA KONTROLNA'));
  await page.waitForTimeout(400);
  const stores = await page.evaluate(() => ({ local: JSON.stringify(Object.assign({}, localStorage)), session: JSON.stringify(Object.assign({}, sessionStorage)) }));
  check('PRIVACY: personal data NOT in localStorage', !stores.local.includes('Żółkiewski') && !stores.local.includes('Źródlana'), stores.local);
  check('PRIVACY: form kept only in sessionStorage', stores.session.includes('Żółkiewski'));
  check('SECURITY: zero CSP violations (demo flow incl. PDF)', (await page.evaluate(() => window.__csp)).length === 0, await page.evaluate(() => window.__csp));
  check('SECURITY: no third-party requests', page.external.length === 0, page.external);
  check('no JS errors', page.errors.length === 0, page.errors);
  await context.close();

  /* ======================= 4. Produkcja: płatność wyłączona ======================= */
  console.log('PRODUCTION – payments not configured');
  MODE.paymentUrl = '';
  ({ context, page } = await newPage(browser));
  await page.goto(PROD + '/');
  await page.check('input[name=pathway][value=C]', { force: true });
  await fillApplicant(page);
  await page.selectOption('#f_cGround', 'ciaglosc');
  await page.waitForTimeout(250);
  check('locked on real domain without payment link (no free demo)', await page.$eval('#paywallOverlay', e => !e.hidden));
  await page.click('#btnBuy');
  check('"payments not active" shown, pay button disabled', await page.$eval('#coUnavailable', e => !e.hidden) && await page.$eval('#coPay', b => b.disabled));
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.check('#coTerms'); await page.check('#coWithdraw');
  await page.click('#coPay', { force: true }).catch(() => {});
  await page.waitForTimeout(500);
  check('no PDF delivered without payment', !downloaded);
  await context.close();

  /* ======================= 5. Produkcja: pełny przepływ płatności ======================= */
  console.log('PRODUCTION – payment flow');
  MODE.paymentUrl = 'https://buy.stripe.com/test_e2e';
  const captured = [];
  let paidSid = '';
  ({ context, page } = await newPage(browser));
  await context.route('https://buy.stripe.com/**', route => {
    const u = new URL(route.request().url());
    captured.push(u.href);
    const ref = u.searchParams.get('client_reference_id');
    paidSid = 'cs_live_' + crypto.randomBytes(12).toString('hex');
    STRIPE.set(paidSid, { object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'pln', amount_subtotal: 1499, amount_total: 1499, payment_link: 'plink_1E2E', client_reference_id: ref, livemode: true, created: Math.floor(Date.now() / 1000) });
    route.fulfill({ status: 302, headers: { location: `${PROD}/?platnosc=sukces&session_id=${paidSid}` } });
  });
  await page.goto(PROD + '/');
  await page.check('input[name=pathway][value=C]', { force: true });
  await fillApplicant(page);
  await page.selectOption('#f_cGround', 'ciaglosc');
  await page.fill('#c_insurer', 'Warta SA');
  await page.fill('#f_email', 'anna@example.com');
  await page.waitForTimeout(300);
  const lockedHtml = await page.$eval('#preview', e => e.innerHTML);
  check('locked preview: overlay + placeholder bars', await page.$eval('#paywallOverlay', e => !e.hidden) && lockedHtml.includes('locked-blur'));
  check('SECURITY: hidden letter text is NOT in the page (cannot be copied via DevTools)', !lockedHtml.includes('Mając powyższe na uwadze') && !lockedHtml.includes('art. 10 ust. 2'));

  // Próba oszustwa 1: podrobiony stan w localStorage
  await page.evaluate(() => {
    localStorage.setItem('karaoc_unlock_v1', JSON.stringify({ sid: 'x', ts: Date.now() }));
    localStorage.setItem('karaoc_pay_v2', JSON.stringify({ ref: 'w' + 'a'.repeat(32), sid: 'cs_live_forgedforged1234', ts: Date.now() }));
  });
  await page.reload();
  await page.waitForTimeout(800);
  check('SECURITY: forged localStorage does not unlock', await page.$eval('#paywallOverlay', e => !e.hidden));
  check('SECURITY: forged payment record removed after server rejects it', await page.evaluate(() => localStorage.getItem('karaoc_pay_v2') === null));

  // Próba oszustwa 2: ręczne dopisanie ?platnosc=sukces
  await page.goto(PROD + '/?platnosc=sukces&session_id=cs_live_fakefakefake12345');
  await page.waitForTimeout(800);
  check('SECURITY: typing ?platnosc=sukces does not unlock', await page.$eval('#paywallOverlay', e => !e.hidden));
  check('URL cleaned', !page.url().includes('platnosc'));

  // Prawdziwa płatność
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.waitForTimeout(200);
  await page.click('#btnBuy');
  await page.check('#coTerms'); await page.check('#coWithdraw');
  const dlP = page.waitForEvent('download', { timeout: 25000 });
  await page.click('#coPay');
  const d2 = await dlP;
  const pp = await pdfText(d2, 'paid-C.pdf');
  check('redirect carries random client_reference_id + email', captured.length === 1 && /client_reference_id=w[0-9a-f]{32}/.test(captured[0]) && captured[0].includes('prefilled_email=anna%40example.com'), captured);
  check('after verified payment: PDF delivered automatically', pp.txt.includes('Warta SA'));
  check('after verified payment: preview unlocked', await page.$eval('#paywallOverlay', e => e.hidden));
  await page.reload();
  await page.waitForTimeout(800);
  check('re-download works after reload (server re-verifies)', await page.$eval('#paywallOverlay', e => e.hidden) && await page.$eval('#btnInstr', e => !e.hidden));
  check('SECURITY: zero CSP violations (payment flow)', (await page.evaluate(() => window.__csp)).length === 0, await page.evaluate(() => window.__csp));
  check('no JS errors (payment flow)', page.errors.length === 0, page.errors);
  const paidRef = await page.evaluate(() => JSON.parse(localStorage.getItem('karaoc_pay_v2')).ref);
  await context.close();

  // Próba oszustwa 3: udostępniony link z opłaconym session_id w innej przeglądarce
  ({ context, page } = await newPage(browser));
  await page.goto(`${PROD}/?platnosc=sukces&session_id=${paidSid}`);
  await page.waitForTimeout(800);
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.waitForTimeout(300);
  check('SECURITY: shared paid link does not unlock another browser', await page.$eval('#paywallOverlay', e => !e.hidden));
  // Próba oszustwa 4: kradzież session_id + zgadywany ref
  await page.evaluate(sid => localStorage.setItem('karaoc_pay_v2', JSON.stringify({ ref: 'w' + 'b'.repeat(32), sid, ts: Date.now() })), paidSid);
  await page.reload();
  await page.waitForTimeout(800);
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.waitForTimeout(300);
  check('SECURITY: stolen session_id with wrong ref does not unlock', await page.$eval('#paywallOverlay', e => !e.hidden));
  // Kontrola: ten sam sid z właściwym ref działa (dowód, że blokuje ref, a nie błąd)
  await page.evaluate(([sid, ref]) => localStorage.setItem('karaoc_pay_v2', JSON.stringify({ ref, sid, ts: Date.now() })), [paidSid, paidRef]);
  await page.reload();
  await page.waitForTimeout(800);
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.waitForTimeout(300);
  check('control: correct ref + sid unlocks', await page.$eval('#paywallOverlay', e => e.hidden));
  await context.close();

  // Próba oszustwa 5: płatność wygasła (> 30 dni)
  ({ context, page } = await newPage(browser));
  const oldSid = 'cs_live_' + crypto.randomBytes(12).toString('hex'), oldRef = 'w' + 'c'.repeat(32);
  STRIPE.set(oldSid, { object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'pln', amount_subtotal: 1499, amount_total: 1499, payment_link: 'plink_1E2E', client_reference_id: oldRef, livemode: true, created: Math.floor(Date.now() / 1000) - 31 * 86400 });
  await page.goto(PROD + '/');
  await page.evaluate(([sid, ref]) => localStorage.setItem('karaoc_pay_v2', JSON.stringify({ ref, sid, ts: Date.now() })), [oldSid, oldRef]);
  await page.reload();
  await page.waitForTimeout(800);
  await page.check('input[name=pathway][value=C]', { force: true });
  await page.waitForTimeout(300);
  check('expired payment (>30 days) does not unlock', await page.$eval('#paywallOverlay', e => !e.hidden));
  await context.close();

  // Ochrona klienta: serwer weryfikacji nie działa → brak przekierowania do płatności
  console.log('PRODUCTION – verifier down');
  MODE.verifyDown = true;
  const captured2 = [];
  ({ context, page } = await newPage(browser));
  await context.route('https://buy.stripe.com/**', route => { captured2.push(route.request().url()); route.abort(); });
  await page.goto(PROD + '/');
  await page.check('input[name=pathway][value=C]', { force: true });
  await fillApplicant(page);
  await page.selectOption('#f_cGround', 'ciaglosc');
  await page.waitForTimeout(250);
  await page.click('#btnBuy');
  await page.check('#coTerms'); await page.check('#coWithdraw');
  await page.click('#coPay');
  await page.waitForTimeout(1500);
  check('BUYER PROTECTION: verifier down → customer is NOT sent to pay', captured2.length === 0 && (await page.$eval('#coError', e => !e.hidden && e.textContent.includes('nie pobraliśmy'))), captured2);
  MODE.verifyDown = false;
  await context.close();

  /* ======================= 6. Mobile ======================= */
  console.log('MOBILE');
  MODE.paymentUrl = '';
  ({ context, page } = await newPage(browser, { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await page.goto(LOCAL + '/');
  await page.fill('#k_start', '2025-12-20');
  await page.fill('#k_end', '2026-01-20');
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check('mobile: no horizontal page scroll', ov.sw <= ov.w, ov);
  await page.screenshot({ path: path.join(OUT, 'mobile-top.png') });
  check('no JS errors (mobile)', page.errors.length === 0, page.errors);
  await context.close();

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL E2E TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
