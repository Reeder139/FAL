-- ===========================================================================
-- Proof that the previous migration did what it claims, and a guard if it
-- is ever undone.
--
-- The hole it closed can only be tested from a signed-in angler's session,
-- which no migration has. What a migration can do is ask Postgres directly
-- whether the `authenticated` role may write each column, which is the same
-- question the exploit turned on.
--
-- This fails the deploy rather than reporting: a re-granted is_admin is a
-- privilege escalation, and the right time to find out is while pushing, not
-- from the audit log afterwards.
--
-- `grant all on tables to authenticated` in a later migration, or a Supabase
-- default-privileges change, would silently reopen it. This is what would
-- catch that.
-- ===========================================================================
do $$
declare
  col       text;
  locked    text[] := array[
    'is_admin', 'pb_verified', 'identity_verified', 'suspended_at',
    'follower_count', 'following_count'
  ];
  writable  text[] := array[
    'avatar_path', 'declared_pb_oz', 'fair_play_accepted_at',
    'display_name', 'bio'
  ];
begin
  foreach col in array locked loop
    if has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') then
      raise exception
        'privilege escalation: authenticated can UPDATE profiles.% — an angler could write it directly', col;
    end if;
  end loop;

  -- The other half of the check. A lockdown that also broke the app's own
  -- writes would be a different bug, not a fix, and would surface as anglers
  -- unable to set an avatar rather than as anything security-shaped.
  foreach col in array writable loop
    if not has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') then
      raise exception
        'over-locked: authenticated cannot UPDATE profiles.%, which the app writes', col;
    end if;
  end loop;

  raise notice 'profiles column privileges verified: % locked, % writable',
    array_length(locked, 1), array_length(writable, 1);
end $$;
