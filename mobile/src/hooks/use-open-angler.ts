import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/providers/auth-provider';

type OpenOptions = {
  /** Replace the current screen instead of pushing onto it. For the search
   * modal, which shouldn't be left sitting underneath the profile you just
   * opened from it. */
  replace?: boolean;
};

/**
 * Opens an angler's profile from wherever their name appears — league
 * tables, the leaders cards, the suggested rails, search results, feed
 * posts, follower lists.
 *
 * Tapping yourself goes to the profile tab, not `/profile/[id]`. Both would
 * render, but only the tab is yours to edit: it carries the avatar picker
 * and your catch grid, where the public view would show you a Follow button
 * aimed at yourself.
 *
 * The self check lives here rather than at each call site so that tapping
 * your own name behaves the same everywhere, without every list having to
 * remember to thread an `isYou` flag through to its rows. `/profile/[id]`
 * makes the same check itself for anyone arriving by deep link.
 */
export function useOpenAngler() {
  const router = useRouter();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  return useCallback(
    (anglerId: string, { replace = false }: OpenOptions = {}) => {
      const go = replace ? router.replace : router.push;
      if (anglerId === viewerId) go('/profile');
      else go({ pathname: '/profile/[id]', params: { id: anglerId } });
    },
    [router, viewerId]
  );
}
