// Starts a £8/month membership.
//
// Returns a Stripe-hosted Checkout URL for the app to open. Card details
// never touch the app or this function — that is the whole point of using
// hosted Checkout, and it is what keeps the project on the lightest PCI
// tier rather than in scope for handling card data.
//
// Nothing here grants membership. The angler is only a competitor once
// Stripe says the money moved, which arrives at stripe-webhook. A user who
// closes the tab on the payment page, or who reaches the success URL by
// typing it, gets nothing.

import { adminClient, CORS, json, siteUrl, stripeClient } from '../_shared/stripe.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Who is asking. The caller's own JWT is used rather than trusting an
    // angler id in the body — otherwise anyone could buy a membership for,
    // or more to the point start a checkout as, somebody else.
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: 'Must be signed in.' }, 401);

    const priceId = Deno.env.get('STRIPE_PRICE_ID');
    if (!priceId) return json({ error: 'STRIPE_PRICE_ID is not set' }, 500);

    const stripe = stripeClient();
    const admin = adminClient();

    // Reuse the Stripe customer if this angler has subscribed before.
    // Without this, every resubscribe would mint another customer and the
    // billing history for one person would be scattered across several.
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status')
      .eq('angler_id', user.id)
      .maybeSingle();

    // Already paying — send them to the billing portal's job, not a second
    // subscription. Two live subscriptions for one angler is a refund
    // conversation, so it is worth refusing here rather than tidying later.
    if (existing && ['active', 'trialing', 'past_due'].includes(existing.status)) {
      return json({ error: 'You are already a paid member.', alreadyMember: true }, 409);
    }

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const { data: profile } = await admin
        .from('profiles')
        .select('username, display_name')
        .eq('id', user.id)
        .maybeSingle();
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: profile?.display_name ?? profile?.username ?? undefined,
        // The link back to the angler. Set on the customer, the session and
        // the subscription, because the webhook receives different objects
        // for different events and each one needs to resolve to a member.
        metadata: { angler_id: user.id, username: profile?.username ?? '' },
      });
      customerId = customer.id;
    }

    const site = siteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { angler_id: user.id } },
      // Back into the app either way. The success page must not assume
      // payment succeeded — the webhook is the only thing that grants
      // membership, and it may land a moment later.
      success_url: `${site}/league?checkout=success`,
      cancel_url: `${site}/join?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error('[create-checkout-session]', e);
    return json({ error: e instanceof Error ? e.message : 'Could not start checkout.' }, 500);
  }
});
