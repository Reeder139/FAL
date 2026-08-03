-- Lets an angler permanently dismiss a suggested follow from the feed rail
-- rather than seeing them resurface every reload.

create table follow_suggestion_dismissals (
  user_id      uuid not null references profiles(id) on delete cascade,
  suggested_id uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, suggested_id)
);

alter table follow_suggestion_dismissals enable row level security;

create policy "users read own dismissals"
  on follow_suggestion_dismissals for select using (auth.uid() = user_id);
create policy "users write own dismissals"
  on follow_suggestion_dismissals for insert with check (auth.uid() = user_id);
create policy "users remove own dismissals"
  on follow_suggestion_dismissals for delete using (auth.uid() = user_id);
