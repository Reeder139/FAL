-- ===========================================================================
-- Admin layer, part 1 of 3: the tables the console writes to.
--
-- The console itself is Retool over the Data API, so everything it can do
-- has to exist here as schema and functions rather than as application code.
-- That is the point: business logic lives in Postgres, and there is exactly
-- one implementation of "verify a catch" no matter who calls it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ADMIN ACTIONS — the audit trail
--
-- Every admin function writes one row here before it returns. Not a
-- convention that can be forgotten: the helper that writes it is the same
-- helper that checks the caller is an admin, so an action that skipped the
-- audit would also have skipped its own authorisation.
--
-- Append-only, enforced twice over. RLS grants no update or delete to
-- anyone, and the trigger below refuses them outright — because the console
-- runs on service_role, which bypasses RLS entirely. Policy alone would
-- protect this table from every caller except the one that actually uses it.
-- ---------------------------------------------------------------------------
-- gen_random_uuid() rather than uuid_generate_v4(): the uuid-ossp extension
-- lives in the `extensions` schema, which is not on the search path a
-- migration runs under, so the older spelling fails here even though it
-- works in the snapshot. gen_random_uuid() is Postgres core and needs no
-- extension at all.
create table admin_actions (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable because a system action (a scheduled close, say) has no human
  -- actor. Never nullable *because we did not bother* to record one.
  actor_id     uuid references profiles(id),
  action       text not null,
  target_table text not null,
  target_id    uuid,
  -- Whatever the action needs to be reconstructed later: the reason given,
  -- the before and after values, the arguments it was called with.
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index on admin_actions (created_at desc);
create index on admin_actions (target_table, target_id);
create index on admin_actions (actor_id, created_at desc);

create or replace function private.admin_actions_are_append_only()
returns trigger
language plpgsql as $$
begin
  raise exception 'admin_actions is append-only; % is not permitted', tg_op;
end; $$;

create trigger admin_actions_no_update
  before update or delete on admin_actions
  for each row execute function private.admin_actions_are_append_only();

-- ---------------------------------------------------------------------------
-- SUPPORT
--
-- Threads belong to a member and are worked by staff. Messages carry an
-- internal_note flag so staff can talk to each other in the same thread the
-- member is reading — which is the only reason the flag exists, and the
-- reason the member-facing select policy has to filter on it rather than
-- the app remembering to.
-- ---------------------------------------------------------------------------
create table support_threads (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  subject      text not null,
  status       text not null default 'open'
                 check (status in ('open','waiting','resolved')),
  -- Which admin owns it. Null = unassigned queue.
  assigned_to  uuid references profiles(id),
  -- Set when a thread was opened by the system on the member's behalf, e.g.
  -- request_evidence(). Lets the console separate "member asked us something"
  -- from "we asked the member something".
  opened_by_staff boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on support_threads (member_id, created_at desc);
create index on support_threads (status, updated_at desc);
create index on support_threads (assigned_to, status);

create table support_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references support_threads(id) on delete cascade,
  author_id     uuid references profiles(id),
  body          text not null,
  -- Staff-only. Never returned to the member — see the select policy.
  internal_note boolean not null default false,
  created_at    timestamptz not null default now()
);

create index on support_messages (thread_id, created_at);

-- Keeps the thread list sortable by real activity rather than by when the
-- thread happened to be opened.
create or replace function private.touch_support_thread()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update support_threads set updated_at = now() where id = new.thread_id;
  return null;
end; $$;

create trigger support_messages_touch_thread
  after insert on support_messages
  for each row execute function private.touch_support_thread();

-- ---------------------------------------------------------------------------
-- POST MEDIA — full EXIF
--
-- The parsed columns (exif_taken_at, camera make/model) stay: they are what
-- queries filter on. This is the rest of it, kept verbatim so a reviewer can
-- see what we did *not* parse — GPS, orientation, software tags, lens — when
-- a claim looks wrong. Parsing more fields later is then a question about
-- data we already hold rather than data we threw away.
-- ---------------------------------------------------------------------------
alter table post_media add column if not exists exif_raw jsonb;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table admin_actions    enable row level security;
alter table support_threads  enable row level security;
alter table support_messages enable row level security;

-- admin_actions: readable by admins, written only by the security-definer
-- helper. No insert policy for anyone else, and deliberately no update or
-- delete policy at all.
create policy "admin actions readable by admins"
  on admin_actions for select using (public.is_admin());

-- support_threads: your own, or anything if you are staff.
create policy "members read their own threads"
  on support_threads for select
  using (member_id = auth.uid() or public.is_admin());

create policy "members open their own threads"
  on support_threads for insert
  with check (member_id = auth.uid() and not opened_by_staff);

create policy "admins update threads"
  on support_threads for update using (public.is_admin());

-- support_messages: messages on your own threads, minus the internal notes.
create policy "members read replies on their own threads"
  on support_messages for select
  using (
    public.is_admin()
    or (
      not internal_note
      and exists (
        select 1 from support_threads t
        where t.id = support_messages.thread_id and t.member_id = auth.uid()
      )
    )
  );

create policy "members reply on their own threads"
  on support_messages for insert
  with check (
    author_id = auth.uid()
    and not internal_note
    and exists (
      select 1 from support_threads t
      where t.id = support_messages.thread_id and t.member_id = auth.uid()
    )
  );

create policy "admins write messages"
  on support_messages for insert with check (public.is_admin());
