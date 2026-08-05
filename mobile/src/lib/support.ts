import { supabase } from '@/lib/supabase';

export type SupportStatus = 'open' | 'waiting' | 'resolved';

export interface SupportThread {
  id: string;
  subject: string;
  status: SupportStatus;
  /** True when staff started it — e.g. a request for evidence — rather than
   * the member. Worth showing differently: one is a question you asked, the
   * other is a question you have been asked. */
  openedByStaff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  authorId: string | null;
  /** Null for staff replies — the member sees "Support", not a name. */
  authorUsername: string | null;
  isMine: boolean;
  body: string;
  createdAt: string;
}

/**
 * The member's own threads, most recently active first.
 *
 * No filter on member_id: RLS already limits this to the caller's own
 * threads, and adding a redundant client-side filter would make it look as
 * though the policy were optional.
 */
export async function fetchMyThreads(): Promise<SupportThread[]> {
  const { data, error } = await supabase
    .from('support_threads')
    .select('id, subject, status, opened_by_staff, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status as SupportStatus,
    openedByStaff: t.opened_by_staff,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

/**
 * Every message on a thread the member can see.
 *
 * Internal staff notes are filtered out by RLS, not here — the policy is on
 * support_messages and applies to every caller, so a note cannot leak
 * through a query this file forgot to constrain.
 */
export async function fetchThreadMessages(threadId: string): Promise<SupportMessage[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, thread_id, author_id, body, created_at, profiles:author_id (username)')
    .eq('thread_id', threadId)
    .order('created_at');
  if (error) throw error;

  return (data ?? []).map((m) => {
    const author = (m as { profiles?: { username?: string } | null }).profiles;
    return {
      id: m.id,
      threadId: m.thread_id,
      authorId: m.author_id,
      authorUsername: author?.username ?? null,
      isMine: !!user && m.author_id === user.id,
      body: m.body,
      createdAt: m.created_at,
    };
  });
}

/** Open a new request. Returns the thread so the caller can go straight to
 * it rather than bouncing back to a list to find it. */
export async function openThread(subject: string, body: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to contact support.');

  const { data: thread, error } = await supabase
    .from('support_threads')
    .insert({ member_id: user.id, subject })
    .select('id')
    .single();
  if (error) throw error;

  const { error: messageError } = await supabase
    .from('support_messages')
    .insert({ thread_id: thread.id, author_id: user.id, body });
  if (messageError) throw messageError;

  return thread.id;
}

export async function replyToThread(threadId: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to reply.');

  const { error } = await supabase
    .from('support_messages')
    .insert({ thread_id: threadId, author_id: user.id, body });
  if (error) throw error;
}
