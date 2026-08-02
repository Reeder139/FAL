-- ============================================================================
-- Creates the matching profiles row the moment a new auth.users row is
-- inserted, reading username/display_name from raw_user_meta_data (set via
-- supabase.auth.signUp's options.data on the client — see
-- mobile/src/app/(auth)/sign-up.tsx).
--
-- security definer is required: this trigger runs as part of the same
-- transaction as the auth.users insert, outside of any authenticated
-- request context, so it can't rely on the "users create own profile" RLS
-- policy (auth.uid() = id) — there's no settled auth.uid() to check yet at
-- that point. Running as the function owner bypasses RLS entirely, the
-- same pattern already used by public.is_admin() and bump_post_counters().
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
