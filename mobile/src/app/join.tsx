import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { DivisionWash, MaxContentWidth, Radii, Spacing, Typography, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { refreshLeagueSummary } from '@/lib/leagueSummary';
import { AlreadyMemberError, hasActiveMembership, startMembershipCheckout } from '@/lib/membership';
import { useAuth } from '@/providers/auth-provider';

/**
 * Becoming a paid member — £8/month.
 *
 * Lives at the root rather than inside (tabs) so it doesn't have to pick a
 * parent tab: the League Position strip that links here renders on every tab
 * screen, so nesting it under any one of them would be arbitrary. The
 * trade-off is that it has no tab bar, which is why it carries its own Close
 * button.
 *
 * The price is never written down here. It comes from the edge function's
 * environment and is charged by Stripe, so a price in this file could only
 * ever be a second copy waiting to disagree with the first. What is written
 * down is "£8 / month", which is the offer rather than the amount charged —
 * if that ever changes, both this and the Stripe price have to change, and
 * there is no way around that short of an API call on every page view.
 */

const BENEFITS = [
  { icon: 'trophy-outline', text: '£20,000 grand prize for the overall winner' },
  { icon: 'medal-outline', text: 'Six £1,500 prizes, one for each division winner' },
  { icon: 'gift-outline', text: 'Tackle bundles and vouchers for monthly comp winners' },
  { icon: 'stats-chart-outline', text: 'Your catches count towards the real league table' },
  { icon: 'ellipse-outline', text: 'A gold ring on your avatar, wherever you appear' },
] as const;

/** How long to keep looking for the subscription after Stripe sends the
 * angler back. The webhook is usually there first, but it is a separate
 * request from a separate machine and occasionally lands a second or two
 * later — which would otherwise show a paying member "you're not a member". */
const CONFIRM_TIMEOUT_MS = 20000;
const CONFIRM_INTERVAL_MS = 1500;

type Status =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'confirming' }
  | { kind: 'member' }
  | { kind: 'slow' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export default function JoinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    pollTimer.current = null;
    giveUpTimer.current = null;
  }, []);

  // Coming back from Stripe. Success is a redirect, not proof — the webhook
  // is what grants membership, so this waits for the subscription to appear
  // rather than taking the URL's word for it.
  useEffect(() => {
    if (checkout === 'cancelled') {
      setStatus({ kind: 'cancelled' });
      return;
    }
    if (checkout !== 'success') return;

    setStatus({ kind: 'confirming' });
    const check = async () => {
      if (await hasActiveMembership()) {
        stopPolling();
        setStatus({ kind: 'member' });
        // The tab layout and the League strip both read a cached summary
        // that was fetched before the webhook landed. Without this they go
        // on showing the upsell card and the "join for £20,000" banner to
        // somebody who has just paid.
        void refreshLeagueSummary();
      }
    };
    void check();
    pollTimer.current = setInterval(check, CONFIRM_INTERVAL_MS);
    giveUpTimer.current = setTimeout(() => {
      stopPolling();
      setStatus((s) => (s.kind === 'confirming' ? { kind: 'slow' } : s));
    }, CONFIRM_TIMEOUT_MS);

    return stopPolling;
  }, [checkout, stopPolling]);

  // Someone who is already paying should not be sold to.
  useEffect(() => {
    if (checkout || !session) return;
    void hasActiveMembership().then((paid) => {
      if (paid) setStatus({ kind: 'member' });
    });
  }, [checkout, session]);

  const handleJoin = async () => {
    setStatus({ kind: 'starting' });
    try {
      await startMembershipCheckout();
      // On web this never returns — the page navigates to Stripe.
    } catch (e) {
      if (e instanceof AlreadyMemberError) {
        setStatus({ kind: 'member' });
        return;
      }
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.container, styles.centred, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;

  const isMember = status.kind === 'member';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[Typography.h1, { color: theme.text }]}>
              {isMember ? "You're in" : 'Join the League'}
            </Text>
            <Pressable onPress={() => router.back()} hitSlop={Spacing.two} accessibilityRole="button">
              <Text style={[Typography.body, { color: theme.primary }]}>Close</Text>
            </Pressable>
          </View>

          {isMember ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
              <View style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={22} color={theme.gold} />
                <Text style={[Typography.h3, styles.benefitText, { color: theme.text }]}>
                  You&rsquo;re a paid member
                </Text>
              </View>
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                Every verified catch from here counts towards the league table and the prize fund.
                Tight lines.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                You&rsquo;re fishing as a free member — your catches are scored, but they don&rsquo;t
                count towards prizes.
              </Text>

              {/* The offer, given the weight it deserves. A gradient wash in
                * the prize colour rather than a flat card: this is the one
                * screen on which the app is asking for money, and a plain
                * bordered box was reading as a form field. */}
              <View style={[styles.priceCard, { borderColor: theme.gold }]}>
                <LinearGradient
                  colors={[
                    withAlpha(theme.gold, DivisionWash.from),
                    withAlpha(theme.gold, DivisionWash.mid),
                    'transparent',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.wash}
                />
                <Text style={[Typography.label, { color: theme.label }]}>Paid membership</Text>
                <View style={styles.priceRow}>
                  {/* numericHero is the token for exactly this: a single
                    * number that has to be the first thing read. */}
                  <Text style={[Typography.numericHero, { color: theme.text }]}>£8</Text>
                  <Text style={[Typography.body, styles.per, { color: theme.textSecondary }]}>
                    / month
                  </Text>
                </View>
                <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                  Cancel any time. Stop paying and you drop back to a free member — catches logged
                  while you&rsquo;re not a member don&rsquo;t count.
                </Text>
              </View>
            </>
          )}

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <LinearGradient
              colors={[withAlpha(theme.primary, DivisionWash.mid), 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={styles.wash}
            />
            <Text style={[Typography.label, { color: theme.label }]}>What you get</Text>
            {BENEFITS.map((benefit) => (
              <View key={benefit.text} style={styles.benefitRow}>
                <Ionicons name={benefit.icon} size={18} color={theme.gold} />
                <Text style={[Typography.bodySmall, styles.benefitText, { color: theme.text }]}>
                  {benefit.text}
                </Text>
              </View>
            ))}
          </View>

          {status.kind === 'cancelled' && (
            <View style={[styles.notice, { borderColor: theme.border }]}>
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                Payment cancelled — nothing was charged. You can pick this up whenever you like.
              </Text>
            </View>
          )}

          {status.kind === 'confirming' && (
            <View style={[styles.notice, styles.noticeRow, { borderColor: theme.border }]}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[Typography.bodySmall, styles.benefitText, { color: theme.textSecondary }]}>
                Confirming your payment with Stripe…
              </Text>
            </View>
          )}

          {status.kind === 'slow' && (
            <View style={[styles.notice, { borderColor: theme.gold }]}>
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                Your payment went through, but we haven&rsquo;t had confirmation yet. It usually
                arrives within a minute — reopen this page and it&rsquo;ll show. Nothing is lost, and
                you won&rsquo;t be charged twice.
              </Text>
            </View>
          )}

          {status.kind === 'error' && (
            <View style={[styles.notice, { borderColor: theme.danger }]}>
              <Text style={[Typography.bodySmall, { color: theme.danger }]}>{status.message}</Text>
            </View>
          )}

          {isMember ? (
            <AppButton title="Back to the league" onPress={() => router.replace('/league')} />
          ) : (
            <>
              <AppButton
                title="Become a paid member"
                onPress={handleJoin}
                loading={status.kind === 'starting' || status.kind === 'confirming'}
                disabled={status.kind === 'starting' || status.kind === 'confirming'}
              />
              <Text style={[Typography.caption, styles.fineprint, { color: theme.textMuted }]}>
                Payment is handled by Stripe. Your card details never touch Carp Leagues.
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceCard: {
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.one,
    overflow: 'hidden',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill — react-native-web wants a concrete
    // size here, same as the division cards.
    width: '100%',
    height: '100%',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  per: {
    marginBottom: Spacing.half,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  benefitText: {
    flex: 1,
  },
  notice: {
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.three,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  fineprint: {
    textAlign: 'center',
  },
});
