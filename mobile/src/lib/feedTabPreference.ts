import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FeedTab } from '@/lib/feed';

const STORAGE_KEY = 'fal.feedTab';
const DEFAULT_TAB: FeedTab = 'all'; // beta default per the product ask

/** Only ever called from an effect/event handler (never module scope), so
 * this never runs during the web SSR pass — see sessionStorage.ts for why
 * that distinction matters for AsyncStorage on web. */
export async function getLastFeedTab(): Promise<FeedTab> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'following' || stored === 'all' || stored === 'league') return stored;
  } catch {
    // Fall through to the default — this is a UI convenience, not critical state.
  }
  return DEFAULT_TAB;
}

export async function setLastFeedTab(tab: FeedTab): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Non-critical — worst case the preference doesn't stick.
  }
}
