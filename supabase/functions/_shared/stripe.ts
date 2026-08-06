// Shared setup for the two Stripe functions.
//
// The Supabase admin client here deliberately does NOT use the auto-injected
// SUPABASE_SERVICE_ROLE_KEY. This project has moved to Supabase's new API key
// system and disabled the legacy anon/service_role JWTs, so that injected
// variable now holds a key the API rejects with 401.
//
// The replacement is read from SECRET_KEY, not SUPABASE_SECRET_KEY: Supabase
// reserves the SUPABASE_ prefix for its own injected variables and refuses to
// store a custom secret using it.
//
// It falls back to the injected one so this keeps working on a project that
// has not migrated, rather than failing in a way that looks like a Stripe
// problem.

import Stripe from 'npm:stripe@17.7.0';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, {
    apiVersion: '2025-01-27.acacia',
    // Deno has no Node http stack. Without this the SDK hangs rather than
    // erroring, which is a miserable thing to debug from a log tail.
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('SECRET_KEY is not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Where Checkout sends the angler back to. */
export function siteUrl(): string {
  return Deno.env.get('SITE_URL') ?? 'https://www.carpleagues.com';
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
