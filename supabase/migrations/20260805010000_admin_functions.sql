-- ===========================================================================
-- Admin layer, part 2 of 3: the functions the console calls.
--
-- All security definer, all admin-gated, all audited. The gate and the audit
-- are the same call — private.admin_audit() — so there is no path that
-- performs an action without recording it, and none that records without
-- having checked.
--
-- Every one of these takes a reason. Standings and money are downstream of
-- most of them, and "who changed this and why" needs to survive the person
-- who did it leaving.
-- ===========================================================================

-- pg_net is what lets trigger_password_reset() reach GoTrue. Postgres cannot
-- mint a recovery link itself — that is an auth-server concern — so the
-- function has to make an HTTP call like any other client would.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- GATE + AUDIT
-- ---------------------------------------------------------------------------

/**
 * Authorise the caller and record what they did, in one call.
 *
 * Accepts two kinds of caller: a signed-in admin (a human in the console
 * with their own account), and service_role (Retool's server-side key).
 * service_role has to be allowed explicitly — it bypasses RLS, but
 * is_admin() reads auth.uid(), which is null for it, so a check on
 * is_admin() alone would lock the console out of its own admin functions.
 *
 * actor_id is therefore null for service_role calls and set for human ones.
 * That distinction is worth keeping: it is the difference between "an admin
 * did this" and "something automated did this".
 */
create or replace function private.admin_audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_detail       jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_detail, '{}'::jsonb));
end; $$;

-- ---------------------------------------------------------------------------
-- CATCH MODERATION
--
-- catches.status is never written by these functions. They insert into
-- catch_reviews and the trigger below propagates it, which makes the review
-- log the cause of a status rather than a note written alongside it. A catch
-- cannot end up verified with no record of who verified it, because the
-- record is the mechanism.
-- ---------------------------------------------------------------------------

create or replace function private.capture_review_from_status()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Filled here rather than by callers so it cannot disagree with reality.
  if new.from_status is null then
    select c.status into new.from_status from catches c where c.id = new.catch_id;
  end if;
  return new;
end; $$;

create trigger catch_reviews_capture_from_status
  before insert on catch_reviews
  for each row execute function private.capture_review_from_status();

create or replace function private.apply_catch_review()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update catches set status = new.to_status where id = new.catch_id;
  return null;
end; $$;

create trigger catch_reviews_apply_status
  after insert on catch_reviews
  for each row execute function private.apply_catch_review();

create or replace function public.verify_catch(p_catch_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('verify_catch', 'catches', p_catch_id,
    jsonb_build_object('reason', p_reason));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'verified', p_reason);
end; $$;

create or replace function public.reject_catch(p_catch_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('reject_catch', 'catches', p_catch_id,
    jsonb_build_object('reason', p_reason));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'rejected', p_reason);
end; $$;

/**
 * Ask the angler for more evidence.
 *
 * Three things happen together and must not come apart: the catch stops
 * counting, the angler is told, and there is somewhere for them to reply.
 * The support thread is the notification — there is no separate
 * notifications table, and adding one to say a single thing that already has
 * a home would be worse. The app surfaces the open thread as a banner on the
 * catch (see the under-review banner in the feed and profile).
 */
create or replace function public.request_evidence(p_catch_id uuid, p_message text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_angler_id uuid;
  v_weight_oz integer;
  v_thread_id uuid;
begin
  select c.angler_id, c.weight_oz into v_angler_id, v_weight_oz
  from catches c where c.id = p_catch_id;
  if v_angler_id is null then
    raise exception 'catch % not found', p_catch_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('request_evidence', 'catches', p_catch_id,
    jsonb_build_object('message', p_message, 'angler_id', v_angler_id));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'under_review', p_message);

  insert into support_threads (member_id, subject, status, opened_by_staff)
  values (
    v_angler_id,
    'Evidence needed for your ' || (v_weight_oz / 16) || 'lb ' || (v_weight_oz % 16) || 'oz catch',
    'waiting',
    true
  )
  returning id into v_thread_id;

  insert into support_messages (thread_id, author_id, body)
  values (v_thread_id, auth.uid(), p_message);

  return v_thread_id;
end; $$;

-- ---------------------------------------------------------------------------
-- MEMBERS
-- ---------------------------------------------------------------------------

