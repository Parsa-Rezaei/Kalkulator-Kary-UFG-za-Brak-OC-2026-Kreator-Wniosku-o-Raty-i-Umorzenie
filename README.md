# Kalkulator Kary UFG za Brak OC 2026 + Kreator Wniosku o Raty i Umorzenie

**🇵🇱 Polski** · [🇬🇧 English](#english)

Jednostronicowa aplikacja (SPA) w języku polskim dla kierowców, którzy dostali wezwanie z Ubezpieczeniowego Funduszu Gwarancyjnego (UFG) do zapłaty opłaty za brak OC – albo nadal nie mają OC.

- **Moduł 1 – Symulator kary UFG (bezpłatny):** opłata dla 2025 i 2026 r., podział przerwy na lata kalendarzowe (art. 88 ust. 3 – „pułapka przełomu roku”), oba warianty stawki (rok przerwy / rok stwierdzenia), progi 4. i 15. dnia, termin 30 dni od doręczenia wezwania (z dniami wolnymi).
- **Symulator 24 rat 0% (bezpłatny):** suwak 1–24 rat i harmonogram (np. 9610 zł / 24 = 23 × 400,42 zł + 400,34 zł).
- **Moduł 2 – Kreator wniosku (płatny PDF):** ścieżka A (raty / odroczenie), B (umorzenie z kalkulatorem budżetu domowego), C (odwołanie: ciągłość OC, sprzedaż, kradzież, demontaż, czasowe wycofanie, błędny okres lub kategoria). Pismo A4 do Zarządu UFG + Załącznik nr 1 + wykaz załączników + instrukcja.
- **Monetyzacja:** link partnerski do porównywarki OC i płatność BLIK (Stripe Payment Link) weryfikowana po stronie serwera.
- **SEO:** JSON-LD `SoftwareApplication` i `FAQPage`, meta/OG, `robots.txt`, `sitemap.xml`.

## Struktura

| Ścieżka | Rola |
|---|---|
| `public/` | **jedyny publikowany katalog** (Cloudflare Pages → output directory) |
| `public/index.html` | strona (bez skryptów i stylów inline – zgodna ze ścisłym CSP) |
| `public/assets/config.js` | **konfiguracja – jedyny plik do edycji** |
| `public/assets/app.js` | logika (zamknięta w IIFE – nic nie jest dostępne z konsoli) |
| `public/assets/styles.css` | zbudowany Tailwind CSS (`npm run build:css`) |
| `public/assets/vendor/pdfmake-0.2.20/` | pdfmake hostowany lokalnie (MIT; czcionka Roboto – Apache 2.0) |
| `public/_headers` | nagłówki bezpieczeństwa (CSP, HSTS, anti-clickjacking) |
| `functions/api/verify.js` | funkcja Cloudflare Pages – weryfikacja płatności w Stripe |
| `src/input.css`, `tailwind.config.js` | źródło stylów |
| `tests/` | testy: `node tests/verify.test.mjs`, `node tests/e2e.test.js` |

## Bezpieczeństwo (co jest zabezpieczone)

1. **Brak kodu z zewnątrz.** Żadnych skryptów z CDN – CSS, JS i pdfmake są na Twoim serwerze. Ścisły Content-Security-Policy (`script-src 'self'`) blokuje wstrzyknięcie obcego skryptu, który mógłby np. podmienić link płatności.
2. **Płatność sprawdzana na serwerze.** PDF odblokowuje wyłącznie odpowiedź `functions/api/verify.js`, która pyta Stripe, czy sesja jest: opłacona, w PLN, w kwocie 14,99 zł, z **Twojego** linku płatności, w trybie live, nie starsza niż 30 dni i powiązana z losowym identyfikatorem zamówienia z przeglądarki kupującego.
3. **Nie da się obejść płatności przez adres, localStorage ani udostępniony link** – sprawdzone testami (podrobiony localStorage, ręczne `?platnosc=sukces`, cudzy `session_id`, zgadywany identyfikator, płatność > 30 dni).
4. **Klucz Stripe tylko ograniczony.** Funkcja odrzuca pełny klucz `sk_…`; akceptuje wyłącznie `rk_…` z prawem odczytu Checkout Sessions – nawet jego wyciek nie pozwala wypłacić ani zwrócić pieniędzy.
5. **Ochrona kupującego.** Jeśli serwer weryfikacji nie działa lub nie jest skonfigurowany, klient nie zostanie skierowany do płatności (nikt nie zapłaci za coś, czego nie dostanie). Na prawdziwej domenie tryb demo (PDF za darmo) jest wyłączony.
6. **Treść pisma przed płatnością nie trafia do strony** – zablokowana część podglądu to szare paski.
7. **Prywatność.** Dane formularza (w tym PESEL) tylko w `sessionStorage` bieżącej karty; w `localStorage` wyłącznie losowe identyfikatory płatności. Nic nie jest wysyłane na serwer.
8. **XSS / clickjacking.** Wszystkie dane użytkownika są escapowane; `frame-ancestors 'none'` i `X-Frame-Options: DENY`.

**Granica techniczna:** PDF powstaje w przeglądarce, więc osoba z dużą wiedzą techniczną mogłaby przerobić kod u siebie i wygenerować pismo bez płatności. To utrata pojedynczej sprzedaży, a nie Twoich pieniędzy; pełna ochrona wymagałaby generowania PDF na serwerze (czyli wysyłania tam danych osobowych, w tym PESEL).

## Konfiguracja

1. Zamień każde `TWOJA-DOMENA.pl` w `public/index.html`, `public/robots.txt`, `public/sitemap.xml` i `public/assets/config.js`.
2. W `public/assets/config.js` uzupełnij `paymentUrl`, `affiliateUrl`, `seller`. **Nigdy nie wpisuj tam kluczy Stripe.**
3. Cloudflare Pages → projekt → Settings → **Variables and Secrets** (typ *Secret*, środowisko *Production*):
   - `STRIPE_SECRET_KEY` = klucz ograniczony `rk_live_…` (Stripe → Developers → API keys → Create restricted key → *Checkout Sessions: Read*, reszta *None*)
   - `PAYMENT_LINK_ID` = `plink_…` Twojego linku płatności
   - `EXPECTED_AMOUNT` = `1499`
   - (opcjonalnie) `MAX_AGE_DAYS` = `30`; **nie ustawiaj** `ALLOW_TEST_MODE` na produkcji
4. Stripe Payment Link: tylko **BLIK** (bez kart – chroni przed testowaniem skradzionych kart i opłatami za chargeback), bez kodów rabatowych, przekierowanie po płatności:
   `https://twojadomena.pl/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}`

## Wdrożenie (Cloudflare Pages – wymagane do sprzedaży)

Workers & Pages → Create → Pages → Connect to Git → repozytorium → Production branch `main` → Framework preset *None* → Build command: *puste* → **Build output directory: `public`** → Deploy → Custom domains. GitHub Pages nie uruchamia funkcji weryfikującej, więc sprzedaż tam nie zadziała (kalkulator tak).

## Utrzymanie

- Co roku dopisz płacę minimalną w `config.js` (`minWage`) i zaktualizuj kwoty 2026 r. w tekstach.
- Po zmianie klas CSS: `npm install && npm run build:css`. Aktualizacja pdfmake: zmień wersję w `package.json`, `npm install && npm run vendor:pdfmake`, popraw `PDFMAKE_BASE` w `app.js`.
- Testy: `npm test` (wymaga Playwright z Chromium oraz `pdftotext`).

## Podstawa prawna i zastrzeżenia

Ustawa z dnia 22 maja 2003 r. o ubezpieczeniach obowiązkowych, UFG i PBUK: art. 10 ust. 2, 88, 90, 94. Minimalne wynagrodzenie: 4666 zł (2025), 4806 zł (2026). Niepewne (oznaczone w serwisie): stawka roku przy przerwie wykrytej w kolejnym roku, limit 24 rat (praktyka UFG), adres UFG. Serwis nie jest powiązany z UFG i nie stanowi porady prawnej. Regulamin i polityka prywatności to wzory do uzupełnienia.

---

<a id="english"></a>
## 🇬🇧 English

Polish-language SPA: UFG (Insurance Guarantee Fund) penalty calculator for driving without OC insurance (2025/2026, year-boundary split), 1–24 instalment simulator, and a paid PDF letter generator (instalments, remission, appeal).

**Layout:** only `public/` is published (Cloudflare Pages output directory = `public`). Edit `public/assets/config.js` only. Server-side payment check: `functions/api/verify.js`.

**Security model:**
- No third-party scripts; strict CSP `script-src 'self'`; all assets self-hosted.
- The PDF is unlocked only by `/api/verify`. It checks with Stripe that the session is complete and paid, PLN, the expected subtotal, your Payment Link ID and live mode. It also checks the session is ≤ 30 days old and bound to a random `client_reference_id` created in the buyer's browser. URL tampering, forged localStorage, shared links and stolen session IDs do not unlock (covered by tests).
- Restricted Stripe key (`rk_…`, Checkout Sessions: Read) enforced; full `sk_…` keys are rejected.
- Buyers are not sent to payment if the verifier is down or unconfigured; demo mode runs on localhost only.
- Locked preview contains no letter text; form data lives in `sessionStorage` only; HTML escaping; anti-clickjacking headers.
- Known limit: PDF generation is client-side, so a skilled user could modify the code locally to skip payment. That costs one sale, not money.

**Secrets (Cloudflare Pages → Variables and Secrets):** `STRIPE_SECRET_KEY` (`rk_live_…`), `PAYMENT_LINK_ID` (`plink_…`), `EXPECTED_AMOUNT=1499`. Payment Link: BLIK only, no promo codes, redirect `https://yourdomain/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}`.

**Tests:** `node tests/verify.test.mjs` (verifier, mocked Stripe), `node tests/e2e.test.js` (Playwright: features, PDFs, CSP, paywall attacks).

Not affiliated with UFG; not legal advice.
