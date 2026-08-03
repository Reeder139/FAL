-- Admin tool for folding duplicate venues together. Anglers add venues
-- freely (see submit_catch's inline venue creation) and near-duplicates are
-- expected ("Linear", "linear fisheries", "Brasenose 2" and
-- "Linear - Bras 2" can all arrive within the same week) — this repoints
-- every catch at the surviving venue and marks the loser as merged. It
-- never deletes a venue row, so catch history and any deep link to the old
-- venue id stay intact.
--
-- If the chosen survivor has itself already been merged into another venue,
-- catches are repointed at the end of that chain instead, so a venue's
-- merged_into never has to be followed more than one hop to find the
-- currently-active venue.
create or replace function public.merge_venue(p_loser_id uuid, p_survivor_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_survivor_id uuid := p_survivor_id;
  v_next_id     uuid;
  v_moved       integer;
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required.';
  end if;

  if p_loser_id is null or p_survivor_id is null then
    raise exception 'Both a loser and a survivor venue id are required.';
  end if;

  if not exists (select 1 from venues where id = p_loser_id) then
    raise exception 'Venue % does not exist.', p_loser_id;
  end if;

  -- Resolve the survivor to the end of any existing merge chain.
  loop
    select merged_into into v_next_id from venues where id = v_survivor_id;
    exit when v_next_id is null;
    v_survivor_id := v_next_id;
  end loop;

  if v_survivor_id = p_loser_id then
    raise exception 'Cannot merge a venue into itself.';
  end if;

  update catches
  set venue_id = v_survivor_id
  where venue_id = p_loser_id;
  get diagnostics v_moved = row_count;

  update venues
  set merged_into = v_survivor_id
  where id = p_loser_id;

  return v_moved;
end;
$$;
