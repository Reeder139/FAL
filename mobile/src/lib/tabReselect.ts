import { useEffect, useRef } from 'react';

/**
 * "You pressed the tab you are already on."
 *
 * The convention everywhere else: tapping the current tab's icon takes you
 * back to the top of it. Routing alone cannot express that — pressing Feed
 * while already on Feed navigates to the route it is already showing, which
 * is correctly a no-op, so the screen never hears about it.
 *
 * A module-level channel rather than a context, for the same reason
 * leagueSummary.ts is one: the two ends are the tab bar and the screen inside
 * it, and threading a provider between them buys nothing. Keyed by tab name so
 * the Feed's list does not jump when League is pressed.
 *
 * Deliberately not a store — there is no state here, only a moment. A
 * `useSyncExternalStore` value would have to be a counter that every
 * subscriber then diffed against its own last-seen value, which is more
 * machinery than "run this callback" needs.
 */
const listeners = new Map<string, Set<() => void>>();

/** Call when a tab is pressed *and* it is already the open one. */
export function emitTabReselect(tab: string): void {
  // Copied before iterating: a listener that unsubscribes itself would
  // otherwise mutate the set mid-loop.
  for (const listener of [...(listeners.get(tab) ?? [])]) listener();
}

/**
 * Run `onReselect` whenever this tab is pressed while already open.
 *
 * "Already open" is decided by whoever emits, not here. Both tab bars know it
 * for certain — the web one from the trigger's own `isFocused`, the native one
 * from `navigation.isFocused()` in its `tabPress` listener — so asking the
 * screen to work it out again would only add a second, less reliable answer.
 *
 * The callback is held in a ref and the subscription keyed only on the tab
 * name, so a screen can pass an inline arrow function without resubscribing
 * on every render.
 */
export function useTabReselect(tab: string, onReselect: () => void): void {
  const callback = useRef(onReselect);
  callback.current = onReselect;

  useEffect(() => {
    const listener = () => callback.current();
    const set = listeners.get(tab) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(tab, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(tab);
    };
  }, [tab]);
}
