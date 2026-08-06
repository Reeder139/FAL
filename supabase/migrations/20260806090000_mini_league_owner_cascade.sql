-- ===========================================================================
-- Owning a mini league must not make an angler undeletable.
--
-- mini_leagues.owner_id referenced profiles(id) with no ON DELETE action, so
-- NO ACTION applied and deleting the owner's account was refused by the
-- constraint. Found while cleaning up test accounts: the delete came back
-- with a foreign key violation and the account stayed.
--
-- That is a real problem now there are real users. Account deletion has to
-- work — for the member who asks for it, and for us when we remove someone.
--
-- Cascade rather than reassign. mini_league_members already cascades on the
-- same table pair, so a departing owner's league would otherwise survive with
-- its membership intact and nobody able to administer it. A mini league is a
-- private table between people who know each other; when the person who made
-- it goes, the table goes, and anyone who wants it back makes a new one.
-- ===========================================================================

alter table mini_leagues
  drop constraint if exists mini_leagues_owner_id_fkey;

alter table mini_leagues
  add constraint mini_leagues_owner_id_fkey
  foreign key (owner_id) references profiles(id) on delete cascade;
