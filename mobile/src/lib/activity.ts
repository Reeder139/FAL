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

/** Called when the tab is opened. Failing to mark read is not worth telling
 * the angler about — the worst case is the badge shows again next time. */
export async function markActivityRead(): Promise<void> {
  await supabase.rpc('mark_activity_read');
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
