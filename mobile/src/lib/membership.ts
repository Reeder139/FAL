import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

/** Thrown when the angler is already paying. Its own type so the screen can
 * say something useful rather than showing a raw error — being told "already
 * a member" is good news, not a failure. */
export class AlreadyMemberError extends Error {}

/**
 * Starts a membership checkout and sends the angler to Stripe.
 *
 * The price lives in the edge function's environment, never here: a price in
 * client code is a number an angler can read, and worse, one that can drift
 * out of step with the price Stripe actually charges.
 *
 * Nothing about the returned promise means they paid. Membership is granted
 * by the Stripe webhook and by nothing else, so this only gets them to the
 * payment page — see `hasActiveMembership` for the state that matters.
 */
export async function startMembershipCheckout(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    method: 'POST',
  });

  if (error) {
    // supabase-js folds non-2xx into a generic FunctionsHttpError, so the
    // real message has to be read off the response body.
    const body = await readFunctionError(error);
    if (body?.alreadyMember) throw new AlreadyMemberError(body.error ?? 'You are already a paid member.');
    throw new Error(body?.error ?? 'Could not start checkout. Please try again.');
  }

  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('Stripe did not return a checkout page.');

  if (Platform.OS === 'web') {
    // A full-page navigation, not a new tab: pop-up blockers eat a
    // window.open that happens after an await, and Stripe returns the angler
    // here afterwards anyway.
    window.location.assign(url);
    return;
  }

  await WebBrowser.openBrowserAsync(url);
}

async function readFunctionError(error: unknown): Promise<{ error?: string; alreadyMember?: boolean } | null> {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}

/** True when this angler's subscription is one Stripe considers paying.
 *
 * Mirrors is_paying_status() in the database — past_due counts, because that
 * is Stripe retrying a card rather than a membership that has ended. */
export async function hasActiveMembership(): Promise<boolean> {
  const { data } = await supabase.from('subscriptions').select('status').maybeSingle();
  return ['active', 'trialing', 'past_due'].includes(data?.status ?? '');
}

export interface MembershipState {
  status: string;
  /** True while Stripe still considers them paying — see is_paying_status in
   * the database, which this mirrors. */
  isActive: boolean;
  /** Set when they have cancelled but the paid period has not run out. They
   * keep their membership until it does; they paid for the month. */
  endingAt: string | null;
  renewsAt: string | null;
}

/** The signed-in angler's own membership. Null if they have never subscribed.
 * `subscriptions` is RLS'd to its owner, so this can only ever return theirs. */
export async function fetchMembership(): Promise<MembershipState | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end')
    .maybeSingle();
  if (error || !data) return null;

  const isActive = ['active', 'trialing', 'past_due'].includes(data.status);
  return {
    status: data.status,
    isActive,
    endingAt: data.cancel_at_period_end ? data.current_period_end : null,
    renewsAt: !data.cancel_at_period_end && isActive ? data.current_period_end : null,
  };
}

/**
 * Sends the member to Stripe's billing portal, where they can cancel, change
 * their card or read invoices.
 *
 * Nothing about returning from it means anything changed — cancelling makes
 * Stripe send a webhook, and that is what moves their membership.
 */
export async function openBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', { method: 'POST' });
  if (error) {
    const body = await readFunctionError(error);
    throw new Error(body?.error ?? 'Could not open the billing portal.');
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('Stripe did not return a portal page.');

  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
