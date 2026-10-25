/* =====================================================================
   KONFIGURACJA SERWISU – jedyny plik, który edytujesz przed startem.
   NIGDY nie wpisuj tutaj kluczy Stripe (sk_…, rk_…) ani haseł –
   ten plik jest publiczny. Klucze trzymasz wyłącznie w ustawieniach
   Cloudflare Pages (Variables and Secrets).
   ===================================================================== */
window.KARAOC_CONFIG = Object.freeze({
  siteName: 'Kalkulator Kary OC',
  siteUrl: 'https://TWOJA-DOMENA.pl/',

  // Cena PDF w zł – musi być równa cenie produktu w Stripe i zmiennej EXPECTED_AMOUNT (w groszach).
  price: 14.99,

  // Link płatności Stripe (Payment Link, tylko BLIK), np. 'https://buy.stripe.com/abc123'.
  // Pusty = sprzedaż wyłączona (na komputerze lokalnym działa tryb demonstracyjny).
  paymentUrl: '',

  // Weryfikacja płatności po stronie serwera (functions/api/verify.js na Cloudflare Pages).
  // Wymagana do sprzedaży – bez niej przycisk płatności się nie uruchomi.
  verifyEndpoint: '/api/verify',

  // Twój link partnerski do porównywarki OC (https://…).
  affiliateUrl: '',

  // Dane sprzedawcy do regulaminu i polityki prywatności.
  seller: Object.freeze({
    name: '[imię i nazwisko / firma]',
    address: '[adres]',
    email: '[e-mail kontaktowy]',
    nip: ''
  }),

  ufgAddress: 'Zarząd\nUbezpieczeniowego Funduszu Gwarancyjnego\nul. Płocka 9/11\n01-231 Warszawa',
  lawDate: 'październik 2026',

  // Płaca minimalna – dopisz kolejny rok (np. 2027: XXXX) po ogłoszeniu rozporządzenia.
  minWage: Object.freeze({ 2025: 4666, 2026: 4806 })
});
