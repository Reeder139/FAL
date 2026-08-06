import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMembership, openBillingPortal, type MembershipState } from '@/lib/membership';

/** 6 September 2026 — the date matters here, not how long away it is.
 *
 * Formatted in UTC, deliberately. Stripe renders billing dates in UTC, and a
 * period ending at 23:18 UTC is the next day in BST — so a member looking at
 * this card and at Stripe's own portal saw two different dates for the same
 * event. Whichever is more "correct" locally, they have to agree, and Stripe
 * is the one actually taking the money. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Membership status, and the way out of it.
 *
 * Shown to anyone who has ever subscribed, including after they cancel —
 * hiding it the moment they cancel would take away the invoices and the card
 * they may still need.
 *
 * Cancelling happens in Stripe's portal, not here. Rebuilding cancellation,
 * dunning, proration and invoice history is a great deal of behaviour to get
 * right, and none of it is this app's job. What matters is that a member can
 * always get out without having to email anyone.
 */
export function MembershipCard() {
  const theme = useTheme();
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMembership()
      .then((state) => {
        if (!cancelled) setMembership(state);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const manage = async () => {
    setOpening(true);
    setError(null);
    try {
      await openBillingPortal();
      // On web this never returns — the page navigates to Stripe.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the billing portal.');
    } finally {
      setOpening(false);
    }
  };

  // Never subscribed: the join page is the right place to sell to them, not
  // a card on their own profile.
  if (!loaded || !membership) return null;

  const { isActive, endingAt, renewsAt, status } = membership;
  const accent = endingAt ? theme.gold : isActive ? theme.gold : theme.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: accent }]}>
      <View style={styles.row}>
        <Ionicons name={isActive ? 'shield-checkmark' : 'shield-outline'} size={20} color={accent} />
        <View style={styles.body}>
          <Text style={[Typography.h3, { color: theme.text }]}>
            {isActive ? 'Paid member' : 'Membership ended'}
          </Text>
          <Text style={[Typography.caption, { color: theme.textSecondary }]}>
            {endingAt
              ? `Cancelled — you stay a member until ${longDate(endingAt)}`
              : renewsAt
                ? `£8 a month · renews ${longDate(renewsAt)}`
                : status === 'past_due'
                  ? 'Your last payment failed — Stripe is retrying it'
                  : 'Your catches no longer count towards prizes'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={manage}
        disabled={opening}
        accessibilityRole="button"
        accessibilityLabel="Manage your membership, cancel, or update your card"
        style={({ pressed }) => [styles.manage, { borderColor: theme.border }, pressed && styles.pressed]}>
        <Ionicons name="card-outline" size={14} color={theme.textSecondary} />
        <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
          {opening ? 'Opening…' : 'Manage membership'}
        </Text>
      </Pressable>

      {error && <Text style={[Typography.caption, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
