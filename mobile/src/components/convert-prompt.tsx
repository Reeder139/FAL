import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { OverlayCard } from '@/components/overlay-card';

type Prompt = {
  source: ImageSourcePropType;
  /** The card's own aspect. They differ, so this can't be one constant —
   * see scripts/prepare-convert-prompts.mjs, which prints these. */
  ratio: number;
  /** The artwork carries all its own text, so this is the only thing a
   * screen reader has to go on. */
  label: string;
};

const PROMPTS: Prompt[] = [
  {
    source: require('@/assets/images/convert/big-leagues.jpg'),
    ratio: 1187 / 1094,
    label:
      'Join the big leagues now to play for six divisional cash prizes and the grand prize of £20,000. Upgrade now and enter to win.',
  },
  {
    source: require('@/assets/images/convert/national-league.jpg'),
    ratio: 1200 / 1002,
    label:
      "You're playing in the National League with all members, but not in the big leagues for real prizes. Upgrade now to see where you would be placing and start playing for real prizes.",
  },
];

const ROTATION_KEY = 'fal.convertPromptIndex';

/**
 * Which card to show, advancing the rotation for next time.
 *
 * Persisted rather than held in memory because the prompt appears once per
 * session: an in-memory counter would reset on every launch alongside it, so
 * the first card would win every session and the second would never be seen.
 * Storage is what makes the rotation actually rotate.
 */
async function takeNextPrompt(): Promise<Prompt> {
  let index = 0;
  try {
    const stored = await AsyncStorage.getItem(ROTATION_KEY);
    const parsed = stored === null ? 0 : Number.parseInt(stored, 10);
    if (Number.isFinite(parsed) && parsed >= 0) index = parsed % PROMPTS.length;
    await AsyncStorage.setItem(ROTATION_KEY, String((index + 1) % PROMPTS.length));
  } catch {
    // Non-critical — worst case the rotation restarts. Still show a card.
  }
  return PROMPTS[index];
}

type ConvertPromptProps = {
  visible: boolean;
  onDismiss: () => void;
};

/**
 * Upsell card shown over the League tab to members who aren't in the paid
 * competition. Tapping the card goes to /join; tapping the backdrop, or the
 * X in the artwork, dismisses it.
 *
 * The two cards alternate on each appearance rather than one being picked at
 * random — random repeats itself often enough to look broken.
 */
export function ConvertPrompt({ visible, onDismiss }: ConvertPromptProps) {
  const router = useRouter();
  // Null until the rotation has been read for this appearance, which is what
  // stops the first card flashing up and being swapped for the second once
  // storage answers.
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const wasVisible = useRef(false);

  // Take the next card on the transition into visible, not on every render —
  // otherwise a resize would advance the rotation and swap the card while
  // the angler is looking at it.
  useEffect(() => {
    let cancelled = false;
    if (visible && !wasVisible.current) {
      takeNextPrompt().then((next) => {
        if (!cancelled) setPrompt(next);
      });
    } else if (!visible) {
      setPrompt(null);
    }
    wasVisible.current = visible;
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!prompt) return null;

  return (
    <OverlayCard
      visible={visible}
      onDismiss={onDismiss}
      source={prompt.source}
      ratio={prompt.ratio}
      label={prompt.label}
      onPress={() => {
        onDismiss();
        router.push('/join');
      }}
    />
  );
}
