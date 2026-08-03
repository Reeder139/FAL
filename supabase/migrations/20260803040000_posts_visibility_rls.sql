-- The posts select policy only ever allowed visibility = 'public', so
-- followers/league_only posts were invisible to everyone including the
-- people they're meant for (and to their own author). One policy, four
-- ways in: public to everyone, everything to the author, followers-only to
-- actual followers, league_only to anglers sharing a division in the
-- currently running season.

drop policy if exists "public posts readable" on posts;

create policy "posts readable by visibility"
  on posts for select using (
    deleted_at is null
    and (
      visibility = 'public'
      or author_id = auth.uid()
      or (
        visibility = 'followers'
        and exists (
          select 1 from follows f
          where f.follower_id = auth.uid()
            and f.followee_id = posts.author_id
        )
      )
      or (
        visibility = 'league_only'
        and exists (
          select 1
          from season_entries se_me
          join season_entries se_author
            on se_author.season_id = se_me.season_id
           and se_author.division_id = se_me.division_id
          join seasons s on s.id = se_me.season_id
          where se_me.angler_id = auth.uid()
            and se_author.angler_id = posts.author_id
            and s.status = 'running'
            and se_me.left_at is null
            and se_author.left_at is null
        )
      )
    )
  );