create or replace function public.suspend_member(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('suspend_member', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set suspended_at = now() where id = p_user_id;
end; $$;

create or replace function public.unsuspend_member(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('unsuspend_member', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set suspended_at = null where id = p_user_id;
end; $$;

/**
 * Confirm a declared PB against evidence.
 *
 * Writes the weight as well as the flag, because verification usually
 * settles what the number actually is. The previous value goes in the audit
 * detail — this is the one member field that decides division placement, so
 * "it used to say something else" needs to be answerable.
 */
create or replace function public.verify_pb(p_user_id uuid, p_weight_oz integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before integer;
begin
  select declared_pb_oz into v_before from profiles where id = p_user_id;

  perform private.admin_audit('verify_pb', 'profiles', p_user_id,
    jsonb_build_object('declared_pb_oz_before', v_before, 'declared_pb_oz_after', p_weight_oz));

  update profiles
     set declared_pb_oz = p_weight_oz,
         pb_verified    = true
   where id = p_user_id;
end; $$;

/** Move an angler between divisions mid-season. Records where they came
 * from, since this directly changes who they are competing against for a
 * cash prize. */
create or replace function public.set_division(
  p_user_id     uuid,
  p_season_id   uuid,
  p_division_id uuid,
  p_reason      text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before uuid;
begin
  select division_id into v_before
    from season_entries
   where angler_id = p_user_id and season_id = p_season_id;

  perform private.admin_audit('set_division', 'season_entries', p_user_id,
    jsonb_build_object(
      'season_id', p_season_id,
      'division_before', v_before,
      'division_after', p_division_id,
      'reason', p_reason
    ));

  update season_entries
     set division_id = p_division_id
   where angler_id = p_user_id and season_id = p_season_id;

  if not found then
    raise exception 'no season entry for angler % in season %', p_user_id, p_season_id
      using errcode = 'P0002';
  end if;
end; $$;

/**
 * Send the member a password reset.
 *
 * Postgres cannot mint a recovery link — GoTrue owns that — so this calls
 * the auth admin API over pg_net. The service key comes from Vault rather
 * than being written into the function body, because a function definition
 * is readable by anyone who can read the catalogue.
 *
 * Setup, once, before this works:
 *   select vault.create_secret('<service_role_key>', 'service_role_key');
 *   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
 *
 * Fire-and-forget by design: pg_net queues the request and returns an id.
 * The audit row is the record that we asked, not proof the email arrived.
 */
create or replace function public.trigger_password_reset(p_user_id uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_email       text;
  v_service_key text;
  v_project_url text;
  v_request_id  bigint;
begin
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('trigger_password_reset', 'profiles', p_user_id, '{}'::jsonb);

  select decrypted_secret into v_service_key
    from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'project_url';

  if v_service_key is null or v_project_url is null then
    raise exception
      'vault secrets service_role_key and project_url must be set before password resets can be sent'
      using errcode = '55000';
  end if;

  select net.http_post(
    url     := v_project_url || '/auth/v1/recover',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', v_service_key,
                 'Authorization', 'Bearer ' || v_service_key
               ),
    body    := jsonb_build_object('email', v_email)
  ) into v_request_id;

  return v_request_id;
end; $$;

/**
 * Change a member's sign-in email.
 *
 * Writes auth.users directly, which skips the confirm-both-addresses dance
 * GoTrue normally runs. That is the point — this exists for the case where
 * the member has lost the old address and cannot confirm anything — but it
 * means the new address is trusted on an admin's say-so, so the old one is
 * kept in the audit detail.
 */
create or replace function public.update_member_email(p_user_id uuid, p_new_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select email into v_before from auth.users where id = p_user_id;
  if v_before is null then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('update_member_email', 'profiles', p_user_id,
    jsonb_build_object('email_before', v_before, 'email_after', p_new_email));

  update auth.users
     set email              = p_new_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = p_user_id;
end; $$;

-- ---------------------------------------------------------------------------
-- VENUES
-- ---------------------------------------------------------------------------

/**
 * Fold a duplicate venue into the one that survives.
 *
 * Never deletes. The loser keeps its row with merged_into set, so a catch
 * logged against it still resolves and an old link still works — and so the
 * merge can be reasoned about afterwards, which a delete makes impossible.
 * Catches are repointed because the venue's weight distribution is a fraud
 * signal (see private.venue_distributions), and a distribution split across
 * two spellings of the same lake is worth less than one.
 */
create or replace function public.merge_venues(p_loser_id uuid, p_survivor_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_moved integer;
begin
  if p_loser_id = p_survivor_id then
    raise exception 'cannot merge a venue into itself' using errcode = '22023';
  end if;

  perform private.admin_audit('merge_venues', 'venues', p_loser_id,
    jsonb_build_object('survivor_id', p_survivor_id));

  update catches set venue_id = p_survivor_id where venue_id = p_loser_id;
  get diagnostics v_moved = row_count;

  update venues set merged_into = p_survivor_id where id = p_loser_id;

  -- Recorded a second time now the count is known, so the audit says how
  -- much moved rather than only that a merge was attempted.
  perform private.admin_audit('merge_venues_complete', 'venues', p_loser_id,
    jsonb_build_object('survivor_id', p_survivor_id, 'catches_moved', v_moved));

  return v_moved;
end; $$;

create or replace function public.approve_venue(p_venue_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('approve_venue', 'venues', p_venue_id, '{}'::jsonb);
  update venues set approved = true where id = p_venue_id;
end; $$;

-- ---------------------------------------------------------------------------
-- SEASONS
--
-- Only one season may be `running` at a time. The app resolves the current
-- season with a single-row lookup on that status — league tables, the PB
-- calculation, the divisions page — so a second running season would not
-- produce a merged league, it would produce whichever row came back first.
-- Enforced as an index rather than as a rule inside open_season(), so it
-- also holds against a hand-written update in the console.
-- ---------------------------------------------------------------------------
create unique index if not exists seasons_one_running
  on seasons ((status)) where status = 'running';

create or replace function public.create_season(
  p_name          text,
  p_starts_on     date,
  p_ends_on       date,
  p_counting_fish smallint
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_ends_on <= p_starts_on then
    raise exception 'season must end after it starts' using errcode = '22023';
  end if;

  insert into seasons (name, starts_on, ends_on, counting_fish)
  values (p_name, p_starts_on, p_ends_on, p_counting_fish)
  returning id into v_id;

  perform private.admin_audit('create_season', 'seasons', v_id,
    jsonb_build_object('name', p_name, 'starts_on', p_starts_on,
                       'ends_on', p_ends_on, 'counting_fish', p_counting_fish));

  return v_id;
end; $$;

/**
 * Retune a season's scoring.
 *
 * The whole point of scoring being computed rather than stored: this
 * re-scores every leaderboard the moment it commits, with no backfill. The
 * before values are audited because that also means there is no other record
 * of what the table looked like an hour ago.
 */
create or replace function public.set_scoring(
  p_season_id        uuid,
  p_multiplier       numeric,
  p_offset_oz        integer,
  p_exponent         numeric,
  p_min_qualifying   integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  select to_jsonb(s) - 'id' - 'name' - 'created_at' into v_before
    from seasons s where s.id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('set_scoring', 'seasons', p_season_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'scoring_multiplier', p_multiplier,
        'scoring_offset_oz', p_offset_oz,
        'scoring_exponent', p_exponent,
        'min_qualifying_oz', p_min_qualifying
      )
    ));

  update seasons
     set scoring_multiplier = p_multiplier,
         scoring_offset_oz  = p_offset_oz,
         scoring_exponent   = p_exponent,
         min_qualifying_oz  = p_min_qualifying
   where id = p_season_id;
end; $$;

/** Resize a division's PB band. Audited with the old bounds because this
 * decides who is seeded where next season. */
create or replace function public.set_division_boundaries(
  p_division_id uuid,
  p_min_pb_oz   integer,
  p_max_pb_oz   integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  select jsonb_build_object('min_pb_oz', d.min_pb_oz, 'max_pb_oz', d.max_pb_oz)
    into v_before from divisions d where d.id = p_division_id;
  if v_before is null then
    raise exception 'division % not found', p_division_id using errcode = 'P0002';
  end if;

  if p_min_pb_oz is not null and p_max_pb_oz is not null and p_max_pb_oz < p_min_pb_oz then
    raise exception 'max_pb_oz must not be below min_pb_oz' using errcode = '22023';
  end if;

  perform private.admin_audit('set_division_boundaries', 'divisions', p_division_id,
    jsonb_build_object('before', v_before,
                       'after', jsonb_build_object('min_pb_oz', p_min_pb_oz, 'max_pb_oz', p_max_pb_oz)));

  update divisions
     set min_pb_oz = p_min_pb_oz,
         max_pb_oz = p_max_pb_oz
   where id = p_division_id;
end; $$;

/** Make a season live. `running` is the status the app treats as current —
 * see the single-running index above. */
create or replace function public.open_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select status into v_before from seasons where id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;
  if v_before = 'closed' then
    raise exception 'season % is closed and cannot be reopened', p_season_id using errcode = '22023';
  end if;

  perform private.admin_audit('open_season', 'seasons', p_season_id,
    jsonb_build_object('status_before', v_before, 'status_after', 'running'));

  update seasons set status = 'running' where id = p_season_id;
end; $$;

/** Close a season. Final standings are still computed from the same views —
 * closing stops new catches counting, it does not freeze a table anywhere,
 * because nothing is stored to freeze. */
create or replace function public.close_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select status into v_before from seasons where id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('close_season', 'seasons', p_season_id,
    jsonb_build_object('status_before', v_before));

  update seasons set status = 'closed' where id = p_season_id;
end; $$;

-- ---------------------------------------------------------------------------
-- GRANTS
--
-- anon loses execute outright — nothing here should be reachable without a
-- session. `authenticated` keeps it, because these are gated in the body and
-- a signed-in admin working in the console under their own account is a
-- supported caller; revoking it would leave the is_admin() branch of
-- admin_audit() as dead code and service_role as the only way in, which
-- costs the audit trail its actor_id.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.verify_catch(uuid,text)',
    'public.reject_catch(uuid,text)',
    'public.request_evidence(uuid,text)',
    'public.suspend_member(uuid,text)',
    'public.unsuspend_member(uuid,text)',
    'public.verify_pb(uuid,integer)',
    'public.set_division(uuid,uuid,uuid,text)',
    'public.trigger_password_reset(uuid)',
    'public.update_member_email(uuid,text)',
    'public.merge_venues(uuid,uuid)',
    'public.approve_venue(uuid)',
    'public.create_season(text,date,date,smallint)',
    'public.set_scoring(uuid,numeric,integer,numeric,integer)',
    'public.set_division_boundaries(uuid,integer,integer)',
    'public.open_season(uuid)',
    'public.close_season(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role, authenticated', fn);
  end loop;
end $$;
