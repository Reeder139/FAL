import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickAndUploadAvatar } from '@/lib/avatarUpload';
import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { toWeightOz } from '@/lib/units';
import { useAuth } from '@/providers/auth-provider';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, loading: authLoading, needsOnboarding, refreshProfile } = useAuth();

  const [lb, setLb] = useState('');
  const [oz, setOz] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (authLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/welcome" />;
  }

  // Already onboarded (declared_pb_oz is set) — nothing left to do here.
  if (!needsOnboarding) {
    return <Redirect href="/" />;
  }

  const lbNumber = Number(lb);
  const ozNumber = Number(oz);
  const pbValid =
    lb.length > 0 &&
    oz.length > 0 &&
    Number.isFinite(lbNumber) &&
    Number.isFinite(ozNumber) &&
    lbNumber >= 0 &&
    ozNumber >= 0 &&
    ozNumber < 16;

  const handlePickAvatar = async () => {
    setError(null);
    setUploadingAvatar(true);
    try {
      const path = await pickAndUploadAvatar();
      if (path) setAvatarPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFinish = async () => {
    if (!pbValid) return;
    setError(null);
    setSaving(true);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        declared_pb_oz: toWeightOz(lbNumber, ozNumber),
        avatar_path: avatarPath,
      })
      .eq('id', session.user.id);

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    await refreshProfile();
    setSaving(false);
    router.replace('/');
  };

  const avatarUrl = avatarPath ? getPublicStorageUrl('post-media', avatarPath) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[Typography.h1, { color: theme.text }]}>One more thing</Text>

          <View style={styles.section}>
            <Text style={[Typography.h2, { color: theme.text }]}>Your personal best</Text>
            <Text style={[Typography.body, { color: theme.textSecondary }]}>
              This seeds your starting division for the season — Division 1 is 40lb+, Division 2 is
              30–40lb, Division 3 is under 30lb.
            </Text>
            <Text style={[Typography.body, { color: theme.textSecondary }]}>
              An unverified PB seeds you into Division 1, the hardest division. Proving a lower PB with
              evidence is what earns you an easier one — it's there to stop sandbagging, not to punish you
              for not having proof yet.
            </Text>

            <View style={styles.pbRow}>
              <View style={styles.pbField}>
                <FormField label="Pounds" value={lb} onChangeText={setLb} keyboardType="number-pad" />
              </View>
              <View style={styles.pbField}>
                <FormField label="Ounces" value={oz} onChangeText={setOz} keyboardType="number-pad" />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[Typography.h2, { color: theme.text }]}>Avatar (optional)</Text>
            <Pressable onPress={handlePickAvatar} style={styles.avatarPicker} disabled={uploadingAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarImage, { backgroundColor: theme.surfaceElevated }]}>
                  {uploadingAvatar ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : (
                    <Text style={[Typography.bodySmall, { color: theme.textMuted }]}>Add photo</Text>
                  )}
                </View>
              )}
            </Pressable>
          </View>

          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}

          <AppButton title="Finish" onPress={handleFinish} loading={saving} disabled={!pbValid} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  pbRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  pbField: {
    flex: 1,
  },
  avatarPicker: {
    alignSelf: 'flex-start',
  },
  avatarImage: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
