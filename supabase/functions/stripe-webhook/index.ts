// Stripe's side of membership. This is the only thing that grants or removes
// it — the app never decides, and the success page after Checkout is just a
// redirect, not proof of payment.
//
// Deployed with --no-verify-jwt: Stripe is not a signed-in user and cannot
// present a Supabase token. The signature check below is what authenticates
// the caller instead, and it is not optional — without it this endpoint is
// "anyone on the internet can grant themselves a paid membership".

import { adminClient, json, stripeClient } from '../_shared/stripe.ts';
// A value import, not `import type` — createSubtleCryptoProvider() below is
// called at runtime, and the Stripe.* types come off the same default export.
import Stripe from 'npm:stripe@17.7.0';

/** Events worth acting on. Anything else Stripe sends is acknowledged and
 * ignored, so adding an event type in the dashboard cannot break this. */
const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !secret) return json({ error: 'Missing signature or secret' }, 400);

  const stripe = stripeClient();

  // The raw body, byte for byte. Parsing it first and re-serialising would
  // change the bytes and the signature would never verify.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync, not constructEvent: the synchronous version wants
    // Node's crypto and throws in Deno. This is the single most common way
    // to get a webhook that rejects every legitimate Stripe delivery.
    event = await stripe.webhooks.constructEventAsync(
      raw,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (e) {
    console.error('[stripe-webhook] signature rejected', e);
    return json({ error: 'Invalid signature' }, 400);
  }

  if (!HANDLED.has(event.type)) return json({ received: true, ignored: event.type });

  try {
    const admin = adminClient();

    // Resolve the subscription this event is about. Different event types
    // carry different objects, so normalise to a Subscription before doing
    // anything — the alternative is five slightly different code paths that
    // drift apart.
    let subscription: Stripe.Subscription | null = null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as { subscription?: string | null }).subscription;
      if (subId) subscription = await stripe.subscriptions.retrieve(subId);
    } else {
      subscription = event.data.object as Stripe.Subscription;
    }

    if (!subscription) return json({ received: true, note: 'no subscription on event' });

    // Which angler. Metadata first, because it is set deliberately at
    // checkout; the customer record is the fallback for anything created by
    // hand in the Stripe dashboard.
    let anglerId = subscription.metadata?.angler_id ?? null;
    if (!anglerId && subscription.customer) {
      const customer = await stripe.customers.retrieve(subscription.customer as string);
      if (!('deleted' in customer)) anglerId = customer.metadata?.angler_id ?? null;
    }
    if (!anglerId) {
      // Acknowledged rather than retried: Stripe would redeliver forever and
      // the answer would not change. Logged loudly because it means a
      // subscription exists that no member owns.
      console.error('[stripe-webhook] no angler_id on', subscription.id);
      return json({ received: true, note: 'unmapped subscription' });
    }

    const periodEnd = (subscription as { current_period_end?: number }).current_period_end;

    const { error: upsertError } = await admin.from('subscriptions').upsert(
      {
        angler_id: anglerId,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'angler_id' }
    );
    if (upsertError) throw new Error(`subscriptions upsert: ${upsertError.message}`);

    // What it means for the league is decided in Postgres, next to the
    // scoring it affects — see apply_membership(). It is idempotent, which
    // matters because Stripe says a webhook may be delivered more than once.
    const { data: applied, error: applyError } = await admin.rpc('apply_membership', {
      p_angler_id: anglerId,
      p_status: subscription.status,
    });
    if (applyError) throw new Error(`apply_membership: ${applyError.message}`);

    console.log('[stripe-webhook]', event.type, subscription.status, JSON.stringify(applied?.[0]));
    return json({ received: true, outcome: applied?.[0]?.outcome ?? null });
  } catch (e) {
    console.error('[stripe-webhook] handler failed', e);
    // 500 so Stripe retries. A failure here means a member paid and did not
    // get in, which is worth retrying; the handler is idempotent so a repeat
    // costs nothing.
    return json({ error: e instanceof Error ? e.message : 'handler failed' }, 500);
  }
});
