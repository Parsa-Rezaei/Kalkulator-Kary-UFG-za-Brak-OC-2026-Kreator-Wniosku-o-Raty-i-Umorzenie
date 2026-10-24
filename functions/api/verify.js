// Cloudflare Pages Function: GET /api/verify?session_id=cs_...
// Sprawdza w Stripe, czy sesja płatności (Checkout / Payment Link) została opłacona.
// Działa tylko na Cloudflare Pages (na GitHub Pages ten plik jest ignorowany).
//
// Zmienne środowiskowe (Cloudflare Pages → Settings → Variables and Secrets):
//   STRIPE_SECRET_KEY – klucz ograniczony (restricted key) z uprawnieniem „Checkout Sessions: Read”
//   EXPECTED_AMOUNT   – cena w groszach (domyślnie 1499 = 14,99 zł)
//
// Po wdrożeniu ustaw w index.html: CONFIG.verifyEndpoint = '/api/verify'

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(id)) return json({ paid: false, error: 'invalid_session' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ paid: false, error: 'not_configured' }, 500);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
  });
  if (!res.ok) return json({ paid: false, error: 'not_found' }, 404);

  const session = await res.json();
  const expected = Number(env.EXPECTED_AMOUNT || 1499);
  const paid = session.payment_status === 'paid' && session.currency === 'pln' && session.amount_total === expected;
  return json({ paid });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
