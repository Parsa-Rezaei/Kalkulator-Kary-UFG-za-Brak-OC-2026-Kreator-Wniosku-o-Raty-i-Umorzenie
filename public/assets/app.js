/* Kalkulator Kary OC – logika aplikacji.
   Konfiguracja: public/assets/config.js. Cały kod działa w zamkniętym zakresie (IIFE) –
   żadna funkcja generująca pismo nie jest dostępna z konsoli przeglądarki. */
(function () {
  'use strict';

  /* =====================================================================
     KONFIGURACJA (walidowana – błędne wartości są ignorowane)
     ===================================================================== */
  const RAW = (window.KARAOC_CONFIG && typeof window.KARAOC_CONFIG === 'object') ? window.KARAOC_CONFIG : {};
  function str(v, d) { return typeof v === 'string' && v.trim() ? v : d; }
  function httpsUrl(v) { try { const x = new URL(String(v || '')); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } }
  const MIN_WAGE = {};
  Object.keys(RAW.minWage || {}).forEach(y => { const w = Number(RAW.minWage[y]); if (/^\d{4}$/.test(y) && w > 0 && w < 100000) MIN_WAGE[y] = w; });
  const SELLER = RAW.seller && typeof RAW.seller === 'object' ? RAW.seller : {};
  const CONFIG = Object.freeze({
    siteName: str(RAW.siteName, 'Kalkulator Kary OC'),
    siteUrl: str(RAW.siteUrl, ''),
    price: Number.isFinite(RAW.price) && RAW.price > 0 && RAW.price < 1000 ? RAW.price : 14.99,
    paymentUrl: httpsUrl(RAW.paymentUrl),
    verifyEndpoint: /^\/[A-Za-z0-9/_-]{1,100}$/.test(RAW.verifyEndpoint || '') ? RAW.verifyEndpoint : '',
    affiliateUrl: httpsUrl(RAW.affiliateUrl),
    seller: Object.freeze({ name: str(SELLER.name, ''), address: str(SELLER.address, ''), email: str(SELLER.email, ''), nip: str(SELLER.nip, '') }),
    ufgAddress: str(RAW.ufgAddress, 'Zarząd\nUbezpieczeniowego Funduszu Gwarancyjnego\nul. Płocka 9/11\n01-231 Warszawa'),
    lawDate: str(RAW.lawDate, ''),
    minWage: Object.freeze(MIN_WAGE)
  });
  // Tryb demonstracyjny (PDF bez opłaty) działa WYŁĄCZNIE lokalnie i tylko bez skonfigurowanej płatności.
  const IS_LOCAL = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const DEMO = !CONFIG.paymentUrl && IS_LOCAL;
  const SALES_CONFIGURED = !!CONFIG.paymentUrl && !!CONFIG.verifyEndpoint;

  /* =====================================================================
     DANE USTAWOWE (art. 88 ustawy o ubezpieczeniach obowiązkowych)
     [20%, 50%, 100%] – kwoty zaokrąglone do pełnych 10 zł (art. 88 ust. 5)
     ===================================================================== */
  const PENALTIES = Object.freeze({
    2025: { osobowy: [1870, 4670, 9330], ciezarowy: [2800, 7000, 14000], pozostale: [310, 780, 1560], rolnicy: 470, budynki: 1170 },
    2026: { osobowy: [1920, 4810, 9610], ciezarowy: [2880, 7210, 14420], pozostale: [320, 800, 1600], rolnicy: 480, budynki: 1200 }
  });
  const CATEGORY_LABEL = {
    osobowy: 'samochód osobowy',
    ciezarowy: 'samochód ciężarowy / ciągnik samochodowy / autobus',
    pozostale: 'pojazd z kategorii „pozostałe pojazdy” (np. motocykl, motorower, przyczepa)',
    rolnicy: 'OC rolników',
    budynki: 'ubezpieczenie budynków rolniczych'
  };
  const FLAT = ['rolnicy', 'budynki'];
  const SOCIAL_CRITERION = { single: 1010, family: 823 }; // kryteria dochodowe pomocy społecznej od 1.01.2025 r.
  function cat(c) { return Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, c) ? c : 'osobowy'; }

  const REASONS = {
    zakup: {
      note: 'Polisa przejęta od poprzedniego właściciela chroni tylko do końca okresu, na jaki ją zawarto – nie odnawia się automatycznie. Nowe OC trzeba zawrzeć najpóźniej z dniem jej wygaśnięcia.',
      letter: g => `Pojazd ${g('nabyłem', 'nabyłam')} wraz z umową ubezpieczenia OC zawartą przez poprzedniego właściciela. Umowa ta wygasła z upływem okresu, na jaki została zawarta, i nie uległa automatycznemu przedłużeniu, czego nie ${g('byłem świadomy', 'byłam świadoma')}.`
    },
    rata: {
      note: 'Nieopłacenie raty nie zawsze oznacza koniec ochrony. Poproś ubezpieczyciela o zaświadczenie o okresie ochrony – jeśli umowa trwała, wybierz ścieżkę C (odwołanie).',
      letter: () => 'Przerwa w ochronie była następstwem problemów z terminowym opłaceniem składki, wynikających z mojej trudnej sytuacji finansowej, a nie z celowego uchylania się od obowiązku ubezpieczenia.'
    },
    rejestracja: {
      note: 'Obowiązek OC nie zależy od przerejestrowania – trwa nieprzerwanie, dopóki pojazd jest zarejestrowany.',
      letter: g => `Przerwa nastąpiła w okresie formalności związanych z rejestracją (przerejestrowaniem) pojazdu – ${g('pozostawałem', 'pozostawałam')} w błędnym przekonaniu, że obowiązek ubezpieczenia powstanie dopiero po ich zakończeniu.`
    },
    wypowiedzenie: {
      note: 'Wypowiadając polisę, zawrzyj nową umowę tak, aby ochrona zaczynała się dzień po końcu starej.',
      letter: g => `Dotychczasową umowę OC ${g('wypowiedziałem', 'wypowiedziałam')} z zamiarem zawarcia nowej umowy, jednak – wskutek przeoczenia – nowa umowa została zawarta z opóźnieniem.`
    },
    nieuzywany: {
      note: 'Obowiązek OC dotyczy każdego zarejestrowanego pojazdu, także stojącego w garażu. Zwalnia z niego dopiero wyrejestrowanie (lub, dla niektórych pojazdów, czasowe wycofanie z ruchu). Nieużywanie auta to jedynie okoliczność łagodząca.',
      letter: () => 'W okresie przerwy pojazd nie był używany i nie poruszał się po drogach publicznych, wobec czego nie stwarzał zagrożenia dla innych uczestników ruchu.'
    },
    inny: { note: 'Opisz okoliczności możliwie konkretnie i dołącz dokumenty, które je potwierdzają.', letter: () => '' }
  };

  const INCOME_FIELDS = [
    ['inc_salary', 'Wynagrodzenie (Ty)'], ['inc_partner', 'Dochód małżonka/partnera'], ['inc_pension', 'Emerytura / renta'],
    ['inc_benefits', 'Świadczenia (rodzinne, 800+, zasiłki)'], ['inc_alimony_in', 'Alimenty otrzymywane'], ['inc_other', 'Inne dochody']
  ];
  const EXPENSE_FIELDS = [
    ['exp_rent', 'Czynsz / najem / rata za mieszkanie'], ['exp_utilities', 'Media (prąd, gaz, woda, ogrzewanie)'], ['exp_food', 'Żywność i higiena'],
    ['exp_medical', 'Leki i leczenie'], ['exp_loans', 'Raty kredytów i pożyczek'], ['exp_alimony_out', 'Alimenty płacone'],
    ['exp_transport', 'Dojazdy / transport'], ['exp_children', 'Wydatki na dzieci (szkoła, przedszkole)'], ['exp_telecom', 'Telefon / internet'], ['exp_other', 'Inne niezbędne wydatki']
  ];

  const ATTACHMENTS = {
    wezwanie: 'Kopia wezwania UFG do uiszczenia opłaty',
    polisa_nowa: 'Kopia aktualnej polisy OC (potwierdzenie zawarcia nowej umowy)',
    budzet: 'Załącznik nr 1 – Oświadczenie o sytuacji rodzinnej, majątkowej i o dochodach',
    dochody: 'Zaświadczenie o dochodach (np. od pracodawcy) lub decyzja o przyznaniu świadczenia',
    dochody_wszyscy: 'Zaświadczenia o dochodach wszystkich członków gospodarstwa domowego',
    swiadczenia: 'Decyzje o przyznaniu świadczeń (ZUS, KRUS, MOPS, świadczenia rodzinne)',
    wyciag: 'Wyciągi z rachunku bankowego za ostatnie 3 miesiące',
    wydatki: 'Dokumenty potwierdzające stałe wydatki (rachunki, harmonogramy spłat)',
    oplaty: 'Rachunki za czynsz i media',
    kredyty: 'Umowy lub harmonogramy spłaty kredytów i pożyczek',
    pup: 'Zaświadczenie z powiatowego urzędu pracy o statusie osoby bezrobotnej',
    orzeczenie: 'Orzeczenie o stopniu niepełnosprawności',
    medyczne: 'Dokumentacja medyczna oraz faktury za leki i leczenie',
    komornik: 'Pisma z postępowania egzekucyjnego (komorniczego)',
    dzieci: 'Dokumenty potwierdzające osoby na utrzymaniu (np. odpisy aktów urodzenia)',
    zdarzenie: 'Dokumenty potwierdzające zdarzenie losowe',
    emerytura: 'Decyzja o wysokości emerytury lub renty',
    polisa_okres: 'Kopia polisy OC obejmującej okres wskazany w wezwaniu',
    zaswiadczenie_tu: 'Zaświadczenie zakładu ubezpieczeń o okresie ochrony',
    skladka: 'Potwierdzenie zapłaty składki',
    umowa_sprzedazy: 'Kopia umowy sprzedaży pojazdu',
    zawiadomienie_tu: 'Potwierdzenie zawiadomienia zakładu ubezpieczeń o zbyciu pojazdu',
    zgloszenie_zbycia: 'Potwierdzenie zgłoszenia zbycia pojazdu w wydziale komunikacji',
    policja: 'Zaświadczenie Policji o zgłoszeniu kradzieży pojazdu',
    wyrejestrowanie: 'Decyzja o wyrejestrowaniu pojazdu',
    demontaz: 'Zaświadczenie o demontażu pojazdu',
    decyzja_wycofanie: 'Decyzja o czasowym wycofaniu pojazdu z ruchu',
    polisy_ciaglosc: 'Kopie polis OC obejmujących okresy przed przerwą i po niej',
    dowod_rej: 'Kopia dowodu rejestracyjnego pojazdu'
  };

  /* =====================================================================
     NARZĘDZIA
     ===================================================================== */
  const DAY = 86400000;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MAX_AMOUNT = 1000000;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function u(s) { return String(s == null ? '' : s).replace(/\*/g, '').trim(); } // dane użytkownika bez znaczników pogrubienia
  function ratyPhrase(n) { return `${n} ${plural(n, 'nieoprocentowaną ratę miesięczną', 'nieoprocentowane raty miesięczne', 'nieoprocentowanych rat miesięcznych')}`; }
  function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; }
  function pos(v) { return Math.min(MAX_AMOUNT, Math.max(0, num(v))); }
  function int(v, d = 0) { const n = parseInt(v, 10); return isFinite(n) ? n : d; }
  function zl(n) { const c = Math.round(n * 100); return (c % 100 ? nf2.format(c / 100) : nf0.format(c / 100)) + ' zł'; }
  function zl2(n) { return nf2.format(n) + ' zł'; }
  function plural(n, one, few, many) { n = Math.abs(n); if (n === 1) return one; const d = n % 10, h = n % 100; return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many; }
  function dni(n) { return `${n} ${plural(n, 'dzień', 'dni', 'dni')}`; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isoToT(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return NaN;
    const [y, m, d] = s.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d), dt = new Date(t);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : NaN;
  }
  function tToIso(t) { return new Date(t).toISOString().slice(0, 10); }
  function validIso(s) { return !isNaN(isoToT(s)); }
  function todayIso() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  function addDays(iso, n) { return tToIso(isoToT(iso) + n * DAY); }
  function addMonths(iso, k) {
    const [y, m, d] = iso.split('-').map(Number);
    const tm = m - 1 + k, ty = y + Math.floor(tm / 12), mm = ((tm % 12) + 12) % 12;
    const last = new Date(Date.UTC(ty, mm + 1, 0)).getUTCDate();
    return tToIso(Date.UTC(ty, mm, Math.min(d, last)));
  }
  function diffDays(a, b) { return Math.round((isoToT(b) - isoToT(a)) / DAY); }
  function fmtDate(iso) { if (!validIso(iso)) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
  function fmtDateLong(iso) { if (!validIso(iso)) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_GEN[m - 1]} ${y} r.`; }
  function weekday(iso) { return WEEKDAYS[new Date(isoToT(iso)).getUTCDay()]; }

  /* Dni ustawowo wolne od pracy w Polsce (24 grudnia – od 2025 r.) */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, month - 1, day);
  }
  function holidaysPL(y) {
    const md = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'];
    if (y >= 2025) md.push('12-24');
    const set = new Set(md.map(x => `${y}-${x}`));
    const e = easter(y);
    [0, 1, 49, 60].forEach(off => set.add(tToIso(e + off * DAY))); // Wielkanoc, Poniedziałek Wielkanocny, Zesłanie Ducha Św., Boże Ciało
    return set;
  }
  function isNonWorking(iso) { const wd = new Date(isoToT(iso)).getUTCDay(); return wd === 0 || wd === 6 || holidaysPL(+iso.slice(0, 4)).has(iso); }

  /* =====================================================================
     SILNIK OBLICZEŃ (funkcje czyste – testowalne)
     ===================================================================== */
  function roundTo10(x) { return Math.round(x / 10) * 10; }
  function ratesFromWage(w) {
    const t = base => [roundTo10(base * 0.2), roundTo10(base * 0.5), roundTo10(base)];
    return { osobowy: t(2 * w), ciezarowy: t(3 * w), pozostale: t(w / 3), rolnicy: roundTo10(w / 10), budynki: roundTo10(w / 4) };
  }
  function ratesForYear(y) { return PENALTIES[y] || (CONFIG.minWage[y] ? ratesFromWage(CONFIG.minWage[y]) : null); }
  function tierIndex(days) { return days <= 3 ? 0 : days <= 14 ? 1 : 2; }
  function feeFor(category, year, days) {
    const r = ratesForYear(year); if (!r || days <= 0) return null;
    const row = r[cat(category)];
    return FLAT.includes(cat(category)) ? row : row[tierIndex(days)];
  }
  function splitByYear(startIso, endIso) {
    const s = isoToT(startIso), e = isoToT(endIso);
    if (isNaN(s) || isNaN(e) || e < s) return [];
    const out = [], y0 = new Date(s).getUTCFullYear(), y1 = new Date(e).getUTCFullYear();
    for (let y = y0; y <= y1 && out.length < 50; y++) {
      const a = Math.max(s, Date.UTC(y, 0, 1)), b = Math.min(e, Date.UTC(y, 11, 31));
      out.push({ year: y, start: tToIso(a), end: tToIso(b), days: Math.round((b - a) / DAY) + 1 });
    }
    return out;
  }
  /* Wariant A: stawka roku, w którym trwała przerwa. Wariant B: stawka roku stwierdzenia (wezwania). */
  function calculate({ category, start, end, detectionYear }) {
    category = cat(category);
    const segs = splitByYear(start, end);
    const flat = FLAT.includes(category);
    let totalA = 0, totalB = 0, unknownB = false;
    const unknownA = [];
    const segments = segs.map(sg => {
      const ti = flat ? 2 : tierIndex(sg.days);
      const feeA = feeFor(category, sg.year, sg.days);
      const feeB = feeFor(category, Math.max(sg.year, detectionYear || sg.year), sg.days);
      if (feeA == null) unknownA.push(sg.year); else totalA += feeA;
      if (feeB == null) unknownB = true; else totalB += feeB;
      return { ...sg, tier: ti, pct: [20, 50, 100][ti], feeA, feeB };
    });
    const totalDays = segments.reduce((s, x) => s + x.days, 0);
    return { segments, totalA, totalB, unknownA, unknownB, totalDays, crossYear: segments.length > 1, flat };
  }
  function installmentPlan(amount, n) {
    n = Math.max(1, Math.min(24, n | 0));
    const cents = Math.round(amount * 100);
    let rate = Math.round(cents / n), last = cents - rate * (n - 1);
    if (last <= 0) { rate = Math.floor(cents / n); last = cents - rate * (n - 1); }
    return { n, rate: rate / 100, last: last / 100, total: cents / 100 };
  }
  function deadlineInfo(deliveryIso, today) {
    if (!validIso(deliveryIso)) return null;
    const nominal = addDays(deliveryIso, 30);
    let effective = nominal;
    while (isNonWorking(effective)) effective = addDays(effective, 1);
    return { nominal, effective, shifted: effective !== nominal, daysLeft: diffDays(today, effective) };
  }
  function validPesel(p) {
    if (!/^\d{11}$/.test(p)) return false;
    const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    const sum = w.reduce((s, x, i) => s + x * +p[i], 0);
    return (10 - (sum % 10)) % 10 === +p[10];
  }
  function budgetOf(f) {
    const income = INCOME_FIELDS.reduce((s, [k]) => s + pos(f[k]), 0);
    const expenses = EXPENSE_FIELDS.reduce((s, [k]) => s + pos(f[k]), 0);
    const persons = Math.min(30, Math.max(1, int(f.persons, 1)));
    const perPerson = income / persons;
    const criterion = persons === 1 ? SOCIAL_CRITERION.single : SOCIAL_CRITERION.family;
    return { income, expenses, balance: income - expenses, persons, dependents: Math.min(30, Math.max(0, int(f.dependents, 0))), perPerson, criterion, filled: income > 0 || expenses > 0 };
  }

  /* =====================================================================
     STAN APLIKACJI
     Dane formularza: wyłącznie sessionStorage (znikają po zamknięciu karty).
     localStorage: tylko identyfikatory płatności (bez danych osobowych).
     ===================================================================== */
  const STORE_KEY = 'karaoc_form_v2', PAY_KEY = 'karaoc_pay_v2';
  const LEGACY_KEYS = ['karaoc_form_v1', 'karaoc_unlock_v1', 'karaoc_order'];
  const SID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
  const REF_RE = /^[A-Za-z0-9_-]{16,64}$/;
  const S = { f: {}, attOverride: {}, rManual: false };
  let PAID = false; // ustawiane wyłącznie po potwierdzeniu płatności przez serwer (w pamięci, nie w przeglądarce)
  function isUnlocked() { return DEMO || PAID; }

  function storageGet(store, key) { try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; } }
  function storageSet(store, key, val) { try { store.setItem(key, JSON.stringify(val)); } catch (e) { /* tryb prywatny / brak miejsca */ } }
  function storageDel(store, key) { try { store.removeItem(key); } catch (e) { /* ignore */ } }
  function isPlainObject(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  let saveTimer = null;
  function saveStateNow() { storageSet(sessionStorage, STORE_KEY, { f: S.f, attOverride: S.attOverride, rManual: S.rManual }); }
  function saveState() { clearTimeout(saveTimer); saveTimer = setTimeout(saveStateNow, 250); }
  function loadState() {
    const d = storageGet(sessionStorage, STORE_KEY);
    if (!isPlainObject(d) || !isPlainObject(d.f)) return;
    const f = {};
    Object.keys(d.f).forEach(k => { const v = d.f[k]; if (/^[A-Za-z_]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'boolean')) f[k] = v; });
    const att = {};
    if (isPlainObject(d.attOverride)) Object.keys(d.attOverride).forEach(k => { if (Object.prototype.hasOwnProperty.call(ATTACHMENTS, k)) att[k] = !!d.attOverride[k]; });
    S.f = f; S.attOverride = att; S.rManual = !!d.rManual;
  }

  function gather() {
    $$('[data-f]').forEach(el => {
      const k = el.dataset.f;
      if (el.type === 'radio') { if (el.checked) S.f[k] = el.value; }
      else if (el.type === 'checkbox') S.f[k] = el.checked;
      else S.f[k] = el.value;
    });
  }
  function restore() {
    $$('[data-f]').forEach(el => {
      const k = el.dataset.f; if (!Object.prototype.hasOwnProperty.call(S.f, k)) return;
      const v = S.f[k];
      if (el.type === 'radio') el.checked = el.value === v;
      else if (el.type === 'checkbox') el.checked = !!v;
      else el.value = el.maxLength > 0 ? String(v).slice(0, el.maxLength) : String(v);
    });
  }
  function applyInputLimits() {
    $$('input').forEach(el => {
      if (['text', 'email', 'tel', 'search'].includes(el.type) && el.maxLength < 0) el.maxLength = 150;
      if (el.type === 'number' && !el.max) el.max = String(MAX_AMOUNT);
    });
    $$('textarea').forEach(el => { if (el.maxLength < 0) el.maxLength = el.id === 'f_ufgAddr' ? 300 : 2000; });
  }

  /* =====================================================================
     MODUŁ 1 – KALKULATOR
     ===================================================================== */
  function detectionYearOf(f) { return validIso(f.k_delivery) ? +f.k_delivery.slice(0, 4) : +todayIso().slice(0, 4); }
  function calcInputs() {
    const f = S.f, today = todayIso();
    const end = f.k_ongoing ? today : f.k_end;
    return { category: cat(f.k_category), start: f.k_start, end, detectionYear: detectionYearOf(f), ongoing: !!f.k_ongoing, today };
  }
  function applyDynStyles(root) {
    $$('[data-w]', root).forEach(el => { el.style.width = Math.min(100, Math.max(0, +el.dataset.w || 0)) + '%'; });
    $$('[data-l]', root).forEach(el => { el.style.left = Math.min(100, Math.max(0, +el.dataset.l || 0)) + '%'; });
  }
  let lastCalc = null;
  function renderCalc() {
    const inp = calcInputs();
    $('#k_end').disabled = inp.ongoing;
    $('#k_reasonNote').textContent = (REASONS[S.f.k_reason] || REASONS.zakup).note;
    const box = $('#calcResult'), warn = $('#calcWarn');
    warn.innerHTML = '';
    if (!validIso(inp.start) || !validIso(inp.end)) { box.innerHTML = '<p class="text-slate-500">Wpisz pierwszy i ostatni dzień bez OC (albo zaznacz „Nadal brak OC”), aby zobaczyć wynik.</p>'; lastCalc = null; return; }
    if (isoToT(inp.end) < isoToT(inp.start)) { box.innerHTML = '<p class="font-semibold text-red-700">Ostatni dzień przerwy nie może być wcześniejszy niż pierwszy.</p>'; lastCalc = null; return; }
    if (isoToT(inp.start) > isoToT(inp.today)) { box.innerHTML = '<p class="font-semibold text-red-700">Data początku przerwy jest w przyszłości.</p>'; lastCalc = null; return; }
    const r = calculate(inp);
    lastCalc = { ...r, inp };
    const maxBar = 16;
    const rows = r.segments.map(sg => {
      const fee = sg.feeA == null ? '<span class="text-amber-700">brak stawki w kalkulatorze</span>' : `<strong>${zl(sg.feeA)}</strong>`;
      const pctLabel = r.flat ? 'opłata stała' : `${sg.pct}% stawki`;
      const w = Math.min(100, (sg.days / maxBar) * 100);
      const bar = r.flat ? '' : `<div class="relative mt-2 h-2.5 rounded-full bg-slate-200"><div class="h-2.5 rounded-full ${sg.tier === 2 ? 'bg-red-600' : sg.tier === 1 ? 'bg-amber-500' : 'bg-emerald-500'}" data-w="${w.toFixed(2)}"></div><span class="bar-mark" data-l="${((3 / maxBar) * 100).toFixed(2)}"></span><span class="bar-mark" data-l="${((14 / maxBar) * 100).toFixed(2)}"></span></div><div class="mt-1 flex justify-between text-[11px] text-slate-400"><span>0</span><span>3 dni</span><span>14 dni</span><span>15+</span></div>`;
      return `<div class="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><div class="flex flex-wrap items-baseline justify-between gap-2"><span class="font-bold">${sg.year} r.</span><span class="text-sm text-slate-600">${fmtDate(sg.start)} – ${fmtDate(sg.end)} · ${dni(sg.days)} · ${pctLabel}</span><span>${fee}</span></div>${bar}</div>`;
    }).join('');
    const total = r.unknownA.length ? `${zl(r.totalA)} + nieznana stawka za ${r.unknownA.join(', ')} r.` : zl(r.totalA);
    box.innerHTML = `
      <p class="text-sm text-slate-500">Szacowana opłata UFG (${esc(CATEGORY_LABEL[inp.category])})</p>
      <p class="text-4xl font-extrabold ${r.totalA >= 9000 ? 'text-red-700' : 'text-blue-950'}">${total}</p>
      <p class="mt-1 text-sm text-slate-600">Łącznie ${dni(r.totalDays)} bez ochrony${r.crossYear ? ` w ${r.segments.length} latach kalendarzowych` : ''}.</p>
      <div class="mt-4 space-y-2">${rows}</div>`;
    applyDynStyles(box);

    const notes = [];
    if (r.crossYear) {
      const n = r.segments.length;
      let maxInfo = '';
      if (!r.flat) {
        const maxA = r.segments.map(sg => feeFor(inp.category, sg.year, 15)), maxB = r.segments.map(sg => feeFor(inp.category, Math.max(sg.year, inp.detectionYear), 15));
        if (!maxA.includes(null) && !maxB.includes(null)) {
          const sA = maxA.reduce((a, b) => a + b, 0), sB = maxB.reduce((a, b) => a + b, 0);
          maxInfo = ` Gdyby przerwa przekroczyła 14 dni w każdym z tych lat, łączna kwota wyniosłaby ${zl(sA)}${sB !== sA ? ` (stawki z roku przerwy) lub ${zl(sB)} (stawki z roku stwierdzenia)` : ''}.`;
        }
      }
      notes.push(`<div class="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300 text-sm text-amber-950"><p class="font-extrabold">⚠ Pułapka przełomu roku</p><p class="mt-1">Twoja przerwa obejmuje ${n} ${plural(n, 'rok kalendarzowy', 'lata kalendarzowe', 'lat kalendarzowych')}. Zgodnie z art. 88 ust. 3 ustawy okres bez ochrony ocenia się osobno w każdym roku – UFG może naliczyć <strong>${n} ${plural(n, 'opłatę', 'odrębne opłaty', 'odrębnych opłat')}</strong> (np. w osobnych wezwaniach).${maxInfo}</p></div>`);
    }
    if (!r.unknownB && r.totalB !== r.totalA) {
      notes.push(`<div class="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 text-sm text-blue-950"><p class="font-bold">Wariant: stawki z roku stwierdzenia (${inp.detectionYear} r.) – ${zl(r.totalB)}</p><p class="mt-1">Źródła są rozbieżne, czy za przerwę z wcześniejszego roku, wykrytą później, UFG stosuje stawkę z roku przerwy, czy z roku stwierdzenia. Porównaj obie kwoty z wezwaniem – jeśli UFG zastosował wyższą, zapytaj o podstawę wyliczenia.</p></div>`);
    }
    if (r.unknownA.length) notes.push(`<div class="rounded-2xl bg-slate-100 p-4 text-sm">Brak stawek dla roku ${r.unknownA.join(', ')}. UFG ogłasza wysokość opłat na dany rok do 3 stycznia (art. 88 ust. 3a).</div>`);
    if (inp.ongoing) {
      const cur = r.segments[r.segments.length - 1];
      let msg;
      if (r.flat) msg = 'Opłata za ten rok jest stała. Zawrzyj umowę jak najszybciej – od 1 stycznia rozpoczyna się kolejny rok kalendarzowy.';
      else if (cur.days <= 14) {
        const thr = cur.days <= 3 ? 4 : 15;
        const when = addDays(cur.start, thr - 1);
        const next = feeFor(inp.category, cur.year, thr);
        msg = `Za ${dni(diffDays(inp.today, when))} (${fmtDate(when)}) przekroczysz próg ${thr - 1} dni – opłata za ${cur.year} r. wzrośnie z ${zl(cur.feeA || 0)} do <strong>${next == null ? '—' : zl(next)}</strong>.`;
      } else msg = `Za ${cur.year} r. osiągnięto już maksymalną stawkę. Od 1 stycznia ${cur.year + 1} r. przerwa będzie liczona od nowa i może oznaczać kolejną opłatę.`;
      notes.push(`<div class="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 text-sm text-red-900"><p class="font-extrabold">Nadal nie masz OC</p><p class="mt-1">${msg}</p><a data-aff href="#kup-oc" class="mt-3 inline-block rounded-lg bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-800">Porównaj ceny OC i kup teraz →</a></div>`);
    }
    const dl = deadlineInfo(S.f.k_delivery, inp.today);
    if (dl) notes.push(deadlineHtml(dl));
    warn.innerHTML = notes.join('<div class="h-3"></div>');
    applyAffiliate(warn);

    if (!S.rManual && r.totalA > 0) { $('#r_amount').value = r.totalA; renderRaty(); }
  }
  function deadlineHtml(dl) {
    const late = dl.daysLeft < 0;
    const cls = late ? 'bg-red-50 ring-red-200 text-red-900' : dl.daysLeft <= 7 ? 'bg-amber-50 ring-amber-300 text-amber-950' : 'bg-emerald-50 ring-emerald-200 text-emerald-950';
    const head = late ? `Termin z wezwania minął ${dni(-dl.daysLeft)} temu` : dl.daysLeft === 0 ? 'Termin upływa dziś' : `Pozostało ${dni(dl.daysLeft)}`;
    const shift = dl.shifted ? ` Termin nominalny (${fmtDate(dl.nominal)}) przypada na dzień wolny od pracy – zgodnie z art. 115 k.c. może upłynąć w najbliższy dzień roboczy, ale dla bezpieczeństwa działaj wcześniej.` : '';
    const what = late ? ' Opłata mogła stać się wymagalna – złóż pismo niezwłocznie i poproś o nieskierowanie sprawy do egzekucji.' : ' Do tego dnia zapłać, przedstaw dokumenty albo złóż wniosek o ulgę.';
    return `<div class="rounded-2xl p-4 ring-1 text-sm ${cls}"><p class="font-extrabold">${head}</p><p class="mt-1">30 dni od doręczenia wezwania: <strong>${fmtDate(dl.effective)} (${weekday(dl.effective)})</strong>.${shift}${what}</p></div>`;
  }

  /* =====================================================================
     MODUŁ 1b – SYMULATOR RAT
     ===================================================================== */
  function renderRaty() {
    const amount = pos($('#r_amount').value), n = Math.min(24, Math.max(1, int($('#r_n').value, 24)));
    $('#r_nOut').textContent = n;
    if (!validIso($('#r_first').value)) $('#r_first').value = addMonths(todayIso(), 1);
    const first = $('#r_first').value;
    if (amount <= 0) { $('#r_rate').textContent = '—'; $('#r_summary').textContent = 'Wpisz kwotę opłaty.'; $('#r_schedule').innerHTML = ''; return; }
    const p = installmentPlan(amount, n);
    $('#r_rate').textContent = n === 1 ? zl2(p.total) : zl2(p.rate) + ' / mies.';
    $('#r_summary').textContent = n === 1 ? 'Jednorazowa zapłata całej kwoty.' :
      (p.last === p.rate ? `${n} równych rat po ${zl2(p.rate)} = ${zl2(p.total)} (0% odsetek).` : `${n - 1} × ${zl2(p.rate)} + ostatnia rata ${zl2(p.last)} = ${zl2(p.total)} (0% odsetek).`);
    let left = p.total, html = '';
    for (let i = 1; i <= n; i++) {
      const amt = i === n ? p.last : p.rate;
      left = Math.round((left - amt) * 100) / 100;
      html += `<tr><td class="p-2">${i}</td><td class="p-2">${fmtDate(addMonths(first, i - 1))}</td><td class="p-2 text-right">${zl2(amt)}</td><td class="p-2 text-right text-blue-200">${zl2(Math.max(0, left))}</td></tr>`;
    }
    $('#r_schedule').innerHTML = html;
  }

  /* =====================================================================
     MODUŁ 2 – KREATOR WNIOSKU
     ===================================================================== */
  function buildBudgetFields() {
    const mk = ([k, label]) => `<div><label class="lbl text-xs" for="f_${k}">${label}</label><input id="f_${k}" data-f="${k}" type="number" min="0" step="0.01" inputmode="decimal" class="field" placeholder="0"></div>`;
    $('#incomeFields').innerHTML = INCOME_FIELDS.map(mk).join('');
    $('#expenseFields').innerHTML = EXPENSE_FIELDS.map(mk).join('');
  }
  function applyVisibility() {
    const p = S.f.pathway || '', g = S.f.cGround || '', farm = FLAT.includes(S.f.category);
    $$('[data-show]').forEach(el => { const v = el.dataset.show; el.hidden = v === '-' ? !!p : !(p && v.includes(p)); });
    $$('[data-ground]').forEach(el => { el.hidden = !(p === 'C' && el.dataset.ground.split(' ').includes(g)); });
    $$('[data-farm]').forEach(el => { el.hidden = (el.dataset.farm === '1') !== farm; });
    $$('[data-if]').forEach(el => { el.hidden = !S.f[el.dataset.if]; });
    $$('[data-amode]').forEach(el => { el.hidden = (S.f.aMode || 'raty') !== el.dataset.amode; });
    $$('[data-btype]').forEach(el => { el.hidden = (S.f.bType || 'full') !== el.dataset.btype; });
  }
  function wizardAmount() { return pos(S.f.amount); }
  function applicantG() { const K = S.f.gender === 'K'; return (m, w) => (K ? w : m); }

  function renderBudgetSummary() {
    const b = budgetOf(S.f), amount = wizardAmount();
    const tile = (label, val, cls = '') => `<div class="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><div class="text-xs text-slate-500">${label}</div><div class="text-lg font-extrabold ${cls}">${val}</div></div>`;
    let html = tile('Dochody netto / mies.', zl(b.income), 'text-emerald-700') + tile('Stałe wydatki / mies.', zl(b.expenses), 'text-red-700') +
      tile('Saldo miesięczne', zl(b.balance), b.balance <= 0 ? 'text-red-700' : 'text-blue-950') +
      tile('Dochód na osobę', zl(Math.round(b.perPerson)), b.perPerson < b.criterion ? 'text-red-700' : '');
    if (b.income > 0) {
      html += `<div class="sm:col-span-2 md:col-span-4 text-sm text-slate-600">${b.perPerson < b.criterion ? `Dochód na osobę jest niższy niż kryterium dochodowe pomocy społecznej (${zl(b.criterion)} ${b.persons === 1 ? 'dla osoby samotnie gospodarującej' : 'na osobę w rodzinie'}) – to mocny argument we wniosku o umorzenie.` : `Kryterium dochodowe pomocy społecznej: ${zl(b.criterion)} ${b.persons === 1 ? 'dla osoby samotnie gospodarującej' : 'na osobę w rodzinie'} (orientacyjnie).`}${amount > 0 ? ` Opłata to ok. ${nf1.format(amount / b.income)}-krotność miesięcznego dochodu gospodarstwa.` : ''}</div>`;
    }
    $('#budgetSummary').innerHTML = html;
    const hint = $('#f_aHint');
    if (S.f.pathway === 'A' && (S.f.aMode || 'raty') === 'raty' && amount > 0) {
      const p = installmentPlan(amount, int(S.f.aN, 24));
      $('#f_aRate').textContent = `Rata: ${zl2(p.rate)}${p.last !== p.rate ? ` (ostatnia ${zl2(p.last)})` : ''}`;
      hint.innerHTML = b.filled && b.balance < p.rate ? `<span class="text-amber-800">Rata (${zl2(p.rate)}) przekracza Twoją miesięczną nadwyżkę (${zl(b.balance)}). Rozważ większą liczbę rat albo ścieżkę B (umorzenie).</span>` : '';
    } else { $('#f_aRate').textContent = ''; hint.innerHTML = ''; }
    $('#f_aNOut').textContent = int(S.f.aN, 24);
    $('#f_bNOut').textContent = int(S.f.bN, 24);
    const part = pos(S.f.bPart);
    $('#f_bSubLabel').textContent = (S.f.bType === 'partial')
      ? `Rozłóż pozostałą część opłaty${amount > 0 && part > 0 && part < amount ? ` (${zl(amount - part)})` : ''} na raty`
      : 'Wniosek ewentualny: jeśli UFG nie umorzy opłaty – rozłożenie na raty';
  }

  function renderDeadlineBox() {
    const dl = deadlineInfo(S.f.deliveryDate, todayIso());
    $('#f_deadline').innerHTML = dl ? deadlineHtml(dl).replace('rounded-2xl', 'rounded-lg') : 'Podaj datę doręczenia, aby policzyć termin 30 dni.';
  }
  function renderCHelpers() {
    let txt = '';
    if (validIso(S.f.c_realFrom) && validIso(S.f.c_realTo) && isoToT(S.f.c_realTo) >= isoToT(S.f.c_realFrom)) {
      const r = calculate({ category: cat(S.f.category), start: S.f.c_realFrom, end: S.f.c_realTo });
      txt = `Rzeczywista przerwa: ${dni(r.totalDays)} → opłata wg kalkulatora: <strong>${zl(r.totalA)}</strong>`;
    }
    $('#c_realCalc').innerHTML = txt;
    let txt2 = '';
    if (gapDays()) {
      const r = calculate({ category: cat(S.f.c_realCat), start: S.f.gapStart, end: S.f.gapEnd });
      txt2 = `Dla właściwej kategorii i okresu ${dni(r.totalDays)} opłata wynosi: <strong>${zl(r.totalA)}</strong>`;
    } else txt2 = 'Uzupełnij okres przerwy w kroku 2, aby wyliczyć właściwą kwotę.';
    $('#c_catCalc').innerHTML = txt2;
  }
  function gapDays() {
    if (!validIso(S.f.gapStart) || !validIso(S.f.gapEnd) || isoToT(S.f.gapEnd) < isoToT(S.f.gapStart)) return 0;
    return diffDays(S.f.gapStart, S.f.gapEnd) + 1;
  }

  /* --- Załączniki --- */
  function attachmentDefaults() {
    const f = S.f, p = f.pathway, b = budgetOf(f), list = [['wezwanie', true]];
    if (p === 'A') {
      list.push(['polisa_nowa', !!f.j_nowa], ['budzet', !!f.aIncludeBudget], ['dochody', true], ['wyciag', false], ['wydatki', false]);
    } else if (p === 'B') {
      list.push(['budzet', true], ['dochody_wszyscy', true], ['swiadczenia', pos(f.inc_benefits) > 0], ['emerytura', !!f.s_emeryt || pos(f.inc_pension) > 0],
        ['pup', !!f.s_bezrobocie && !!f.s_pup], ['orzeczenie', !!f.s_niepelnosprawnosc], ['medyczne', !!f.s_choroba || pos(f.exp_medical) > 0],
        ['kredyty', pos(f.exp_loans) > 0 || pos(f.debts) > 0], ['komornik', !!f.s_komornik], ['oplaty', true], ['dzieci', b.dependents > 0],
        ['zdarzenie', !!f.s_zdarzenie], ['wyciag', true], ['polisa_nowa', !!f.j_nowa]);
    } else if (p === 'C') {
      const by = {
        ciaglosc: [['polisa_okres', true], ['zaswiadczenie_tu', true], ['skladka', false]],
        zbycie: [['umowa_sprzedazy', true], ['zawiadomienie_tu', !!f.c_insurerNotified], ['zgloszenie_zbycia', !!f.c_registryNotified]],
        kradziez: [['policja', true], ['wyrejestrowanie', !!f.c_deregDate]],
        demontaz: [['demontaz', true], ['wyrejestrowanie', true]],
        wycofanie: [['decyzja_wycofanie', true]],
        blad_okresu: [['polisy_ciaglosc', true]],
        blad_kategorii: [['dowod_rej', true]],
        inne: []
      };
      list.push(...(Object.prototype.hasOwnProperty.call(by, f.cGround) ? by[f.cGround] : []));
    }
    return list;
  }
  function selectedAttachments() {
    const items = attachmentDefaults().filter(([id, def]) => (Object.prototype.hasOwnProperty.call(S.attOverride, id) ? S.attOverride[id] : def)).map(([id]) => ATTACHMENTS[id]);
    String(S.f.attCustom || '').split('\n').map(x => u(x)).filter(Boolean).slice(0, 20).forEach(x => items.push(x));
    return items;
  }
  function renderAttachments() {
    $('#attList').innerHTML = attachmentDefaults().map(([id, def]) => {
      const on = Object.prototype.hasOwnProperty.call(S.attOverride, id) ? S.attOverride[id] : def;
      return `<label class="flex gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200"><input type="checkbox" data-att="${esc(id)}" class="mt-1 h-4 w-4" ${on ? 'checked' : ''}> <span>${esc(ATTACHMENTS[id])}</span></label>`;
    }).join('');
  }

  /* =====================================================================
     TREŚĆ PISMA – wspólny model bloków dla podglądu HTML i PDF
     ===================================================================== */
  const ACT = 'ustawy z dnia 22 maja 2003 r. o ubezpieczeniach obowiązkowych, Ubezpieczeniowym Funduszu Gwarancyjnym i Polskim Biurze Ubezpieczycieli Komunikacyjnych';
  function insuranceName(c) {
    if (c === 'rolnicy') return 'ubezpieczenia OC rolników z tytułu posiadania gospodarstwa rolnego';
    if (c === 'budynki') return 'ubezpieczenia budynków wchodzących w skład gospodarstwa rolnego od ognia i innych zdarzeń losowych';
    return 'ubezpieczenia OC posiadaczy pojazdów mechanicznych';
  }
  function vehicleText(f) {
    if (FLAT.includes(f.category)) return u(f.subject);
    const mm = [u(f.make), u(f.model)].filter(Boolean).join(' ');
    return [mm, f.reg ? `nr rej. ${u(f.reg).toUpperCase()}` : '', f.vin ? `VIN ${u(f.vin).toUpperCase()}` : ''].filter(Boolean).join(', ');
  }
  function periodText(f) {
    const d = gapDays();
    return d ? `od dnia ${fmtDate(f.gapStart)} do dnia ${fmtDate(f.gapEnd)} (${dni(d)})` : '';
  }
  function summonsSentence(f) {
    const amount = wizardAmount();
    const parts = [`Wezwaniem${f.summonsDate ? ` z dnia ${fmtDate(f.summonsDate)}` : ''}${f.deliveryDate ? ` (doręczonym dnia ${fmtDate(f.deliveryDate)})` : ''}${u(f.caseNo) ? `, sygn. ${u(f.caseNo)},` : ''} Ubezpieczeniowy Fundusz Gwarancyjny wezwał mnie do uiszczenia opłaty w kwocie ${zl(amount)} z tytułu niespełnienia obowiązku zawarcia umowy ${insuranceName(f.category)}`];
    const veh = vehicleText(f), per = periodText(f);
    if (veh && !FLAT.includes(f.category)) parts.push(` w odniesieniu do pojazdu ${veh}`);
    else if (veh) parts.push(` (${veh})`);
    if (per) parts.push(` w okresie ${per}`);
    return parts.join('') + '.';
  }
  function headerBlocks(f) {
    const B = [];
    B.push({ t: 'right', text: `${u(f.letterCity) || u(f.city) || '[miejscowość]'}, dnia ${fmtDateLong(validIso(f.letterDate) ? f.letterDate : todayIso())}` });
    const sender = [`**${u(f.fullName) || '[imię i nazwisko]'}**`, u(f.street) || '[ulica i numer]', `${u(f.postal) || '[kod]'} ${u(f.city) || '[miejscowość]'}`];
    if (u(f.pesel)) sender.push(`PESEL: ${u(f.pesel)}`);
    if (u(f.phone)) sender.push(`tel.: ${u(f.phone)}`);
    if (u(f.email)) sender.push(`e-mail: ${u(f.email)}`);
    const recipient = String(f.ufgAddr || CONFIG.ufgAddress).split('\n').map(u).filter(Boolean).slice(0, 8);
    B.push({ t: 'parties', sender, recipient });
    const meta = [];
    if (u(f.caseNo)) meta.push(`Sygnatura sprawy: **${u(f.caseNo)}**`);
    meta.push(`Dotyczy: wezwania${f.summonsDate ? ` z dnia ${fmtDate(f.summonsDate)}` : ''} do uiszczenia opłaty za niespełnienie obowiązku zawarcia umowy ${insuranceName(f.category)}${wizardAmount() > 0 ? ` – kwota **${zl(wizardAmount())}**` : ''}`);
    const veh = vehicleText(f);
    if (veh) meta.push(`${FLAT.includes(f.category) ? 'Przedmiot ubezpieczenia' : 'Pojazd'}: ${veh}`);
    if (periodText(f)) meta.push(`Okres wskazany w wezwaniu: ${periodText(f)}`);
    B.push({ t: 'meta', lines: meta });
    return B;
  }
  function justificationSentences(f, g) {
    const out = [];
    if (f.j_nowa) {
      const ins = u(f.np_insurer), no = u(f.np_no);
      out.push(`Niezwłocznie po stwierdzeniu braku ochrony ${g('zawarłem', 'zawarłam')} nową umowę ubezpieczenia${ins ? ` z ${ins}` : ''}${no ? ` (polisa nr ${no})` : ''}${validIso(f.np_from) ? `, obowiązującą od dnia ${fmtDate(f.np_from)}` : ''}${FLAT.includes(f.category) ? '' : ' – pojazd jest obecnie ubezpieczony'}.`);
    }
    if (f.j_pierwszy) out.push(`Dotychczas zawsze terminowo ${g('wywiązywałem', 'wywiązywałam')} się z obowiązku ubezpieczenia – przerwa miała charakter jednorazowy.`);
    if (f.j_brak_szkody) out.push('W okresie przerwy nie doszło do żadnej szkody z udziałem pojazdu, a Fundusz nie poniósł z tego tytułu żadnych wypłat.');
    return out;
  }
  function financialSentences(f, g) {
    const out = [];
    if (f.j_jednorazowo) out.push('Jednorazowa zapłata opłaty pozbawiłaby mnie środków niezbędnych na bieżące utrzymanie.');
    if (f.j_zobowiazania) out.push('Jednocześnie spłacam inne zobowiązania finansowe (kredyty, pożyczki), co dodatkowo ogranicza moje możliwości płatnicze.');
    if (f.j_utrzymanie) out.push(`Mam na utrzymaniu członków rodziny, za których jestem ${g('odpowiedzialny', 'odpowiedzialna')} finansowo.`);
    return out;
  }
  function householdSentence(b) {
    return b.persons === 1 ? 'Prowadzę jednoosobowe gospodarstwo domowe.'
      : `Moje gospodarstwo domowe liczy ${b.persons} ${plural(b.persons, 'osobę', 'osoby', 'osób')}${b.dependents ? `, w tym ${b.dependents} ${plural(b.dependents, 'osobę pozostającą', 'osoby pozostające', 'osób pozostających')} na moim utrzymaniu` : ''}.`;
  }
  function budgetSentences(f, amount, withCriterion) {
    const b = budgetOf(f); if (!b.filled) return [];
    const out = [householdSentence(b)];
    out.push(`Łączny miesięczny dochód netto gospodarstwa domowego wynosi **${zl(b.income)}**, tj. **${zl(Math.round(b.perPerson * 100) / 100)} na osobę**.${withCriterion && b.perPerson < b.criterion ? ` Kwota ta jest niższa od kryterium dochodowego uprawniającego do świadczeń z pomocy społecznej (${zl(b.criterion)} ${b.persons === 1 ? 'dla osoby samotnie gospodarującej' : 'na osobę w rodzinie'}).` : ''}`);
    if (b.expenses > 0) out.push(`Stałe, niezbędne wydatki wynoszą **${zl(b.expenses)}** miesięcznie (szczegółowe zestawienie – Załącznik nr 1). ${b.balance <= 0 ? 'Wydatki te wyczerpują całość dochodów, wobec czego nie dysponuję żadnymi wolnymi środkami.' : `Po ich pokryciu pozostaje kwota ok. ${zl(Math.round(b.balance))} miesięcznie na wszystkie pozostałe potrzeby.`}`);
    if (amount > 0 && b.income > 0) out.push(`Opłata w kwocie ${zl(amount)} stanowi ok. ${nf1.format(amount / b.income)}-krotność łącznego miesięcznego dochodu mojego gospodarstwa domowego.`);
    return out;
  }
  function assetSentences(f) {
    const out = [], sav = pos(f.savings), debts = pos(f.debts), amount = wizardAmount();
    if (sav <= 0) out.push('Nie posiadam oszczędności ani majątku, którego spieniężenie pozwoliłoby na zapłatę opłaty bez uszczerbku dla utrzymania koniecznego.');
    else if (sav < amount) out.push(`Posiadane oszczędności (${zl(sav)}) nie wystarczają na zapłatę opłaty i stanowią jedyne zabezpieczenie na wypadek nieprzewidzianych wydatków.`);
    if (debts > 0) out.push(`Moje łączne zadłużenie wynosi ${zl(debts)}.`);
    return out;
  }
  function lifeSentences(f, g) {
    const out = [];
    const stopien = ['lekkim', 'umiarkowanym', 'znacznym'].includes(f.s_stopien) ? f.s_stopien : 'umiarkowanym';
    if (f.s_bezrobocie) out.push(`Pozostaję bez pracy${f.s_pup ? ` i jestem ${g('zarejestrowany', 'zarejestrowana')} w powiatowym urzędzie pracy jako osoba bezrobotna` : ''}.`);
    if (f.s_niepelnosprawnosc) out.push(`Posiadam orzeczenie o niepełnosprawności w stopniu ${stopien}, co istotnie ogranicza moje możliwości zarobkowe.`);
    if (f.s_choroba) out.push('W mojej rodzinie występuje przewlekła choroba, która generuje stałe koszty leczenia i zakupu leków.');
    if (f.s_samotny) out.push('Samotnie wychowuję dziecko (dzieci) i jestem jedyną osobą zapewniającą mu (im) utrzymanie.');
    if (f.s_emeryt) out.push('Utrzymuję się ze świadczenia emerytalnego lub rentowego, które jest moim jedynym stałym źródłem dochodu.');
    if (f.s_opiekun) out.push('Sprawuję stałą opiekę nad osobą niesamodzielną, co ogranicza moją aktywność zawodową.');
    if (f.s_komornik) out.push('Toczy się wobec mnie postępowanie egzekucyjne prowadzone przez komornika sądowego, co dodatkowo uszczupla moje dochody.');
    if (f.s_zdarzenie) out.push(`Moja sytuacja pogorszyła się także wskutek zdarzenia losowego, którego nie ${g('mogłem', 'mogłam')} przewidzieć.`);
    if (u(f.lifeText)) out.push(u(f.lifeText));
    return out;
  }
  function signatureAndAttachments(B) {
    B.push({ t: 'sign' });
    const att = selectedAttachments();
    if (att.length) B.push({ t: 'att', items: att });
  }
  function budgetAnnex(B, f, letterDateIso) {
    const b = budgetOf(f), g = applicantG();
    B.push({ t: 'pagebreak' });
    B.push({ t: 'small', text: `Załącznik nr 1 do pisma z dnia ${fmtDate(letterDateIso)}` });
    B.push({ t: 'title', text: 'OŚWIADCZENIE', sub: 'o sytuacji rodzinnej, majątkowej i o dochodach' });
    B.push({ t: 'p', text: `${g('Ja, niżej podpisany', 'Ja, niżej podpisana')} **${u(f.fullName) || '[imię i nazwisko]'}**, zam. ${u(f.street) || '[adres]'}, ${u(f.postal)} ${u(f.city)}, oświadczam, co następuje:` });
    B.push({ t: 'h', level: 2, text: 'I. Skład gospodarstwa domowego' });
    B.push({ t: 'p', text: householdSentence(b) });
    const members = String(f.members || '').split('\n').map(u).filter(Boolean).slice(0, 15);
    if (members.length) B.push({ t: 'ul', items: members });
    B.push({ t: 'h', level: 2, text: 'II. Miesięczne dochody netto gospodarstwa domowego' });
    const inc = INCOME_FIELDS.filter(([k]) => pos(f[k]) > 0).map(([k, l]) => [l, zl2(pos(f[k]))]);
    B.push({ t: 'table', head: ['Źródło dochodu', 'Kwota / mies.'], rows: [...(inc.length ? inc : [['brak dochodów', zl2(0)]]), { c: ['RAZEM', zl2(b.income)], b: true }, { c: [`Dochód na 1 osobę (${b.persons} ${plural(b.persons, 'osoba', 'osoby', 'osób')})`, zl2(Math.round(b.perPerson * 100) / 100)], b: true }] });
    B.push({ t: 'h', level: 2, text: 'III. Stałe miesięczne wydatki' });
    const exp = EXPENSE_FIELDS.filter(([k]) => pos(f[k]) > 0).map(([k, l]) => [l, zl2(pos(f[k]))]);
    B.push({ t: 'table', head: ['Rodzaj wydatku', 'Kwota / mies.'], rows: [...(exp.length ? exp : [['—', zl2(0)]]), { c: ['RAZEM', zl2(b.expenses)], b: true }] });
    B.push({ t: 'h', level: 2, text: 'IV. Bilans miesięczny' });
    B.push({ t: 'table', head: ['Pozycja', 'Kwota'], rows: [['Dochody netto', zl2(b.income)], ['Stałe wydatki', zl2(b.expenses)], { c: ['Pozostaje do dyspozycji', zl2(b.balance)], b: true }] });
    B.push({ t: 'h', level: 2, text: 'V. Majątek i zobowiązania' });
    B.push({ t: 'table', head: ['Składnik', 'Opis / wartość'], rows: [['Oszczędności (gotówka, rachunki)', pos(f.savings) > 0 ? zl2(pos(f.savings)) : 'brak'], ['Nieruchomości', u(f.realEstate) || 'brak'], ['Pojazdy', u(f.vehicles) || 'brak'], ['Łączne zadłużenie', pos(f.debts) > 0 ? zl2(pos(f.debts)) : 'brak']] });
    const life = lifeSentences(f, g).filter(x => x !== u(f.lifeText));
    if (life.length) { B.push({ t: 'h', level: 2, text: 'VI. Szczególne okoliczności' }); B.push({ t: 'ul', items: life }); }
    B.push({ t: 'closing', text: 'Oświadczam, że powyższe dane są zgodne z prawdą. Na wezwanie Funduszu przedstawię dokumenty potwierdzające podane informacje.', place: `${u(f.letterCity) || u(f.city) || '[miejscowość]'}, dnia ${fmtDate(letterDateIso)}` });
  }

  function buildLetter() {
    const f = S.f, g = applicantG(), amount = wizardAmount(), p = f.pathway;
    const letterDate = validIso(f.letterDate) ? f.letterDate : todayIso();
    const B = headerBlocks(f);
    const reason = Object.prototype.hasOwnProperty.call(REASONS, f.reason) ? REASONS[f.reason] : REASONS.inny;
    const intro = `Działając we własnym imieniu, na podstawie art. 94 ust. 1 ${ACT} (dalej: „ustawa”) w związku z postanowieniami Statutu Ubezpieczeniowego Funduszu Gwarancyjnego, wnoszę o:`;
    const noEnforcement = 'nieskierowanie należności na drogę postępowania egzekucyjnego do czasu rozpatrzenia niniejszego wniosku.';
    let includeAnnex = false;

    if (p === 'A') {
      const mode = f.aMode === 'odroczenie' ? 'odroczenie' : 'raty', n = Math.min(24, Math.max(2, int(f.aN, 24))), plan = installmentPlan(amount, n);
      const first = validIso(f.aFirst) ? f.aFirst : addMonths(todayIso(), 1);
      B.push({ t: 'title', text: mode === 'raty' ? `WNIOSEK o rozłożenie opłaty na ${ratyPhrase(n)}` : 'WNIOSEK o odroczenie terminu płatności opłaty', sub: '(ulga w spłacie – art. 94 ust. 1 ustawy)' });
      B.push({ t: 'p', text: intro });
      const split = plan.last === plan.rate ? ` w równej wysokości ${zl2(plan.rate)}`
        : n === 2 ? ` – pierwszą ratę w kwocie ${zl2(plan.rate)} i drugą ratę w kwocie ${zl2(plan.last)}`
        : ` – ${n - 1} ${plural(n - 1, 'ratę', 'raty', 'rat')} po ${zl2(plan.rate)} oraz ostatnią ratę w kwocie ${zl2(plan.last)}`;
      const item1 = mode === 'raty'
        ? `udzielenie ulgi w spłacie opłaty w kwocie **${zl(amount)}** poprzez rozłożenie jej na **${ratyPhrase(n)}**${split}, płatne do ${+first.slice(8)}. dnia każdego miesiąca, począwszy od dnia ${fmtDateLong(first)};`
        : `udzielenie ulgi w spłacie opłaty w kwocie **${zl(amount)}** poprzez odroczenie terminu jej płatności do dnia **${validIso(f.aDeferTo) ? fmtDateLong(f.aDeferTo) : '[data]'}**;`;
      B.push({ t: 'ol', items: [item1, noEnforcement] });
      B.push({ t: 'h', text: 'UZASADNIENIE' });
      B.push({ t: 'p', text: summonsSentence(f) });
      const why = [reason.letter(g), u(f.reasonText)].filter(Boolean).join(' ');
      if (why) B.push({ t: 'p', text: why });
      B.push({ t: 'p', text: 'Nie uchylam się od obowiązku uiszczenia opłaty. Jej jednorazowa zapłata w terminie wskazanym w wezwaniu przekracza jednak moje bieżące możliwości finansowe.' });
      const js = justificationSentences(f, g); if (js.length) B.push({ t: 'p', text: js.join(' ') });
      const fs = financialSentences(f, g); if (fs.length) B.push({ t: 'p', text: fs.join(' ') });
      const bs = budgetSentences(f, amount, false); if (bs.length) B.push({ t: 'p', text: bs.join(' ') });
      const b = budgetOf(f);
      if (mode === 'raty') B.push({ t: 'p', text: `Proponowana wysokość raty (${zl2(plan.rate)} miesięcznie) została ustalona z uwzględnieniem moich realnych możliwości finansowych${b.filled && b.balance >= plan.rate ? ' i mieści się w miesięcznej nadwyżce mojego budżetu domowego' : ''}, co zapewni regularną spłatę całej należności.` });
      else B.push({ t: 'p', text: 'Wskazany termin pozwoli mi zgromadzić środki niezbędne do zapłaty całej należności bez uszczerbku dla utrzymania koniecznego.' });
      if (u(f.extra)) B.push({ t: 'p', text: u(f.extra) });
      B.push({ t: 'p', text: `Zobowiązuję się do terminowej spłaty ${mode === 'raty' ? 'rat' : 'opłaty w odroczonym terminie'}. Na wezwanie Funduszu przedstawię dodatkowe dokumenty potwierdzające moją sytuację.` });
      B.push({ t: 'p', text: 'Mając powyższe na uwadze, wnoszę jak na wstępie.' });
      includeAnnex = !!f.aIncludeBudget && b.filled;
    } else if (p === 'B') {
      const partial = f.bType === 'partial', part = Math.min(pos(f.bPart), amount), rest = Math.max(0, amount - part);
      const n = Math.min(24, Math.max(2, int(f.bN, 24)));
      B.push({ t: 'title', text: partial ? `WNIOSEK o częściowe umorzenie opłaty (w kwocie ${zl(part)})` : 'WNIOSEK o umorzenie opłaty w całości', sub: 'z uwagi na wyjątkowo trudną sytuację materialną, majątkową i życiową (art. 94 ust. 1 ustawy)' });
      B.push({ t: 'p', text: intro });
      const items = [partial ? `umorzenie opłaty w części, tj. w kwocie **${zl(part)}** (z kwoty ${zl(amount)});` : `umorzenie w całości opłaty w kwocie **${zl(amount)}**;`];
      if (f.bSubsidiary) {
        if (partial) { const pl = installmentPlan(rest, n); items.push(`rozłożenie pozostałej części opłaty (${zl(rest)}) na ${ratyPhrase(n)} w wysokości ok. ${zl2(pl.rate)};`); }
        else { const pl = installmentPlan(amount, n); items.push(`ewentualnie – w razie nieuwzględnienia wniosku z pkt 1 – udzielenie ulgi w spłacie poprzez rozłożenie opłaty na ${ratyPhrase(n)} w wysokości ok. ${zl2(pl.rate)};`); }
      }
      items.push(noEnforcement);
      B.push({ t: 'ol', items });
      B.push({ t: 'h', text: 'UZASADNIENIE' });
      B.push({ t: 'h', level: 2, text: '1. Okoliczności powstania przerwy w ubezpieczeniu' });
      B.push({ t: 'p', text: [summonsSentence(f), reason.letter(g), u(f.reasonText)].filter(Boolean).join(' ') });
      const js = justificationSentences(f, g); if (js.length) B.push({ t: 'p', text: js.join(' ') });
      B.push({ t: 'h', level: 2, text: '2. Sytuacja materialna i majątkowa' });
      const bs = budgetSentences(f, amount, true); if (bs.length) B.push({ t: 'p', text: bs.join(' ') });
      const as = assetSentences(f).concat(financialSentences(f, g)); if (as.length) B.push({ t: 'p', text: as.join(' ') });
      const life = lifeSentences(f, g);
      if (life.length) { B.push({ t: 'h', level: 2, text: '3. Sytuacja życiowa i zdrowotna' }); B.push({ t: 'p', text: life.join(' ') }); }
      B.push({ t: 'h', level: 2, text: `${life.length ? 4 : 3}. Podsumowanie` });
      const b = budgetOf(f);
      B.push({ t: 'p', text: `Wyegzekwowanie opłaty w pełnej wysokości pozbawiłoby ${b.persons > 1 ? 'mnie i członków mojej rodziny' : 'mnie'} środków niezbędnych do zaspokojenia podstawowych potrzeb życiowych. Moja sytuacja ma charakter wyjątkowy i nie wynika z lekceważenia obowiązku ubezpieczenia, dlatego – w mojej ocenie – zachodzą przesłanki do zastosowania art. 94 ust. 1 ustawy.` });
      if (u(f.extra)) B.push({ t: 'p', text: u(f.extra) });
      B.push({ t: 'p', text: 'Oświadczam, że dane zawarte we wniosku i w Załączniku nr 1 są zgodne z prawdą. Na wezwanie Funduszu przedstawię dodatkowe dokumenty.' });
      B.push({ t: 'p', text: 'Mając powyższe na uwadze, wnoszę jak na wstępie.' });
      includeAnnex = true;
    } else if (p === 'C') {
      const gr = f.cGround || '';
      const dl = deadlineInfo(f.deliveryDate, todayIso());
      const inTime = dl && dl.daysLeft >= 0;
      const correction = gr === 'blad_okresu' || gr === 'blad_kategorii';
      let correctAmount = null;
      if (gr === 'blad_okresu' && validIso(f.c_realFrom) && validIso(f.c_realTo) && isoToT(f.c_realTo) >= isoToT(f.c_realFrom)) correctAmount = calculate({ category: cat(f.category), start: f.c_realFrom, end: f.c_realTo }).totalA;
      if (gr === 'blad_kategorii' && gapDays()) correctAmount = calculate({ category: cat(f.c_realCat), start: f.gapStart, end: f.gapEnd }).totalA;
      B.push({ t: 'title', text: 'ODWOŁANIE (ZASTRZEŻENIA) OD WEZWANIA DO UISZCZENIA OPŁATY', sub: correction ? 'wraz z wnioskiem o skorygowanie wysokości opłaty' : 'wraz z dokumentami wykazującymi spełnienie (brak) obowiązku ubezpieczenia' });
      B.push({ t: 'p', text: `W odpowiedzi na wezwanie${f.summonsDate ? ` z dnia ${fmtDate(f.summonsDate)}` : ''}${inTime ? ', w terminie 30 dni od jego doręczenia,' : ''} przedstawiam – zgodnie z art. 90 ust. 1 ${ACT} (dalej: „ustawa”) – stanowisko w sprawie wraz z dokumentami i wnoszę o:` });
      const items = [];
      if (correction) items.push(`ponowną weryfikację sprawy i skorygowanie wysokości opłaty${correctAmount != null ? ` do kwoty **${zl(correctAmount)}**` : ''} – zgodnie z ${gr === 'blad_okresu' ? 'rzeczywistym okresem pozostawania bez ochrony ubezpieczeniowej (art. 88 ust. 3 ustawy)' : 'rodzajem pojazdu wynikającym z dowodu rejestracyjnego (art. 88 ust. 2 i 4 ustawy)'};`);
      else items.push(`uznanie, że ${gr === 'ciaglosc' ? 'obowiązek zawarcia umowy ubezpieczenia OC został spełniony' : 'w okresie wskazanym w wezwaniu nie ciążył na mnie obowiązek zawarcia umowy ubezpieczenia OC'}, i odstąpienie od dochodzenia opłaty w kwocie ${zl(amount)};`);
      items.push('zamknięcie sprawy oraz pisemne poinformowanie mnie o sposobie jej rozstrzygnięcia;');
      items.push('nieskierowanie należności na drogę postępowania egzekucyjnego do czasu rozpatrzenia niniejszego pisma.');
      B.push({ t: 'ol', items });
      B.push({ t: 'h', text: 'UZASADNIENIE' });
      B.push({ t: 'p', text: summonsSentence(f) + ' Wezwanie jest w mojej ocenie bezzasadne' + (correction ? ' co do wysokości opłaty' : '') + ' z następujących przyczyn.' });
      const G = [];
      if (gr === 'ciaglosc') {
        G.push(`W okresie wskazanym w wezwaniu pojazd był objęty ochroną ubezpieczeniową OC na podstawie umowy zawartej z ${u(f.c_insurer) || '[zakład ubezpieczeń]'}${u(f.c_policyNo) ? ` (polisa nr ${u(f.c_policyNo)})` : ''}${validIso(f.c_from) && validIso(f.c_to) ? `, obowiązującej w okresie od dnia ${fmtDate(f.c_from)} do dnia ${fmtDate(f.c_to)}` : ''}. Obowiązek ubezpieczenia został zatem spełniony.`);
        G.push('Brak tej umowy w danych Funduszu może wynikać z nieprzekazania lub błędnego przekazania danych przez zakład ubezpieczeń albo z rozbieżności w danych pojazdu (np. numerze VIN lub numerze rejestracyjnym).');
      } else if (gr === 'zbycie') {
        G.push(`Dnia ${validIso(f.c_saleDate) ? fmtDate(f.c_saleDate) : '[data]'} ${g('zbyłem', 'zbyłam')} pojazd${u(f.c_buyer) ? ` na rzecz ${u(f.c_buyer)}` : ''} na podstawie umowy sprzedaży. Z chwilą zbycia ${g('przestałem', 'przestałam')} być posiadaczem pojazdu, a obowiązek ubezpieczenia OC w okresie wskazanym w wezwaniu spoczywał na nabywcy.`);
        if (validIso(f.c_insurerNotified)) G.push(`O zbyciu pojazdu ${g('zawiadomiłem', 'zawiadomiłam')} zakład ubezpieczeń dnia ${fmtDate(f.c_insurerNotified)}.`);
        if (validIso(f.c_registryNotified)) G.push(`Zbycie pojazdu ${g('zgłosiłem', 'zgłosiłam')} w wydziale komunikacji dnia ${fmtDate(f.c_registryNotified)}.`);
      } else if (gr === 'kradziez') {
        G.push(`Dnia ${validIso(f.c_theftDate) ? fmtDate(f.c_theftDate) : '[data]'} pojazd został skradziony, co ${g('zgłosiłem', 'zgłosiłam')} ${u(f.c_police) ? `w ${u(f.c_police)}` : 'na Policji'}${u(f.c_caseNo) ? ` (nr sprawy ${u(f.c_caseNo)})` : ''}. Od tej chwili nie ${g('władałem', 'władałam')} pojazdem.`);
        if (validIso(f.c_deregDate)) G.push(`Pojazd został wyrejestrowany dnia ${fmtDate(f.c_deregDate)}.`);
      } else if (gr === 'demontaz') {
        G.push(`Dnia ${validIso(f.c_scrapDate) ? fmtDate(f.c_scrapDate) : '[data]'} pojazd został przekazany do stacji demontażu${u(f.c_certNo) ? ` (zaświadczenie o demontażu pojazdu nr ${u(f.c_certNo)})` : ''}${validIso(f.c_deregDate) ? `, a następnie wyrejestrowany dnia ${fmtDate(f.c_deregDate)}` : ''}.`);
      } else if (gr === 'wycofanie') {
        G.push(`${u(f.c_decision) ? `Decyzją ${u(f.c_decision)}` : 'Decyzją właściwego organu'} pojazd został czasowo wycofany z ruchu na okres od dnia ${validIso(f.c_wFrom) ? fmtDate(f.c_wFrom) : '[data]'} do dnia ${validIso(f.c_wTo) ? fmtDate(f.c_wTo) : '[data]'}, obejmujący okres wskazany w wezwaniu.`);
      } else if (gr === 'blad_okresu') {
        const rd = validIso(f.c_realFrom) && validIso(f.c_realTo) ? diffDays(f.c_realFrom, f.c_realTo) + 1 : 0;
        G.push(`Okres pozostawania bez ochrony ubezpieczeniowej został ustalony nieprawidłowo. Rzeczywisty okres przerwy trwał ${rd > 0 ? `od dnia ${fmtDate(f.c_realFrom)} do dnia ${fmtDate(f.c_realTo)} (${dni(rd)})` : '[okres]'}${correctAmount != null ? `, co – zgodnie z art. 88 ust. 3 ustawy – uzasadnia opłatę w wysokości ${zl(correctAmount)}` : ''}. Potwierdzają to załączone polisy obejmujące okresy przed przerwą i po niej.`);
      } else if (gr === 'blad_kategorii') {
        G.push(`Pojazd został błędnie zakwalifikowany. Zgodnie z dowodem rejestracyjnym jest to ${CATEGORY_LABEL[cat(f.c_realCat)]}${correctAmount != null ? `, wobec czego właściwa wysokość opłaty wynosi ${zl(correctAmount)}` : ''} (art. 88 ust. 2 i 4 ustawy).`);
      }
      if (u(f.extra)) G.push(u(f.extra));
      G.forEach(t => B.push({ t: 'p', text: t }));
      B.push({ t: 'p', text: 'Powyższe okoliczności potwierdzają dokumenty załączone do niniejszego pisma.' });
      B.push({ t: 'p', text: 'Jednocześnie zastrzegam, że w razie nieuwzględnienia niniejszego odwołania przysługuje mi prawo wniesienia do sądu powszechnego powództwa o ustalenie spełnienia lub nieistnienia obowiązku ubezpieczenia (art. 10 ust. 2 ustawy).' });
      B.push({ t: 'p', text: 'Mając powyższe na uwadze, wnoszę jak na wstępie.' });
    } else {
      return [];
    }
    signatureAndAttachments(B);
    if (includeAnnex) budgetAnnex(B, f, letterDate);
    return B;
  }

  function buildInstructions() {
    const f = S.f, dl = deadlineInfo(f.deliveryDate, todayIso());
    const B = [];
    B.push({ t: 'title', text: 'INSTRUKCJA I LISTA KONTROLNA', sub: 'Nie dołączaj tej strony do pisma wysyłanego do UFG' });
    B.push({ t: 'h', level: 2, text: '1. Termin' });
    B.push({ t: 'p', text: dl ? `30 dni od doręczenia wezwania upływa **${fmtDate(dl.effective)} (${weekday(dl.effective)})**${dl.daysLeft >= 0 ? ` – zostało ${dni(dl.daysLeft)}` : ` – termin minął ${dni(-dl.daysLeft)} temu, dlatego złóż pismo niezwłocznie`}. Nie czekaj na ostatni dzień.` : 'Masz 30 dni od dnia doręczenia wezwania (art. 90 ust. 1 ustawy). Złóż pismo jak najszybciej.' });
    B.push({ t: 'h', level: 2, text: '2. Podpis' });
    B.push({ t: 'p', text: 'Wydrukuj pismo, sprawdź wszystkie dane (zwłaszcza sygnaturę sprawy, numer rejestracyjny i daty) i podpisz je własnoręcznie w miejscu oznaczonym „czytelny podpis”. Jeśli pismo zawiera Załącznik nr 1 – podpisz również oświadczenie.' });
    B.push({ t: 'h', level: 2, text: '3. Załączniki – lista kontrolna' });
    const att = selectedAttachments();
    B.push({ t: 'ul', items: (att.length ? att : ['(brak załączników)']).map(a => `[   ]  ${a}`) });
    B.push({ t: 'p', text: 'Dołączaj kopie dokumentów – oryginały zachowaj u siebie. Na kopiach nie zakrywaj danych potrzebnych do identyfikacji sprawy.' });
    B.push({ t: 'h', level: 2, text: '4. Jak złożyć pismo' });
    B.push({ t: 'ul', items: [
      'Elektronicznie przez Portal UFG (login.ufg.pl), jeżeli Twoja sprawa jest tam dostępna – zalogowanie umożliwia hasło z listu od UFG lub założone konto. Dołącz skan podpisanego pisma i załączników.',
      'Listem poleconym za zwrotnym potwierdzeniem odbioru na adres podany w wezwaniu. Zachowaj dowód nadania i kopię całej przesyłki.'
    ] });
    B.push({ t: 'h', level: 2, text: '5. Co dalej' });
    B.push({ t: 'ul', items: [
      'UFG rozpatruje każdą sprawę indywidualnie. Odpowiedź otrzymasz na adres korespondencyjny (lub w Portalu UFG).',
      'Rozstrzygnięcie Zarządu UFG w sprawie umorzenia lub ulgi w spłacie jest – zgodnie ze Statutem UFG – ostateczne. Jeśli UFG przyzna raty, płać je terminowo.',
      'Jeśli kwestionujesz sam obowiązek ubezpieczenia, możesz wnieść do sądu powszechnego powództwo o ustalenie spełnienia lub nieistnienia obowiązku ubezpieczenia (art. 10 ust. 2 ustawy) – rozważ konsultację z prawnikiem lub punktem nieodpłatnej pomocy prawnej.',
      'Jeżeli nadal nie masz OC – zawrzyj umowę natychmiast. Każdy nowy rok kalendarzowy bez ochrony to ryzyko kolejnej opłaty.'
    ] });
    B.push({ t: 'small', text: `Dokument przygotowany w serwisie ${CONFIG.siteName}. Serwis nie jest powiązany z UFG i nie świadczy pomocy prawnej.` });
    return B;
  }

  /* --- Renderowanie: znaczniki **pogrubienia** (dane użytkownika są z nich czyszczone funkcją u()) --- */
  function segs(str) {
    return String(str).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p => (p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p }));
  }
  function richHtml(str) { return segs(str).map(s => (s.bold ? `<strong>${esc(s.text)}</strong>` : esc(s.text))).join(''); }
  function blocksToHtml(blocks) {
    return blocks.map(b => {
      switch (b.t) {
        case 'right': return `<p class="mb-4 text-right">${richHtml(b.text)}</p>`;
        case 'parties': return `<div class="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4"><div>${b.sender.map(l => `<div>${richHtml(l)}</div>`).join('')}</div><div class="sm:pt-8 font-bold">${b.recipient.map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
        case 'meta': return `<div class="mb-5 text-[12px]">${b.lines.map(l => `<div>${richHtml(l)}</div>`).join('')}</div>`;
        case 'title': return `<div class="my-4 text-center"><div class="font-bold text-[15px]">${esc(b.text)}</div>${b.sub ? `<div class="text-[12px] italic">${esc(b.sub)}</div>` : ''}</div>`;
        case 'h': return `<div class="${b.level === 2 ? 'mt-3 mb-1 font-bold' : 'mt-4 mb-2 text-center font-bold tracking-wide'}">${esc(b.text)}</div>`;
        case 'p': return `<p class="mb-2">${richHtml(b.text)}</p>`;
        case 'ol': return `<ol class="mb-3 list-decimal pl-6 space-y-1">${b.items.map(i => `<li class="text-justify">${richHtml(i)}</li>`).join('')}</ol>`;
        case 'ul': return `<ul class="mb-3 list-disc pl-6 space-y-1">${b.items.map(i => `<li>${richHtml(i)}</li>`).join('')}</ul>`;
        case 'table': return `<table class="mb-3 w-full border-collapse text-[12px]"><thead><tr>${b.head.map(h => `<th class="border border-slate-400 bg-slate-100 p-1 text-left">${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => { const cells = Array.isArray(r) ? r : r.c; return `<tr class="${r.b ? 'font-bold' : ''}">${cells.map((c, i) => `<td class="border border-slate-400 p-1 ${i ? 'text-right' : ''}">${esc(c)}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;
        case 'sign': return '<div class="mt-8 mb-4 text-right"><div>…………………………………………</div><div class="text-[11px] text-slate-500">(czytelny podpis)</div></div>';
        case 'closing': return `<p class="mb-2">${richHtml(b.text)}</p><div class="mt-6 mb-4 flex items-end justify-between gap-4"><div>${esc(b.place)}</div><div class="text-center"><div>…………………………………………</div><div class="text-[11px] text-slate-500">(czytelny podpis)</div></div></div>`;
        case 'att': return `<div class="mt-2 font-bold">Załączniki:</div><ol class="list-decimal pl-6 text-[12px]">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
        case 'pagebreak': return '<hr class="my-6 border-dashed border-slate-400">';
        case 'small': return `<p class="mb-2 text-[11px] text-slate-500">${richHtml(b.text)}</p>`;
        default: return '';
      }
    }).join('');
  }
  /* Zablokowana część podglądu: same szare paski – prawdziwy tekst NIE trafia do strony przed płatnością */
  function placeholderHtml(blocks) {
    let lines = 0;
    blocks.forEach(b => { lines += b.t === 'table' ? b.rows.length + 1 : (b.t === 'ol' || b.t === 'ul' || b.t === 'att') ? b.items.length * 2 : b.t === 'pagebreak' ? 0 : 2; });
    lines = Math.min(60, Math.max(6, lines));
    let h = '';
    for (let i = 0; i < lines; i++) h += `<div class="mb-2 h-3 rounded bg-slate-300 ${i % 5 === 4 ? 'w-2/3' : 'w-full'}"></div>`;
    return `<div class="locked-blur" aria-hidden="true">${h}</div>`;
  }
  function blocksToPdf(blocks) {
    const content = [];
    let breakNext = false;
    const push = node => { if (breakNext) { node.pageBreak = 'before'; breakNext = false; } content.push(node); };
    const rich = s => segs(s).map(x => ({ text: x.text, bold: !!x.bold }));
    for (const b of blocks) {
      switch (b.t) {
        case 'right': push({ text: rich(b.text), alignment: 'right', margin: [0, 0, 0, 14] }); break;
        case 'parties': push({ columns: [{ width: '*', stack: b.sender.map(l => ({ text: rich(l) })) }, { width: 245, stack: b.recipient.map(l => ({ text: l, bold: true })), margin: [0, 26, 0, 0] }], columnGap: 16, margin: [0, 0, 0, 16] }); break;
        case 'meta': push({ stack: b.lines.map(l => ({ text: rich(l) })), fontSize: 9.5, margin: [0, 0, 0, 12] }); break;
        case 'title': push({ stack: [{ text: b.text, style: 'title' }].concat(b.sub ? [{ text: b.sub, style: 'subtitle' }] : []), margin: [0, 4, 0, 10] }); break;
        case 'h': push({ text: b.text, style: b.level === 2 ? 'h2' : 'h1' }); break;
        case 'p': push({ text: rich(b.text), alignment: 'justify', margin: [0, 0, 0, 6] }); break;
        case 'ol': push({ ol: b.items.map(i => ({ text: rich(i), alignment: 'justify', margin: [0, 0, 0, 3] })), margin: [8, 0, 0, 8] }); break;
        case 'ul': push({ ul: b.items.map(i => ({ text: rich(i), margin: [0, 0, 0, 2] })), margin: [8, 0, 0, 8] }); break;
        case 'table': push({
          table: { headerRows: 1, widths: ['*', 150], body: [b.head.map(h => ({ text: h, bold: true, fillColor: '#eef2f7' }))].concat(b.rows.map(r => { const cells = Array.isArray(r) ? r : r.c; return cells.map((c, i) => ({ text: String(c), bold: !!r.b, alignment: i ? 'right' : 'left' })); })) },
          layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8', paddingTop: () => 2, paddingBottom: () => 2 },
          fontSize: 9.5, margin: [0, 2, 0, 8]
        }); break;
        case 'sign': push({ stack: [{ text: '............................................................', margin: [0, 28, 0, 2] }, { text: '(czytelny podpis)', fontSize: 8.5, color: '#555555' }], alignment: 'right', unbreakable: true, margin: [0, 0, 0, 10] }); break;
        case 'closing': push({ unbreakable: true, stack: [
          { text: rich(b.text), alignment: 'justify', margin: [0, 2, 0, 0] },
          { columns: [{ width: '*', text: b.place, margin: [0, 30, 0, 0] }, { width: 200, alignment: 'center', stack: [{ text: '............................................................', margin: [0, 28, 0, 2] }, { text: '(czytelny podpis)', fontSize: 8.5, color: '#555555' }] }] }
        ] }); break;
        case 'att': push({ stack: [{ text: 'Załączniki:', bold: true, margin: [0, 4, 0, 3] }, { ol: b.items.map(i => ({ text: String(i) })), fontSize: 9.5 }], margin: [0, 0, 0, 6] }); break;
        case 'pagebreak': breakNext = true; break;
        case 'small': push({ text: rich(b.text), fontSize: 8.5, color: '#555555', margin: [0, 0, 0, 6] }); break;
      }
    }
    return content;
  }
  function pdfDoc(blocks, title) {
    return {
      pageSize: 'A4',
      pageMargins: [56, 50, 56, 60],
      info: { title, author: u(S.f.fullName) || CONFIG.siteName, subject: 'Pismo do Ubezpieczeniowego Funduszu Gwarancyjnego' },
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.22 },
      styles: {
        title: { fontSize: 13, bold: true, alignment: 'center' },
        subtitle: { fontSize: 9.5, italics: true, alignment: 'center', margin: [0, 2, 0, 0] },
        h1: { fontSize: 11, bold: true, alignment: 'center', margin: [0, 8, 0, 6], characterSpacing: 0.5 },
        h2: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 3] }
      },
      footer: (cur, total) => ({ text: `Strona ${cur} z ${total}`, alignment: 'center', fontSize: 8, color: '#777777', margin: [0, 26, 0, 0] }),
      content: blocksToPdf(blocks)
    };
  }

  /* --- pdfmake hostowany lokalnie (bez zewnętrznych CDN – brak ryzyka podmiany skryptu) --- */
  const PDFMAKE_BASE = 'assets/vendor/pdfmake-0.2.20/';
  function loadScript(src) {
    return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => { s.remove(); reject(new Error(src)); }; document.head.appendChild(s); });
  }
  let pdfMakePromise = null;
  function ensurePdfMake() {
    // vfs_fonts.js w pdfmake 0.2.x rejestruje czcionki przez addVirtualFileSystem (pdfMake.vfs pozostaje puste)
    if (!pdfMakePromise) {
      pdfMakePromise = (async () => {
        if (!(window.pdfMake && typeof window.pdfMake.createPdf === 'function')) await loadScript(PDFMAKE_BASE + 'pdfmake.min.js');
        await loadScript(PDFMAKE_BASE + 'vfs_fonts.js');
        if (window.pdfMake && typeof window.pdfMake.createPdf === 'function') return window.pdfMake;
        throw new Error('pdfmake');
      })().catch(() => { pdfMakePromise = null; throw new Error('Nie udało się wczytać generatora PDF. Odśwież stronę i spróbuj ponownie.'); });
    }
    return pdfMakePromise;
  }
  function safeName(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  async function downloadPdf(kind) {
    if (!isUnlocked()) { if (kind === 'letter') onBuy(); return; }
    const blocks = kind === 'instr' ? buildInstructions() : buildLetter();
    if (!blocks.length) { toast('Najpierw wybierz ścieżkę wniosku.'); return; }
    const labels = { A: 'raty', B: 'umorzenie', C: 'odwolanie' };
    const fname = kind === 'instr' ? 'Instrukcja-wniosek-UFG.pdf' : `Wniosek-UFG-${labels[S.f.pathway] || 'pismo'}-${safeName(S.f.fullName) || 'pismo'}-${validIso(S.f.letterDate) ? S.f.letterDate : todayIso()}.pdf`;
    try {
      toast('Generuję PDF…');
      const pm = await ensurePdfMake();
      pm.createPdf(pdfDoc(blocks, kind === 'instr' ? 'Instrukcja i lista kontrolna' : 'Pismo do UFG')).download(fname);
      toast('Plik PDF został wygenerowany.');
    } catch (e) { toast(e.message || 'Błąd generowania PDF.'); }
  }

  /* =====================================================================
     WALIDACJA, PODGLĄD
     ===================================================================== */
  function validateWizard() {
    const f = S.f, err = [];
    if (!['A', 'B', 'C'].includes(f.pathway)) err.push('Wybierz ścieżkę (A, B lub C).');
    if (!u(f.fullName)) err.push('Podaj imię i nazwisko.');
    if (!u(f.street)) err.push('Podaj ulicę i numer.');
    if (!/^\d{2}-\d{3}$/.test(u(f.postal))) err.push('Podaj kod pocztowy w formacie 00-000.');
    if (!u(f.city)) err.push('Podaj miejscowość.');
    if (!(num(f.amount) > 0)) err.push('Podaj kwotę z wezwania.');
    else if (num(f.amount) > MAX_AMOUNT) err.push('Kwota z wezwania wygląda na nieprawidłową.');
    if (!FLAT.includes(f.category) && !u(f.reg)) err.push('Podaj numer rejestracyjny pojazdu.');
    if (u(f.pesel) && !validPesel(u(f.pesel))) err.push('Numer PESEL jest nieprawidłowy (sprawdź cyfry lub pozostaw pole puste).');
    if (validIso(f.gapStart) && validIso(f.gapEnd) && isoToT(f.gapEnd) < isoToT(f.gapStart)) err.push('Koniec przerwy nie może być wcześniejszy niż początek.');
    if (f.pathway === 'A' && f.aMode === 'odroczenie' && !validIso(f.aDeferTo)) err.push('Podaj datę, do której ma zostać odroczona płatność.');
    if (f.pathway === 'B' && !budgetOf(f).filled) err.push('Uzupełnij budżet domowy – to podstawa wniosku o umorzenie.');
    if (f.pathway === 'B' && f.bType === 'partial' && !(pos(f.bPart) > 0 && pos(f.bPart) < wizardAmount())) err.push('Kwota częściowego umorzenia musi być większa od zera i mniejsza od kwoty z wezwania.');
    if (f.pathway === 'C' && !f.cGround) err.push('Wybierz podstawę odwołania.');
    return err;
  }
  let previewTimer = null;
  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const blocks = buildLetter(), box = $('#preview'), unlocked = isUnlocked();
      $('#btnInstr').hidden = !unlocked;
      $('#btnBuy').textContent = unlocked ? (DEMO ? 'Pobierz wniosek PDF (tryb demonstracyjny)' : 'Pobierz wniosek PDF (opłacony)') : `Pobierz wniosek PDF – ${zl2(CONFIG.price)} (BLIK)`;
      if (!blocks.length) { box.innerHTML = '<p class="text-slate-500">Wybierz ścieżkę w kroku 1.</p>'; $('#paywallOverlay').hidden = true; return; }
      const cut = unlocked ? blocks.length : Math.min(blocks.length, Math.max(6, Math.ceil(blocks.length * 0.35)));
      box.innerHTML = blocksToHtml(blocks.slice(0, cut)) + (cut < blocks.length ? placeholderHtml(blocks.slice(cut)) : '');
      $('#paywallOverlay').hidden = unlocked;
    }, 120);
  }
  function showErrors(err) {
    $('#wizErrors').innerHTML = err.length ? `<div class="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200"><p class="font-bold">Uzupełnij przed pobraniem:</p><ul class="list-disc pl-5">${err.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
  }

  /* =====================================================================
     PŁATNOŚĆ
     Zasady bezpieczeństwa:
     1. Dostęp do PDF daje wyłącznie odpowiedź serwera (functions/api/verify.js),
        który sprawdza płatność bezpośrednio w Stripe.
     2. Sesja płatności jest powiązana z losowym identyfikatorem zamówienia
        (client_reference_id) zapisanym w tej przeglądarce – link z session_id
        nie działa w innej przeglądarce.
     3. Klient nie jest kierowany do płatności, jeśli serwer weryfikujący
        nie działa – nikt nie zapłaci za coś, czego nie dostanie.
     ===================================================================== */
  function newRef() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return 'w' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function getJson(url) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: ctrl.signal });
      let body = null;
      try { body = await r.json(); } catch (e) { body = null; }
      return { status: r.status, body };
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  async function pingVerify() {
    const res = await getJson(`${CONFIG.verifyEndpoint}?ping=1`);
    return !!(res && res.status === 200 && res.body && res.body.ready === true);
  }
  /* true = opłacone, false = nieopłacone/nieważne, null = błąd połączenia (spróbuj później) */
  async function verifyPaid(sid, ref) {
    if (!SID_RE.test(sid) || !REF_RE.test(ref)) return false;
    const res = await getJson(`${CONFIG.verifyEndpoint}?session_id=${encodeURIComponent(sid)}&ref=${encodeURIComponent(ref)}`);
    if (!res) return null;
    if (res.status === 200 && res.body && res.body.paid === true) return true;
    if (res.status >= 500 || res.status === 429) return null;
    return false;
  }
  function onBuy() {
    gather();
    const err = validateWizard(); showErrors(err);
    if (err.length) { $('#wizErrors').scrollIntoView({ block: 'center' }); return; }
    if (PAID) { downloadPdf('letter'); return; }
    const names = { A: 'Wniosek o raty / odroczenie (ścieżka A)', B: 'Wniosek o umorzenie (ścieżka B)', C: 'Odwołanie od wezwania (ścieżka C)' };
    $('#coProduct').textContent = names[S.f.pathway];
    $('#coDemo').hidden = !DEMO;
    $('#coUnavailable').hidden = DEMO || SALES_CONFIGURED;
    $('#coPay').disabled = !(DEMO || SALES_CONFIGURED);
    $('#coError').hidden = true;
    $('#dlgCheckout').showModal();
  }
  function coError(msg) { const e = $('#coError'); e.textContent = msg; e.hidden = false; }
  let paying = false;
  async function onPay() {
    if (paying) return;
    if (!$('#coTerms').checked || !$('#coWithdraw').checked) { coError('Zaznacz obie zgody, aby kontynuować.'); return; }
    if (DEMO) { PAID = true; $('#dlgCheckout').close(); renderPreview(); downloadPdf('letter'); return; }
    if (!SALES_CONFIGURED) { coError('Płatności nie są jeszcze uruchomione. Nie pobraliśmy żadnych środków.'); return; }
    paying = true;
    const btn = $('#coPay'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Łączenie z bezpieczną płatnością…';
    const ready = await pingVerify();
    if (!ready) {
      paying = false; btn.disabled = false; btn.textContent = label;
      coError('Płatności są chwilowo niedostępne. Spróbuj ponownie za kilka minut – nie pobraliśmy żadnych środków.');
      return;
    }
    const ref = newRef();
    storageSet(localStorage, PAY_KEY, { ref, ts: Date.now() });
    saveStateNow();
    const url = new URL(CONFIG.paymentUrl);
    url.searchParams.set('client_reference_id', ref);
    const email = u(S.f.email);
    if (email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) url.searchParams.set('prefilled_email', email);
    window.location.assign(url.href);
  }
  function readPayRecord() {
    const rec = storageGet(localStorage, PAY_KEY);
    return isPlainObject(rec) && REF_RE.test(rec.ref || '') ? { ref: rec.ref, sid: SID_RE.test(rec.sid || '') ? rec.sid : '', ts: +rec.ts || 0 } : null;
  }
  async function handlePaymentReturn() {
    const q = new URLSearchParams(location.search);
    const status = q.get('platnosc'), sid = q.get('session_id') || '';
    if (status !== null || q.has('session_id')) history.replaceState(null, '', location.pathname + location.hash);
    if (DEMO || !CONFIG.verifyEndpoint) return;
    const pay = readPayRecord();
    if (status === 'sukces') {
      if (!SID_RE.test(sid)) { toast('Nieprawidłowe potwierdzenie płatności.', 8000); return; }
      if (!pay) { toast('Ta przeglądarka nie rozpoczęła tego zamówienia. Jeśli zapłaciłeś(-aś), napisz do nas z adresu e-mail podanego przy płatności.', 12000); return; }
      pay.sid = sid;
      storageSet(localStorage, PAY_KEY, pay);
    } else if (status) {
      toast('Płatność nie została ukończona. Możesz spróbować ponownie.');
    }
    if (!pay || !pay.sid) return;
    let ok = await verifyPaid(pay.sid, pay.ref);
    for (let i = 0; status === 'sukces' && ok !== true && i < 3; i++) { await sleep(2000); ok = await verifyPaid(pay.sid, pay.ref); }
    if (ok === true) {
      PAID = true;
      renderPreview();
      if (status === 'sukces') {
        $('#wniosek').scrollIntoView();
        const ready = !validateWizard().length;
        toast(ready ? 'Dziękujemy! Płatność potwierdzona – pobieram PDF.' : 'Dziękujemy! Płatność potwierdzona. Uzupełnij formularz i pobierz PDF.', 7000);
        if (ready) setTimeout(() => downloadPdf('letter'), 600);
      }
    } else if (status === 'sukces') {
      toast(ok === null ? 'Nie udało się połączyć z serwerem, aby potwierdzić płatność. Odśwież stronę za chwilę – dostęp zostanie przywrócony.' : 'Nie udało się potwierdzić płatności. Jeśli środki zostały pobrane, napisz do nas – podaj e-mail z potwierdzenia płatności.', 12000);
    } else if (ok === false) {
      storageDel(localStorage, PAY_KEY); // płatność wygasła lub jest nieważna
    }
  }

  /* =====================================================================
     INNE
     ===================================================================== */
  let toastTimer = null;
  function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
  function applyAffiliate(root = document) {
    $$('[data-aff]', root).forEach(a => {
      if (CONFIG.affiliateUrl) { a.href = CONFIG.affiliateUrl; a.target = '_blank'; a.rel = 'sponsored noopener noreferrer'; }
      else { a.href = '#kup-oc'; a.removeAttribute('target'); }
    });
    if (root === document) $$('[data-aff-label]').forEach(el => { el.hidden = !CONFIG.affiliateUrl; });
  }
  function applyConfigText() {
    const price = zl2(CONFIG.price);
    $$('[data-price]').forEach(el => { el.textContent = price; });
    $$('[data-site-name]').forEach(el => { el.textContent = CONFIG.siteName; });
    $$('[data-site-url]').forEach(el => { el.textContent = CONFIG.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''); });
    $$('[data-law-date]').forEach(el => { if (CONFIG.lawDate) el.textContent = CONFIG.lawDate; });
    $$('[data-seller]').forEach(el => {
      const k = el.dataset.seller;
      if (k === 'nipLine') el.textContent = CONFIG.seller.nip ? `, NIP: ${CONFIG.seller.nip}` : '';
      else if (Object.prototype.hasOwnProperty.call(CONFIG.seller, k) && CONFIG.seller[k]) el.textContent = CONFIG.seller[k];
    });
    const mail = CONFIG.seller.email;
    $$('[data-contact]').forEach(a => { a.href = /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(mail) ? `mailto:${mail}` : '#'; });
  }

  /* =====================================================================
     START
     ===================================================================== */
  function refreshAll() {
    gather();
    applyVisibility();
    renderCalc();
    renderDeadlineBox();
    renderBudgetSummary();
    renderCHelpers();
    renderAttachments();
    renderPreview();
    saveState();
  }
  function init() {
    LEGACY_KEYS.forEach(k => { storageDel(localStorage, k); storageDel(sessionStorage, k); });
    buildBudgetFields();
    applyInputLimits();
    applyConfigText();
    applyAffiliate();
    $('#f_ufgAddr').value = CONFIG.ufgAddress;
    $('#f_letterDate').value = todayIso();
    $('#k_end').max = $('#k_start').max = todayIso();
    loadState();
    restore();
    if (!u($('#f_ufgAddr').value)) $('#f_ufgAddr').value = CONFIG.ufgAddress;
    if (!validIso($('#f_aFirst').value)) $('#f_aFirst').value = addMonths(todayIso(), 1);

    $$('form').forEach(fm => fm.addEventListener('submit', e => e.preventDefault()));
    document.addEventListener('input', e => {
      if (e.target.id === 'r_amount') { S.rManual = true; renderRaty(); saveState(); return; }
      if (e.target.id === 'r_n' || e.target.id === 'r_first') { renderRaty(); return; }
      if (e.target.matches('[data-f]')) refreshAll();
    });
    document.addEventListener('change', e => {
      if (e.target.matches('[data-att]')) {
        const id = e.target.dataset.att;
        if (Object.prototype.hasOwnProperty.call(ATTACHMENTS, id)) S.attOverride[id] = e.target.checked;
        renderPreview(); saveState(); return;
      }
      if (e.target.matches('[data-f]')) refreshAll();
    });
    $('#toWizard').addEventListener('click', () => {
      gather();
      const map = { k_category: 'category', k_start: 'gapStart', k_reason: 'reason', k_delivery: 'deliveryDate' };
      Object.keys(map).forEach(a => { if (S.f[a]) S.f[map[a]] = S.f[a]; });
      const c = calcInputs(); if (validIso(c.end)) S.f.gapEnd = c.end;
      if (lastCalc && lastCalc.totalA > 0) S.f.amount = String(lastCalc.totalA);
      restore(); refreshAll();
      $('#wniosek').scrollIntoView();
      toast('Dane z kalkulatora przeniesione do wniosku – sprawdź kwotę z wezwania.');
    });
    $('#toRaty').addEventListener('click', () => { S.rManual = false; renderCalc(); });
    $('#btnBuy').addEventListener('click', onBuy);
    $('#btnInstr').addEventListener('click', () => downloadPdf('instr'));
    $('#coPay').addEventListener('click', onPay);
    $('#btnClear').addEventListener('click', () => {
      if (!confirm('Usunąć wszystkie dane wpisane w formularzach na tym urządzeniu?')) return;
      storageDel(sessionStorage, STORE_KEY);
      location.reload();
    });
    $$('[data-open]').forEach(b => b.addEventListener('click', () => { const d = document.getElementById(b.dataset.open); if (d && d.tagName === 'DIALOG') d.showModal(); }));
    $$('dialog').forEach(d => {
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
      $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
    });

    renderRaty();
    refreshAll();
    handlePaymentReturn();
  }

  /* Publiczne są wyłącznie czyste funkcje obliczeniowe (do testów) – bez dostępu do pisma i PDF */
  window.KaraOC = Object.freeze({ PENALTIES, ratesFromWage, ratesForYear, tierIndex, feeFor, splitByYear, calculate, installmentPlan, deadlineInfo, holidaysPL, easter, validPesel });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
