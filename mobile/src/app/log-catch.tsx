import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { CatchResultCard } from '@/components/catch-result-card';
import { FormField } from '@/components/form-field';
import { PhotoRoleStrip, type PhotoStripItem } from '@/components/photo-role-strip';
import { VenuePicker, type VenueSelection } from '@/components/venue-picker';
import { VisibilityPicker } from '@/components/visibility-picker';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MAX_CATCH_PHOTOS,
  captureCatchPhoto,
  pickCatchPhotosFromLibrary,
  prepareCatchPhoto,
  type MediaRole,
  type PickedCatchPhoto,
  type PreparedCatchPhoto,
} from '@/lib/catchPhoto';
import { fetchCatchResult, type CatchResultData } from '@/lib/catchResult';
import { computePoints, fetchSeasonForDate, type SeasonLookup } from '@/lib/scoring';
import { DuplicateImageError, submitCatch, type PostVisibility, type SubmitCatchResult } from '@/lib/submitCatch';
import { toWeightOz } from '@/lib/units';
import { generateUuidV4 } from '@/lib/uuid';
import { useAuth } from '@/providers/auth-provider';

interface PhotoItem {
  id: string;
  picked: PickedCatchPhoto;
  prepared: PreparedCatchPhoto | null;
  preparing: boolean;
  role: MediaRole;
  error: string | null;
}

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function formatTimeInput(d: Date): string {
  return d.toISOString().slice(11, 16);
}
function parseDateTimeInput(dateStr: string, timeStr: string): Date | null {
  const d = new Date(`${dateStr}T${timeStr}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function LogCatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [lb, setLb] = useState('');
  const [oz, setOz] = useState('');
  const [caughtAt, setCaughtAt] = useState(() => new Date());
  const [dateText, setDateText] = useState(() => formatDateInput(new Date()));
  const [timeText, setTimeText] = useState(() => formatTimeInput(new Date()));
  const [venue, setVenue] = useState<VenueSelection | null>(null);
  const [venueHidden, setVenueHidden] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [caption, setCaption] = useState('');
  // null while the first lookup is in flight.
  const [seasonLookup, setSeasonLookup] = useState<SeasonLookup | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitCatchResult | null>(null);
  const [catchResultData, setCatchResultData] = useState<CatchResultData | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const caughtAtEditedRef = useRef(false);
  const prefilledFromExifRef = useRef(false);
  const seasonFetchedForDate = useRef<string | null>(null);

  const weightOz = useMemo(() => {
    if (lb.trim() === '' && oz.trim() === '') return null;
    const lbNum = lb.trim() === '' ? 0 : Number(lb);
    const ozNum = oz.trim() === '' ? 0 : Number(oz);
    if (!Number.isFinite(lbNum) || !Number.isFinite(ozNum)) return null;
    return toWeightOz(lbNum, ozNum);
  }, [lb, oz]);

  const maybeLoadSeason = useCallback((date: Date) => {
    const key = formatDateInput(date);
    if (seasonFetchedForDate.current === key) return;
    seasonFetchedForDate.current = key;
    setSeasonLookup(null);
    fetchSeasonForDate(date)
      .then(setSeasonLookup)
      .catch(() => setSeasonLookup({ state: 'error' }));
  }, []);

  // Load once on mount.
  useMemo(() => maybeLoadSeason(caughtAt), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pointsPreview = useMemo(
    () =>
      weightOz !== null && seasonLookup?.state === 'found'
        ? computePoints(weightOz, seasonLookup.season)
        : null,
    [weightOz, seasonLookup]
  );

  /**
   * A weighed fish dated outside every running season.
   *
   * scored_catches only ranks catches whose caught_at falls between the
   * season's starts_on and ends_on, so this one will be logged, appear on the
   * feed, and count for nothing. That is a legitimate thing to do in the
   * closed months — but it has to be said out loud, because the angler's
   * whole reason for filling this form in is the league.
   */
  const outsideSeason = weightOz !== null && seasonLookup?.state === 'none';

  const addPickedPhotos = useCallback((picked: PickedCatchPhoto[]) => {
    if (picked.length === 0) return;

    const items: PhotoItem[] = picked.map((p, i) => ({
      id: generateUuidV4(),
      picked: p,
      prepared: null,
      preparing: true,
      role: 'gallery',
      error: null,
    }));

    setPhotos((prev) => {
      const hasHero = prev.some((p) => p.role === 'hero');
      if (!hasHero && items.length > 0) items[0].role = 'hero';
      return [...prev, ...items];
    });

    for (const item of items) {
      prepareCatchPhoto(item.picked)
        .then((prepared) => {
          setPhotos((prev) => prev.map((p) => (p.id === item.id ? { ...p, prepared, preparing: false } : p)));

          if (!caughtAtEditedRef.current && !prefilledFromExifRef.current && prepared.exifTakenAt) {
            prefilledFromExifRef.current = true;
            const d = new Date(prepared.exifTakenAt);
            setCaughtAt(d);
            setDateText(formatDateInput(d));
            setTimeText(formatTimeInput(d));
            maybeLoadSeason(d);
          }
        })
        .catch(() => {
          setPhotos((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, preparing: false, error: 'Could not process this photo.' } : p))
          );
        });
    }
  }, [maybeLoadSeason]);

  const remainingSlots = MAX_CATCH_PHOTOS - photos.length;

  const handlePickLibrary = async () => {
    if (remainingSlots <= 0) return;
    addPickedPhotos(await pickCatchPhotosFromLibrary(remainingSlots));
  };

  const handleCapture = async () => {
    if (remainingSlots <= 0) return;
    const picked = await captureCatchPhoto();
    if (picked) addPickedPhotos([picked]);
  };

  const selectHero = (id: string) =>
    setPhotos((prev) => prev.map((p) => ({ ...p, role: p.id === id ? 'hero' : p.role === 'hero' ? 'gallery' : p.role })));

  const toggleEvidence = (id: string) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, role: p.role === 'evidence' ? 'gallery' : 'evidence' } : p)));

  const removePhoto = (id: string) =>
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      const next = prev.filter((p) => p.id !== id);
      if (removed?.role === 'hero' && next.length > 0) next[0] = { ...next[0], role: 'hero' };
      return next;
    });

  const handleDateChange = (text: string) => {
    setDateText(text);
    caughtAtEditedRef.current = true;
    const parsed = parseDateTimeInput(text, timeText);
    if (parsed) {
      setCaughtAt(parsed);
      maybeLoadSeason(parsed);
    }
  };
  const handleTimeChange = (text: string) => {
    setTimeText(text);
    caughtAtEditedRef.current = true;
    const parsed = parseDateTimeInput(dateText, text);
    if (parsed) {
      setCaughtAt(parsed);
      maybeLoadSeason(parsed);
    }
  };

  const readyPhotos = photos.filter((p) => p.prepared !== null && !p.error);
  const allPhotosReady = photos.length > 0 && readyPhotos.length === photos.length;
  const canSubmit = allPhotosReady && !submitting;

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const submitResult = await submitCatch({
        caption: caption.trim() || null,
        weightOz,
        caughtAt,
        venueId: venue?.venueId ?? null,
        newVenueName: venue?.isNew ? venue.venueName : null,
        venueHidden,
        visibility,
        photos: readyPhotos.map((p) => ({ prepared: p.prepared!, role: p.role })),
      });
      setResult(submitResult);

      if (submitResult.catchId) {
        setLoadingResult(true);
        fetchCatchResult(submitResult.catchId)
          .then(setCatchResultData)
          .finally(() => setLoadingResult(false));
      }
    } catch (e) {
      setSubmitError(
        e instanceof DuplicateImageError ? e.message : e instanceof Error ? e.message : 'Could not submit your catch.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinPress = () => {
    Alert.alert('Coming soon', "Season joining isn't available yet — check back soon!");
  };

  const resetForm = () => {
    setPhotos([]);
    setLb('');
    setOz('');
    const now = new Date();
    setCaughtAt(now);
    setDateText(formatDateInput(now));
    setTimeText(formatTimeInput(now));
    setVenue(null);
    setVenueHidden(false);
    setVisibility('public');
    setCaption('');
    setResult(null);
    setCatchResultData(null);
    caughtAtEditedRef.current = false;
    prefilledFromExifRef.current = false;
    // Re-look-up for today. Without clearing the memo the cached answer for
    // the last catch's date survives the reset, so a fish logged after an
    // out-of-season one would inherit its warning.
    seasonFetchedForDate.current = null;
    maybeLoadSeason(now);
  };

  if (authLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/welcome" />;
  }

  if (result) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[Typography.h1, { color: theme.text, textAlign: 'center' }]}>
              {result.catchId ? 'Catch logged!' : 'Posted!'}
            </Text>

            {result.catchId && result.status === 'under_review' && (
              <Text style={[Typography.bodySmall, { color: theme.textSecondary, textAlign: 'center' }]}>
                This one's been flagged for a quick review — it'll still show once cleared, no action needed
                from you.
              </Text>
            )}

            {result.catchId &&
              (loadingResult ? (
                <ActivityIndicator color={theme.primary} />
              ) : catchResultData ? (
                <CatchResultCard result={catchResultData} onJoinPress={handleJoinPress} />
              ) : null)}

            <AppButton title="Log another catch" onPress={resetForm} variant="outline" />
            <AppButton title="Back to feed" onPress={() => router.replace('/')} />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={[Typography.h1, { color: theme.text }]}>Log a catch</Text>
            <Pressable onPress={() => router.back()} hitSlop={Spacing.two}>
              <Text style={[Typography.body, { color: theme.primary }]}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={[Typography.h2, { color: theme.text }]}>Photos</Text>
            {photos.length > 0 && (
              <PhotoRoleStrip
                photos={photos.map<PhotoStripItem>((p) => ({
                  id: p.id,
                  uri: p.picked.uri,
                  role: p.role,
                  preparing: p.preparing,
                  error: p.error,
                }))}
                onSelectHero={selectHero}
                onToggleEvidence={toggleEvidence}
                onRemove={removePhoto}
              />
            )}
            {remainingSlots > 0 && (
              <View style={styles.pickButtonsRow}>
                <View style={styles.pickButton}>
                  {/* Just "Library": the pair sit side by side on a phone, and
                    * "Choose from library" wrapped to two lines against "Take
                    * photo"'s one, leaving the buttons different heights. The
                    * accessibility label carries the full wording, so the
                    * short visible text costs a screen reader nothing. */}
                  <AppButton
                    title="Library"
                    accessibilityLabel="Choose photos from your library"
                    onPress={handlePickLibrary}
                    variant="outline"
                  />
                </View>
                <View style={styles.pickButton}>
                  <AppButton title="Take photo" onPress={handleCapture} variant="outline" />
                </View>
              </View>
            )}
            <Text style={[Typography.caption, { color: theme.textMuted }]}>
              {photos.length}/{MAX_CATCH_PHOTOS} photos — camera roll is fine, in-app capture is optional.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[Typography.h2, { color: theme.text }]}>Weight (optional)</Text>
            <View style={styles.weightRow}>
              <View style={styles.weightField}>
                <FormField label="Pounds" value={lb} onChangeText={setLb} keyboardType="number-pad" />
              </View>
              <View style={styles.weightField}>
                <FormField label="Ounces" value={oz} onChangeText={setOz} keyboardType="number-pad" />
              </View>
            </View>
            {weightOz !== null && (
              <Text
                style={[
                  Typography.bodySmall,
                  { color: outsideSeason ? theme.textSecondary : theme.primary },
                ]}>
                {pointsPreview !== null
                  ? `≈ ${pointsPreview.toFixed(1)} pts`
                  : outsideSeason
                    ? 'No points — see the date below'
                    : 'Points preview unavailable right now'}
              </Text>
            )}
            {weightOz === null && (
              <Text style={[Typography.caption, { color: theme.textMuted }]}>
                Leave blank to post without logging a weighed catch.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[Typography.h2, { color: theme.text }]}>Caught</Text>
            <View style={styles.weightRow}>
              <View style={styles.weightField}>
                <FormField label="Date" value={dateText} onChangeText={handleDateChange} placeholder="YYYY-MM-DD" />
              </View>
              <View style={styles.weightField}>
                <FormField label="Time (GMT)" value={timeText} onChangeText={handleTimeChange} placeholder="HH:MM" />
              </View>
            </View>
            {/* Sits directly under the fields that cause it, because the fix
              * is to correct the date — most often one prefilled from a
              * library photo's EXIF, which is the camera's date, not the
              * fish's. */}
            {outsideSeason && (
              <View style={[styles.noticeCard, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
                <Text style={[Typography.bodySmall, { color: theme.text }]}>
                  {dateText} isn&rsquo;t inside a running season.
                </Text>
                <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                  This fish will be posted to your feed, but it won&rsquo;t score or appear in the league
                  table. If the date came from the photo, check it&rsquo;s the day you caught the fish.
                </Text>
              </View>
            )}
          </View>

          <VisibilityPicker value={visibility} onChange={setVisibility} />

          <VenuePicker
            selection={venue}
            onChange={setVenue}
            venueHidden={venueHidden}
            onChangeVenueHidden={setVenueHidden}
          />

          <FormField
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            multiline
            numberOfLines={3}
          />

          {submitError && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{submitError}</Text>}

          {/* Not blocked, only named. Logging a fish caught in the closed
            * months is legitimate and a hard stop would refuse it for half
            * the year — but the consequence belongs on the button, where it
            * cannot be scrolled past. */}
          <AppButton
            title={outsideSeason ? "Post anyway — won't score" : 'Submit'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  pickButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  pickButton: {
    flex: 1,
  },
  weightRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  weightField: {
    flex: 1,
  },
});
