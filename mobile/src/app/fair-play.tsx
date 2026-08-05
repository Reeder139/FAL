import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Source aspect of the prepared plaque — see
 * scripts/prepare-fair-play-header.mjs, which prints it. */
const HEADER_RATIO = 1100 / 381;

/** The commitments, as bullets. Kept as data rather than markup so the list
 * cannot drift out of step with itself when it is edited. */
const PROMISES = [
  'Your own fish, caught by you, in UK waters',
  'Honest weights on proper scales',
  'Photos from the actual capture, unedited',
  'One entry per fish',
];

/**
 * The Fair Play Code, shown once between registering and onboarding.
 *
 * Not in `(auth)`: by the time this shows, the angler has an account and a
 * session, and that layout redirects anyone holding one straight to the feed
 * — the screen would bounce past itself. It sits at the root alongside
 * onboarding, which is the same kind of screen and reached the same way.
 *
 * The gate is `profiles.fair_play_accepted_at`, so it survives reinstalling
 * the app and cannot be stepped over by clearing local storage. Agreement to
 * this is the sort of thing that gets asked about when a prize is disputed.
 */
export default function FairPlayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Redirect href="/welcome" />;
  // Already agreed — nothing to do here, and re-showing it would read as the
  // app forgetting.
  if (profile?.fair_play_accepted_at) return <Redirect href="/onboarding" />;

  const handleSubmit = async () => {
    if (!agreed || !session) return;
    setError(null);
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from('profiles')
        .update({ fair_play_accepted_at: new Date().toISOString() })
        .eq('id', session.user.id);
      if (saveError) throw saveError;
      await refreshProfile();
      router.replace('/onboarding');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that just now.');
    } finally {
      setSaving(false);
    }
  };

  const Section = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={[Typography.h3, { color: theme.text }]}>{heading}</Text>
      <Text style={[Typography.body, { color: theme.textSecondary }]}>{children}</Text>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Ratio on the wrapper, not the Image: react-native-web gives an
            * Image an inline height from its intrinsic pixels, which beats
            * aspectRatio set on the image itself. */}
          <View style={[styles.headerWrap, { aspectRatio: HEADER_RATIO }]}>
            <Image
              source={require('@/assets/images/fair-play-header.jpg')}
              style={styles.header}
              resizeMode="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Fair Play. Respect the sport. Respect each other. Compete honestly. Keep it fair."
            />
          </View>

          <Text style={[Typography.h1, styles.title, { color: theme.text }]}>THE FAIR PLAY CODE</Text>

          <Text style={[Typography.h2, { color: theme.text }]}>
            &ldquo;What&rsquo;s to stop everyone just cheating?&rdquo;
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            Fair question. Here&rsquo;s the honest answer.
          </Text>

          <Section heading="You already police this better than we ever could.">
            Carp fishing is small. The big fish have names. People know which waters hold what, who&rsquo;s
            on them, and what came out last week. A faked forty doesn&rsquo;t survive a weekend on this
            feed — and every member can flag a catch.
          </Section>

          <Section heading="We check the things that are checkable.">
            Photo data. Weight patterns. Whether an image has been used before. The bigger the fish, the
            more we ask for — a routine twenty needs one photo, a fish that could win a division needs
            more, including someone who was there.
          </Section>

          <Section heading="Nothing gets quietly changed.">
            Once a weight is submitted it can&rsquo;t be edited. Every decision is logged. If a catch is
            ever questioned you&rsquo;ll be asked to explain before anything is decided — and any result
            can be reconstructed in full, years later.
          </Section>

          <Section heading="No prize is paid until the winner&rsquo;s catches have been verified.">
            Not spot-checked. Every counting fish, before any money moves.
          </Section>

          <View style={styles.section}>
            <Text style={[Typography.h3, { color: theme.text }]}>What you&rsquo;re agreeing to</Text>
            {PROMISES.map((p) => (
              <View key={p} style={styles.bullet}>
                <Ionicons name="checkmark" size={16} color={theme.primary} />
                <Text style={[Typography.body, styles.bulletText, { color: theme.textSecondary }]}>{p}</Text>
              </View>
            ))}
          </View>

          {/* Called out rather than left as one more paragraph — it is the
            * only clause here about the fish rather than the competition. */}
          <View style={[styles.careCard, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
            <Text style={[Typography.h3, { color: theme.text }]}>And this one matters most:</Text>
            <Text style={[Typography.body, { color: theme.textSecondary }]}>
              Nothing here is worth harming a fish for. Quick photos, straight back. If a shot means
              longer out of the water, don&rsquo;t take it. Poor fish care rejects a catch whatever it
              weighs.
            </Text>
          </View>

          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            Deliberately false entries mean removal from the league and loss of any prizes.
          </Text>

          <Section heading="None of this is aimed at you.">
            It&rsquo;s here because the angler who wins should deserve it — and so should the one who
            finishes second. Every rejection we make is published. Judge us on that, not on this page.
          </Section>

          <Pressable
            onPress={() => setAgreed((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I've read and agree to the Fair Play Code"
            style={[
              styles.agreeRow,
              { borderColor: agreed ? theme.primary : theme.border },
              agreed && { backgroundColor: theme.surfaceElevated },
            ]}>
            <Ionicons
              name={agreed ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed ? theme.primary : theme.textMuted}
            />
            <Text style={[Typography.body, styles.agreeText, { color: theme.text }]}>
              I&rsquo;ve read and agree to the Fair Play Code
            </Text>
          </Pressable>

          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}

          <AppButton
            title="Complete registration"
            onPress={handleSubmit}
            loading={saving}
            disabled={!agreed}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  headerWrap: {
    width: '100%',
  },
  header: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginTop: Spacing.one,
  },
  section: {
    gap: Spacing.one,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  careCard: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  agreeText: {
    flex: 1,
  },
});
