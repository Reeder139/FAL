-- ===========================================================================
-- Country on the profile, and acceptance of the Fair Play Code.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Country.
--
-- ISO 3166-1 alpha-2, not a free-text country name: leagues by country means
-- grouping by this column, and "UK" / "United Kingdom" / "Great Britain" /
-- "england" do not group. Stored as the code, rendered as a name at the edge,
-- the same way weights are stored in ounces and formatted for display.
--
-- Nullable because every existing profile predates the field, and a NOT NULL
-- with a default would silently assert that all of them are British.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists country text;

-- ---------------------------------------------------------------------------
-- Fair Play Code.
--
-- A timestamp rather than a boolean. "Did they agree" is not the question
-- that gets asked when a prize is disputed — "when did they agree, and was
-- that before or after the catch" is. A boolean cannot answer it.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists fair_play_accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Carry country through from sign-up.
--
-- The profile row is created by this trigger, not by the client — it runs
-- outside any authenticated request, so the "users create own profile" RLS
-- policy has no settled auth.uid() to check against. Anything the sign-up
-- form collects has to travel in the user metadata and be copied here.
--
-- fair_play_accepted_at is deliberately NOT set here. It is agreed on a
-- screen after registration, and defaulting it at sign-up would record an
-- agreement that had not happened yet.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, country)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name',
    nullif(new.raw_user_meta_data ->> 'country', '')
  );
  return new;
end;
$$;
