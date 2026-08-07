import { useCallback, useSyncExternalStore } from 'react';

import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/** Every kind of thing that can land on the Activity tab. `catch_*` mirrors
 * catches.status, so a status added there shows up here as an unknown kind
 * rather than being silently dropped — see labelFor. */
export type ActivityKind =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'catch_verified'
  | 'catch_rejected'
  | 'catch_under_review'
  | 'catch_pending';

export interface ActivityEvent {
  kind: ActivityKind | string;
  occurredAt: string;
  actorId: string | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  postId: string | null;
  catchId: string | null;
  weightOz: number | null;
  photoUrl: string | null;
  body: string | null;
}

interface RawEvent {
  kind: string;
  occurred_at: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_avatar_path: string | null;
  post_id: string | null;
  catch_id: string | null;
  weight_oz: number | null;
  photo_path: string | null;
  body: string | null;
}

export const ACTIVITY_PAGE_SIZE = 40;

/**
 * A page of the angler's activity.
 *
 * Keyset pagination on the timestamp rather than an offset: the feed is
 * derived from five tables at once, so a row can appear between two requests
 * and an offset would silently skip an event.
 */
export async function fetchActivity(before: string | null = null): Promise<ActivityEvent[]> {
  const { data, error } = await supabase.rpc('activity_feed', {
    p_limit: ACTIVITY_PAGE_SIZE,
    p_before: before,
  });
  if (error) throw error;

  return ((data ?? []) as RawEvent[]).map((row) => ({
    kind: row.kind,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    actorAvatarUrl: row.actor_avatar_path
      ? getPublicStorageUrl('post-media', row.actor_avatar_path)
      : null,
    postId: row.post_id,
    catchId: row.catch_id,
    weightOz: row.weight_oz,
    photoUrl: row.photo_path ? getPublicStorageUrl('post-media', row.photo_path) : null,
    body: row.body,
  }));
}

export async function fetchUnreadActivityCount(): Promise<number> {
  const { data, error } = await supabase.rpc('activity_unread_count');
  if (error) return 0;
  return (data as number | null) ?? 0;
}

// ---------------------------------------------------------------------------
// The unread count, shared by the tab bar and refreshed on a timer.
//
// A module-level store rather than a context, for the same reason
// leagueSummary.ts is one: the reader is the tab bar, which is mounted once,
// and threading a provider down to it gains nothing.
//
// It polls because there is no realtime subscription anywhere in this app yet.
// A badge that only updates on a full page load is barely a badge — the whole
// point is to tell an angler something happened while they were on another
// tab. One cheap RPC a minute, only while something is actually subscribed, is
// the smallest thing that makes it true. If realtime arrives later this is the
// piece to replace.
// ---------------------------------------------------------------------------

const UNREAD_POLL_MS = 60_000;

let unreadCount = 0;
let unreadInflight: Promise<void> | null = null;
let unreadTimer: ReturnType<typeof setInterval> | null = null;
const unreadListeners = new Set<() => void>();

function emitUnread() {
  for (const l of unreadListeners) l();
}

/** Refetch the badge count. Shares an in-flight request rather than stacking
 * them, since the poll and a manual refresh can land together. */
export function refreshUnreadActivity(): Promise<void> {
  if (unreadInflight) return unreadInflight;
  unreadInflight = fetchUnreadActivityCount()
    .then((next) => {
      if (next !== unreadCount) {
        unreadCount = next;
        emitUnread();
      }
    })
    .finally(() => {
      unreadInflight = null;
    });
  return unreadInflight;
}

export function useUnreadActivityCount(): number {
  const subscribe = useCallback((onChange: () => void) => {
    unreadListeners.add(onChange);
    if (unreadTimer === null) {
      void refreshUnreadActivity();
      unreadTimer = setInterval(() => void refreshUnreadActivity(), UNREAD_POLL_MS);
    }
    return () => {
      unreadListeners.delete(onChange);
      // Last one out stops the timer, so nothing keeps polling in the
      // background once the bar is gone (signing out, for one).
      if (unreadListeners.size === 0 && unreadTimer !== null) {
        clearInterval(unreadTimer);
        unreadTimer = null;
      }
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => unreadCount,
    () => unreadCount
  );
}

/**
 * Marks everything up to now as seen, and returns the watermark it replaced.
 *
 * Opening the tab is what "seen" means, so this fires on mount — which is
 * exactly why it has to hand back the old value. Without it nothing could
 * ever render as unread: by the time the rows drew, the watermark had already
 * moved past them.
 *
 * Null means they have never opened the tab, so everything is new.
 *
 * Failing is not worth telling the angler about — the worst case is that a
 * few rows show as unread once more.
 *
 * Zeroing the tab badge is done here rather than by the screen, because the
 * watermark and the badge are two views of one fact: the moment this succeeds
 * there is nothing unread, and a caller that moved the watermark without
 * clearing the badge would leave a count sitting over an already-read list
 * until the next poll.
 */
export async function markActivityRead(): Promise<string | null> {
  const { data, error } = await supabase.rpc('mark_activity_read');
  if (error) return null;
  if (unreadCount !== 0) {
    unreadCount = 0;
    emitUnread();
  }
  return (data as string | null) ?? null;
}

/** How long ago, in the shortest form that is still unambiguous. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  // Past a month the exact gap stops mattering and the date is more use.
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
