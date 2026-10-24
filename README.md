# Kalkulator Kary UFG za Brak OC 2026 + Kreator Wniosku o Raty i Umorzenie

**🇵🇱 Polski** · [🇬🇧 English](#english)

Jednostronicowa aplikacja (SPA) w języku polskim dla kierowców, którzy dostali wezwanie z Ubezpieczeniowego Funduszu Gwarancyjnego (UFG) do zapłaty opłaty za brak OC – albo nadal nie mają OC.

- **Moduł 1 – Symulator kary UFG (bezpłatny):** wylicza opłatę dla 2025 i 2026 r., dzieli przerwę na lata kalendarzowe (art. 88 ust. 3 – „pułapka przełomu roku”), pokazuje oba warianty stawki (rok przerwy / rok stwierdzenia), progi 4. i 15. dnia oraz termin 30 dni od doręczenia wezwania (z uwzględnieniem dni wolnych).
- **Symulator 24 rat 0% (bezpłatny):** suwak 1–24 rat i harmonogram (np. 9610 zł / 24 = 23 × 400,42 zł + 400,34 zł).
- **Moduł 2 – Kreator wniosku (płatny PDF):** ścieżka A (raty / odroczenie), B (umorzenie całkowite lub częściowe z kalkulatorem budżetu domowego) i C (odwołanie: ciągłość OC, sprzedaż, kradzież, demontaż, czasowe wycofanie, błędny okres lub kategoria). Pismo A4 do Zarządu UFG z uzasadnieniem, Załącznikiem nr 1 (oświadczenie o sytuacji majątkowej z tabelami) i wykazem załączników + osobna instrukcja z listą kontrolną.
- **Monetyzacja:** pilny baner i sekcja z linkiem partnerskim do porównywarki OC oraz okno płatności BLIK (Stripe Payment Link) przed pobraniem PDF.
- **SEO:** schematy JSON-LD `SoftwareApplication` i `FAQPage` (treść FAQ identyczna z widoczną na stronie), meta/OG, `robots.txt`, `sitemap.xml`.
- **Prywatność:** dane z formularzy i PDF powstają lokalnie w przeglądarce; nic nie trafia na serwer.

## Pliki

| Plik | Rola |
|---|---|
| `index.html` | cała aplikacja (HTML + Tailwind CSS z CDN + Vanilla JS; pdfmake ładowany z CDN przy pierwszym generowaniu PDF) |
| `functions/api/verify.js` | opcjonalna funkcja Cloudflare Pages: weryfikuje płatność w Stripe po stronie serwera |
| `robots.txt`, `sitemap.xml` | SEO – podmień `TWOJA-DOMENA.pl` |
| `_headers` | nagłówki bezpieczeństwa (Cloudflare Pages / Netlify) |

## Konfiguracja (jedno miejsce)

1. W `index.html` i w `robots.txt` / `sitemap.xml` zamień każde wystąpienie `TWOJA-DOMENA.pl` na swoją domenę.
2. W `index.html` uzupełnij obiekt `CONFIG` (na początku skryptu):

```js
const CONFIG = {
  siteName: 'Kalkulator Kary OC',
  siteUrl: 'https://twojadomena.pl/',
  price: 14.99,
  paymentUrl: 'https://buy.stripe.com/...',   // Stripe Payment Link w PLN z włączonym BLIK
  verifyEndpoint: '',                           // '/api/verify' po skonfigurowaniu funkcji na Cloudflare Pages
  affiliateUrl: 'https://...',                  // Twój link partnerski do porównywarki OC
  seller: { name: '...', address: '...', email: '...', nip: '' },
  ...
};
```

Dopóki `paymentUrl` jest pusty, serwis działa w **trybie demonstracyjnym** (PDF pobiera się bez opłaty – do testów).

**Płatność (Stripe Payment Link):** po płatności ustaw przekierowanie na
`https://twojadomena.pl/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}`.
Bez `verifyEndpoint` strona ufa parametrowi w adresie (proste, ale do obejścia). Z funkcją `functions/api/verify.js` na Cloudflare Pages płatność jest sprawdzana w Stripe (zmienne `STRIPE_SECRET_KEY` – klucz ograniczony z odczytem Checkout Sessions – i `EXPECTED_AMOUNT`, domyślnie `1499`).

**Aktualizacja co roku:** dopisz płacę minimalną kolejnego roku w `CONFIG.minWage` (np. `2027: …`) – kalkulator sam wyliczy stawki wg art. 88 ust. 2 i 5. Zaktualizuj też teksty z kwotami 2026 r.

## Wdrożenie

- **Cloudflare Pages (zalecane):** Workers & Pages → Create → Pages → połącz repozytorium GitHub → framework: *None*, build command: puste, output directory: `/` → Deploy → Custom domains.
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root. (Funkcja `functions/` tam nie działa.)

## Podstawa prawna i zastrzeżenia

Ustawa z dnia 22 maja 2003 r. o ubezpieczeniach obowiązkowych, UFG i PBUK: art. 88 (wysokość opłat, gradacja w każdym roku kalendarzowym, zaokrąglenie do 10 zł), art. 90 (wezwanie, 30 dni, wymagalność), art. 94 (umorzenie i ulga w spłacie; tryb – Statut UFG), art. 10 ust. 2 (powództwo o ustalenie). Minimalne wynagrodzenie: 4666 zł (2025), 4806 zł (2026).

Elementy niepewne, oznaczone w serwisie: stosowana stawka roku przy przerwie wykrytej w kolejnym roku (źródła rozbieżne – pokazywane są oba warianty), limit 24 rat (wg informacji o praktyce/regulaminie UFG, nie wprost z ustawy), adres korespondencyjny UFG (do sprawdzenia na wezwaniu). Przed startem warto zweryfikować teksty z aktualnym brzmieniem ustawy w ISAP i informacjami na ufg.pl. Serwis nie jest powiązany z UFG i nie stanowi porady prawnej. Regulamin i polityka prywatności w `index.html` to wzory do uzupełnienia.

---

<a id="english"></a>
## 🇬🇧 English

Single-page app (Polish UI) for drivers in Poland who received a UFG (Insurance Guarantee Fund) demand for driving without compulsory third-party liability insurance (OC), or who still have no OC.

- **Module 1 – penalty calculator (free):** 2025 and 2026 rates; splits the uninsured period by calendar year (Art. 88(3), the year-end "double penalty" trap); shows both rate-year interpretations; 4th/15th-day thresholds; 30-day deadline from delivery with Polish public holidays.
- **24-installment simulator (free):** 1–24 instalments with a schedule.
- **Module 2 – application generator (paid PDF):** Path A (instalments/deferral), B (full/partial remission with a household budget calculator), C (appeal: continuous cover, sale, theft, scrapping, temporary withdrawal, wrong period/category). Formal A4 letter to the UFG Management Board + Annex 1 (financial statement tables) + attachment list + a separate instruction/checklist PDF.
- **Monetisation:** affiliate CTA to an OC comparison site; BLIK checkout (Stripe Payment Link) before PDF download.
- **SEO:** `SoftwareApplication` + `FAQPage` JSON-LD (FAQ text identical to the visible FAQ), meta/OG, robots, sitemap.
- **Privacy:** form data and PDF generation stay in the browser.

**Setup:** replace `TWOJA-DOMENA.pl` everywhere, fill `CONFIG` in `index.html` (payment link, affiliate link, seller data). Empty `paymentUrl` = demo mode. Stripe redirect URL: `https://yourdomain.pl/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}`. Optional server-side payment check: deploy on Cloudflare Pages, set `STRIPE_SECRET_KEY` (restricted key, Checkout Sessions read) and `EXPECTED_AMOUNT`, then `CONFIG.verifyEndpoint = '/api/verify'`.

**Deploy:** Cloudflare Pages (no build step, output `/`) or GitHub Pages (branch `main`, root).

**Yearly maintenance:** add the new minimum wage to `CONFIG.minWage`; update 2026 amounts in the copy.

Not affiliated with UFG; not legal advice. The terms of service and privacy policy in `index.html` are templates to complete.
