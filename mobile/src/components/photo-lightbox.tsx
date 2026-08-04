import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type Photo = {
  uri: string;
  /** Shown under the image — weight and venue for a catch. */
  caption?: string;
};

type LightboxContextValue = {
  /** Opens the viewer on a full-size photo. */
  showPhoto: (photo: Photo) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);
const LightboxInternal = createContext<{ photo: Photo | null; dismiss: () => void } | null>(null);

/**
 * Full-screen viewer for a single photo.
 *
 * Provider/host split for the same reason as the rules card: the thing that
 * opens it is deep inside a screen (a tile in the catch grid, itself inside
 * a ScrollView), but the viewer has to render after the tab bar and Catch
 * button to cover them. An overlay rendered from inside the grid would be
 * positioned against the scroll content instead of the viewport, and would
 * scroll away with it.
 */
export function PhotoLightboxProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const value = useMemo(() => ({ showPhoto: (p: Photo) => setPhoto(p) }), []);

  return (
    <LightboxContext.Provider value={value}>
      <LightboxInternal.Provider value={{ photo, dismiss: () => setPhoto(null) }}>
        {children}
      </LightboxInternal.Provider>
    </LightboxContext.Provider>
  );
}

/** Renders the viewer. Mount once, last, inside PhotoLightboxProvider. */
export function PhotoLightboxHost() {
  const state = useContext(LightboxInternal);
  const { width, height } = useWindowDimensions();
  if (!state?.photo) return null;

  return (
    <View style={styles.root}>
      {/* Backdrop as a sibling of the image, not its parent — nesting means
       * a tap on the image runs the backdrop's handler too, since these are
       * bubbling DOM clicks on web. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={state.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
      />

      {/* resizeMode contain against an explicit box: the photo keeps its own
       * aspect whatever shape it is, which is the point of opening it. */}
      <Image
        source={{ uri: state.photo.uri }}
        style={{ width: width - Spacing.four * 2, height: height * 0.7 }}
        resizeMode="contain"
      />

      {state.photo.caption && (
        <Text style={[Typography.body, styles.caption, { color: Colors.dark.text }]}>
          {state.photo.caption}
        </Text>
      )}
    </View>
  );
}

/** Opens the photo viewer. Throws outside the provider rather than silently
 * doing nothing, since a dead tap is harder to notice than a crash. */
export function usePhotoLightbox(): LightboxContextValue {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('usePhotoLightbox must be used inside PhotoLightboxProvider');
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    // Above the tab bar and Catch button, which are siblings in (tabs)/_layout.
    zIndex: 10,
    // Pinned dark: a photo viewer wants the surroundings out of the way
    // regardless of the app's colour scheme.
    backgroundColor: Colors.dark.overlay,
  },
  caption: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.dark.surface,
    overflow: 'hidden',
  },
});
