-- ===========================================================================
-- Two more places where deleting a user was impossible.
--
-- 20260805100000 gave admin_actions.actor_id ON DELETE SET NULL so the audit
-- trail would stop blocking user deletion. It did not work, and the reason is
-- worth writing down: SET NULL is an UPDATE, and the append-only trigger
-- refuses every UPDATE. The guard blocked the fix for the problem the guard
-- created.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Let the trigger through for exactly one transition.
--
-- actor_id going from set to null, with every other column identical — which
-- is precisely what the foreign key does when the actor is deleted, and
-- nothing else. Rewriting an action, a target or a detail is still refused,
-- as is deleting the row outright.
--
-- Written as an explicit comparison of every column rather than "if only
-- actor_id changed", so a column added later is not silently editable: a new
-- column would not appear in this list, the comparison would not match, and
-- the update would be refused. Failing closed is the right default for an
-- audit table.
-- ---------------------------------------------------------------------------
create or replace function private.admin_actions_are_append_only()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null
     and new.actor_id is null
     and new.id           =            old.id
     and new.action       =            old.action
     and new.target_table =            old.target_table
     and new.target_id    is not distinct from old.target_id
     and new.detail       =            old.detail
     and new.created_at   =            old.created_at
  then
    -- The actor's account has been deleted. The record of what they did
    -- stays; only the pointer to a row that no longer exists goes. The
    -- username was copied into `detail` when the row was written, so the
    -- attribution survives this.
    return new;
  end if;

  raise exception 'admin_actions is append-only; % is not permitted', tg_op;
end; $$;

-- ---------------------------------------------------------------------------
-- 2. support_messages.author_id likewise.
--
-- A message is a record of something said. It should not keep an account
-- alive, and deleting the account should not delete the conversation the rest
-- of the thread depends on to make sense.
--
-- Null already means "the FAL team" in the member-facing view, which is not
-- quite right for a departed member's own message — but those live on the
-- member's own thread, and that cascades away with them, so in practice this
-- only fires for messages on someone else's thread, which a member cannot
-- write.
-- ---------------------------------------------------------------------------
alter table support_messages
  drop constraint if exists support_messages_author_id_fkey;

alter table support_messages
  add constraint support_messages_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;
