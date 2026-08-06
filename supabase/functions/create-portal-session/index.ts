// Opens Stripe's billing portal so a member can cancel, change their card,
// or read their invoices.
//
// Hosted by Stripe rather than rebuilt here, for the same reason Checkout is:
// cancellation, dunning, proration and invoice history are a great deal of
// behaviour to get right, and none of it is this app's job. It also means a
// member can always get out without emailing anybody, which is the point.
//
// Nothing here changes membership. Cancelling in the portal makes Stripe send
// customer.subscription.updated and, at the end of the paid period,
// customer.subscription.deleted — and stripe-webhook is what acts on those.

import { adminClient, CORS, env, json, siteUrl, stripeClient } from '../_shared/stripe.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(
      env('SUPABASE_URL')!,
      env('SUPABASE_PUBLISHABLE_KEY') ?? env('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: 'Must be signed in.' }, 401);

    const admin = adminClient();
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('angler_id', user.id)
      .maybeSingle();

    // No customer means they have never subscribed, so there is nothing to
    // manage. Said plainly rather than handing them an empty portal.
    if (!subscription?.stripe_customer_id) {
      return json({ error: 'You do not have a membership to manage.', noMembership: true }, 404);
    }

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${siteUrl()}/profile`,
    });

    return json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not open the billing portal.';
    console.error('[create-portal-session]', e);
    // The portal has to be configured once per mode in the Stripe dashboard
    // before it will open. Worth naming, because the raw error says only
    // "No configuration provided" and gives no hint where to go.
    if (message.includes('No configuration provided') || message.includes('default configuration')) {
      return json(
        {
          error:
            'The billing portal has not been set up in Stripe yet — enable it at ' +
            'Settings → Billing → Customer portal.',
        },
        500
      );
    }
    return json({ error: message }, 500);
  }
});
