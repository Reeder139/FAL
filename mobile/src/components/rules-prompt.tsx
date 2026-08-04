import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { OverlayCard } from '@/components/overlay-card';

/** Source dimensions of the prepared card (see
 * scripts/prepare-rules-assets.mjs). */
const RULES_RATIO = 1316 / 1129;

/** Wider than the upsell cards. This one is read rather than glanced at —
 * eleven numbered rules in small type — so it takes as much of the viewport
 * as it can get. */
const RULES_MAX_WIDTH = 560;
const RULES_MAX_HEIGHT_FRACTION = 0.88;

const RULES_LABEL =
  'The rules of the game. Summer and winter league. Three divisions. Players seeded by PB. ' +
  'Six division winners a year get £1,500. Division winners fish in the live grand final for ' +
  '£20,000 at a top venue. Everyone plays in the National League for bragging rights. Upload ' +
  'catches to score points. Bonus points for a new PB. Monthly best fish comp voted by players. ' +
  'Create mini leagues with friends or clubs. Follow top anglers and learn their methods.';

type RulesPromptContextValue = {
  /** Opens the rules card. Safe to call from any screen inside (tabs). */
  showRules: () => void;
};

const RulesPromptContext = createContext<RulesPromptContextValue | null>(null);

/**
 * Holds the rules card's open state and renders it.
 *
 * Split into a provider and a host because of where the card has to live:
 * the button that opens it is on the feed's header row, but the card itself
 * has to render after the tab bar and Catch button to cover them. So the
 * provider wraps the tab layout, the feed calls showRules() through context,
 * and <RulesPromptHost /> is mounted last inside that layout.
 */
export function RulesPromptProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(() => ({ showRules: () => setVisible(true) }), []);

  return (
    <RulesPromptContext.Provider value={value}>
      <RulesPromptInternal.Provider value={{ visible, dismiss: () => setVisible(false) }}>
        {children}
      </RulesPromptInternal.Provider>
    </RulesPromptContext.Provider>
  );
}

const RulesPromptInternal = createContext<{ visible: boolean; dismiss: () => void } | null>(null);

/** Renders the card. Mount once, last, inside RulesPromptProvider. */
export function RulesPromptHost() {
  const state = useContext(RulesPromptInternal);
  if (!state) return null;

  return (
    <OverlayCard
      visible={state.visible}
      onDismiss={state.dismiss}
      source={require('@/assets/images/rules/rules-card.jpg')}
      ratio={RULES_RATIO}
      label={RULES_LABEL}
      maxWidth={RULES_MAX_WIDTH}
      maxHeightFraction={RULES_MAX_HEIGHT_FRACTION}
    />
  );
}

/** Opens the rules card. Throws outside the provider rather than silently
 * doing nothing, since a dead button is harder to notice than a crash. */
export function useRulesPrompt(): RulesPromptContextValue {
  const ctx = useContext(RulesPromptContext);
  if (!ctx) throw new Error('useRulesPrompt must be used inside RulesPromptProvider');
  return ctx;
}
