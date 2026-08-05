# Retool admin console — the queries

Hand this to whoever (or whatever) is building the console. It is the
complete set.

## The one rule

**Never write `catches`, `profiles`, `seasons`, `divisions` or `venues`
directly. Always call the function.**

Every admin capability exists as a Postgres function that gates the caller,
writes the audit row, and performs the change as one unit. A raw `UPDATE`
from Retool skips all three — and for `request_evidence` it also skips
opening the support thread, which is the only way the angler learns why their
catch stopped scoring.

Every write follows this exact shape:

```ts
await carpLeaguesAdmin.query(
  `with actor as (select set_config('app.admin_actor', $1, true))
   select public.<function>($2, $3) from actor`,
  [user.email, ...args]
)
```

Three things about that shape matter:

- **One statement, one transaction.** Retool runs each `query()` call in its
  own transaction. Splitting a change across two calls means a failure
  between them leaves the database half-changed — a catch whose status moved
  with no review record. One statement makes that impossible.
- **The CTE forces ordering.** `set_config` must run before the function, and
  a plain `select a(), b()` gives no ordering guarantee. `from actor` does.
- **`true` = transaction-local.** The connection is pooled; a session-level
  setting would leak the last operator's name onto the next person's writes.

Casts (`$1::uuid`) are not optional — Retool sends everything as text.

---

## Catch moderation

Replaces any hand-written status update. `reason` is required: a moderation
decision with no recorded reason is what the audit table exists to prevent.

```ts
type Params = {
  catchId: string
  toStatus: 'verified' | 'rejected' | 'under_review'
  reason: string
}

export default async function ({ params, user }: { params: Params; user: User }) {
  const { catchId, toStatus, reason } = params

  if (!reason?.trim()) throw new Error('A reason is required.')

  const fn = {
    verified: 'verify_catch',
    rejected: 'reject_catch',
    under_review: 'request_evidence',
  }[toStatus]
  if (!fn) throw new Error(`Unsupported status: ${toStatus}`)

  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.${fn}($2::uuid, $3::text) as result from actor`,
    [user.email, catchId, reason.trim()]
  )

  // request_evidence returns the support thread it opened; the other two
  // return void. Handy for linking straight to the thread in the UI.
  return { success: true, threadId: toStatus === 'under_review' ? result.data[0]?.result : null }
}
```

There is deliberately no path back to `pending`. It is the submit-time state,
and a catch sitting in it with a review history saying otherwise is a
contradiction rather than a state anyone needs.

---

## Members

```ts
// suspend / unsuspend
export default async function ({ params, user }) {
  const { userId, reason, suspend } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.${suspend ? 'suspend_member' : 'unsuspend_member'}($2::uuid, $3::text) from actor`,
    [user.email, userId, reason.trim()]
  )
  return { success: true }
}
```

```ts
// verify_pb — writes the weight as well as the flag, because verification
// usually settles what the number actually is. Weight is INTEGER OUNCES.
export default async function ({ params, user }) {
  const { userId, weightOz } = params
  const oz = Number(weightOz)
  if (!Number.isInteger(oz) || oz <= 0) throw new Error('Weight must be a whole number of ounces.')

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.verify_pb($2::uuid, $3::integer) from actor`,
    [user.email, userId, oz]
  )
  return { success: true }
}
```

```ts
// set_division — moves an angler mid-season. Changes who they compete
// against for a cash prize, so the reason is not decorative.
export default async function ({ params, user }) {
  const { userId, seasonId, divisionId, reason } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.set_division($2::uuid, $3::uuid, $4::uuid, $5::text) from actor`,
    [user.email, userId, seasonId, divisionId, reason.trim()]
  )
  return { success: true }
}
```

```ts
// trigger_password_reset — returns a pg_net request id. Fire and forget:
// the audit row records that we asked, not that the email arrived.
export default async function ({ params, user }) {
  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.trigger_password_reset($2::uuid) as request_id from actor`,
    [user.email, params.userId]
  )
  return { success: true, requestId: result.data[0]?.request_id }
}
```

```ts
// update_member_email — skips GoTrue's confirm-both-addresses flow. That is
// the point (the member has lost the old address) so treat it as a last
// resort, not the normal way to change an email.
export default async function ({ params, user }) {
  const { userId, newEmail } = params
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail ?? '')) throw new Error('Enter a valid email address.')

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.update_member_email($2::uuid, $3::text) from actor`,
    [user.email, userId, newEmail.trim()]
  )
  return { success: true }
}
```

---

## Venues

```ts
// merge_venues — NOT merge_venue. Both exist; the plural one is the audited
// version. Returns how many catches moved.
//
// This does not undo. Running it the other way afterwards will not restore
// the split. Put a confirmation modal in front of it.
export default async function ({ params, user }) {
  const { loserId, survivorId } = params
  if (loserId === survivorId) throw new Error('Cannot merge a venue into itself.')

  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.merge_venues($2::uuid, $3::uuid) as catches_moved from actor`,
    [user.email, loserId, survivorId]
  )
  return { success: true, catchesMoved: result.data[0]?.catches_moved }
}
```

```ts
// approve_venue
export default async function ({ params, user }) {
  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.approve_venue($2::uuid) from actor`,
    [user.email, params.venueId]
  )
  return { success: true }
}
```

---

## Seasons

```ts
// create_season
export default async function ({ params, user }) {
  const { name, startsOn, endsOn, countingFish } = params
  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.create_season($2::text, $3::date, $4::date, $5::smallint) as season_id from actor`,
    [user.email, name, startsOn, endsOn, Number(countingFish)]
  )
  return { success: true, seasonId: result.data[0]?.season_id }
}
```

```ts
// set_scoring — re-scores every leaderboard the moment it commits, with no
// backfill, because points are computed and never stored. That is the beta
// tuning loop. The audit row holds the previous values; nothing else does.
export default async function ({ params, user }) {
  const { seasonId, multiplier, offsetOz, exponent, minQualifyingOz } = params

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.set_scoring($2::uuid, $3::numeric, $4::integer, $5::numeric, $6::integer) from actor`,
    [user.email, seasonId, Number(multiplier), Number(offsetOz), Number(exponent), Number(minQualifyingOz)]
  )
  return { success: true }
}
```

```ts
// set_division_boundaries — PB bands, in integer ounces.
export default async function ({ params, user }) {
  const { divisionId, minPbOz, maxPbOz } = params
  const min = minPbOz === '' || minPbOz == null ? null : Number(minPbOz)
  const max = maxPbOz === '' || maxPbOz == null ? null : Number(maxPbOz)

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.set_division_boundaries($2::uuid, $3::integer, $4::integer) from actor`,
    [user.email, divisionId, min, max]
  )
  return { success: true }
}
```

```ts
// open_season / close_season
//
// Only ONE season may be `running`. A unique index enforces it, so opening a
// second fails with a duplicate-key error rather than quietly producing two.
// The app resolves "the current season" by that status.
export default async function ({ params, user }) {
  const { seasonId, open } = params
  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.${open ? 'open_season' : 'close_season'}($2::uuid) from actor`,
    [user.email, seasonId]
  )
  return { success: true }
}
```

---

## Support

The only area with no functions, because nothing here touches standings or
money. Direct table writes are correct, and they are not audited by design.

```sql
-- Inbox
select t.id, t.subject, t.status, t.assigned_to, t.opened_by_staff, t.updated_at,
       p.username, p.id as member_id,
       (select count(*) from support_messages m where m.thread_id = t.id) as message_count
from support_threads t
join profiles p on p.id = t.member_id
where ({{ showResolved.value }} or t.status <> 'resolved')
order by t.updated_at desc;
```

```sql
-- Messages on the selected thread. internal_note = staff-only; RLS keeps
-- those out of the member's app, so they are safe to show here.
select m.id, m.body, m.internal_note, m.created_at, p.username as author
from support_messages m
left join profiles p on p.id = m.author_id
where m.thread_id = {{ threadTable.selectedRow.id }}::uuid
order by m.created_at;
```

```sql
-- Reply. author_id null = "the FAL team" in the member's view; the operator
-- is identified by the Retool session, not by the row.
insert into support_messages (thread_id, author_id, body, internal_note)
values ({{ threadTable.selectedRow.id }}::uuid, null,
        {{ replyInput.value }}::text, {{ internalToggle.value }}::boolean);
```

```sql
-- Status / assignment
update support_threads
   set status = {{ statusSelect.value }}::text,
       assigned_to = {{ assigneeSelect.value }}::uuid,
       updated_at = now()
 where id = {{ threadTable.selectedRow.id }}::uuid;
```

---

## Posts

```ts
// delete_post — soft delete. The row and its media stay, because a catch
// photo is evidence and a later dispute is settled with it.
//
// If the post carries a catch, this also rejects the catch through
// catch_reviews, so it drops out of scored_catches. Setting deleted_at alone
// would hide the post and leave the points on the board — scored_catches
// never joins posts.
//
// Anglers can delete their own non-catch posts themselves. They cannot
// delete a catch post; that is this function's job.
export default async function ({ params, user }) {
  const { postId, reason } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.delete_post($2::uuid, $3::text) from actor`,
    [user.email, postId, reason.trim()]
  )
  return { success: true }
}
```

```sql
-- Deleted posts (they stay in the table; nothing is destroyed)
select p.id, p.kind, p.caption, p.deleted_at, pr.username,
       c.id as catch_id, c.weight_oz, c.status as catch_status
from posts p
join profiles pr on pr.id = p.author_id
left join catches c on c.post_id = p.id
where p.deleted_at is not null
order by p.deleted_at desc;
```

There is deliberately no `restore_post`. Undeleting would have to decide what
to do about the catch it rejected on the way down, and "put the points back"
is a standings change that should be an explicit `verify_catch` with its own
reason, not a side effect of undoing something.

---

## Reported fish

Members report a catch from the feed. `flags` is readable by admins only, so
this queue is invisible to everyone else — including the angler being
reported, who is never told who raised it.

One open report per person per catch, enforced by a partial unique index.
Without it the loudest reporter sets the queue order: report the same fish
five times and it climbs above a catch five different people are worried
about, which is backwards. `report_count` below is therefore distinct
people, which is what should drive priority.

```sql
-- The queue. Everything from the review view, plus who reported it and why.
select
  d.*,
  f.report_count,
  f.first_reported_at,
  f.reasons
from private.catch_review_detail d
join (
  select catch_id,
         count(*)                                as report_count,
         min(created_at)                         as first_reported_at,
         jsonb_agg(jsonb_build_object(
           'reason', reason, 'at', created_at
         ) order by created_at desc)             as reasons
    from flags
   where resolved_at is null
   group by catch_id
) f on f.catch_id = d.catch_id
order by f.report_count desc, f.first_reported_at asc;
```

Sorted by how many separate people reported it, then by oldest first — so a
catch three people flagged outranks a fresher single report, and nothing
sits at the bottom forever.

`reasons` carries the raw text. The app prefixes each with a fixed label
(`This isn't their fish`, `This photo has been used before`, `The weight
looks wrong`, `Wrong venue`, `Something else`) followed by the reporter's
note, so the queue is scannable before anyone opens a photo.

**Do not show `reporter_id` in the UI.** Reports are private, and a screen
that displays who filed one will eventually be screenshotted.

```ts
// Close every open report on a catch. Per catch, not per flag: a reviewer
// looks at one fish and decides, and everything filed about it is settled by
// that decision. Returns how many were closed.
//
// This does NOT change the catch's status. Dismissing a report and rejecting
// a fish are different decisions — call verify_catch, reject_catch or
// request_evidence alongside it as the review warrants.
export default async function ({ params, user }) {
  const { catchId, note } = params
  if (!note?.trim()) throw new Error('A note is required.')

  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.resolve_catch_flags($2::uuid, $3::text) as closed from actor`,
    [user.email, catchId, note.trim()]
  )
  return { success: true, closed: result.data[0]?.closed }
}
```

The natural screen is the review queue with a "Reported" filter, rather than
a second page: the reviewer needs the same photos, EXIF, hash matches and
digit profile either way, and the report is one more signal beside them
rather than a different kind of work.

---

## Read queries

```sql
-- Review queue. Everything a reviewer needs, in one row — the angler, every
-- photo including evidence-only, EXIF, hash matches, the venue's weight
-- distribution with this claim's percentile, the ounce digit profile, full
-- history and flags.
--
-- Requires the direct Postgres resource. `private` is not exposed through
-- the Data API, so Retool's Supabase integration cannot see this at all.
select * from private.catch_review_detail
where status in ('pending','under_review')
order by open_flag_count desc, submitted_at asc;
```

Reading that view:

| Field | What it tells you |
|---|---|
| `in_app_photo_count` | The single most important one. Tier 2+ evidence requires photos taken in-app. Zero on a big claim is the flag. |
| `venue_percentile` | Where this weight sits in that water's own history. 40lb means different things on different lakes. |
| `pct_round_numbers` + `angler_catch_count` | Honest weights spread 0–15 across `weight_oz % 16`. Invented ones cluster on 0 and 8. Meaningless below ~10 fish — always read it with the count. |
| `oz_over_declared_pb` | A big positive is the ordinary shape of both a genuine career best and a made-up number. |
| `hash_matches` | The same photo submitted twice. Non-empty is close to conclusive. |

```sql
-- Audit log
select a.created_at, a.action, a.target_table, a.target_id, a.detail,
       coalesce(p.username, a.detail->>'operator', '—') as who
from admin_actions a
left join profiles p on p.id = a.actor_id
order by a.created_at desc
limit 200;
```

```sql
-- Member lookup
select p.id, p.username, p.display_name, p.declared_pb_oz, p.pb_verified,
       p.identity_verified, p.suspended_at, p.created_at,
       se.tier, se.division_id, d.name as division
from profiles p
left join season_entries se on se.angler_id = p.id
left join divisions d on d.id = se.division_id
where p.username ilike '%' || {{ memberSearch.value }} || '%'
order by p.username
limit 50;
```

```sql
-- Venues needing attention
select v.id, v.name, v.county, v.water_type, v.approved, v.merged_into,
       (select count(*) from catches c where c.venue_id = v.id) as catches
from venues v
where not v.approved or v.merged_into is not null
order by v.approved, catches desc;
```

---

## Things that will catch you out

- **Weights are integer ounces everywhere.** `32 lb 4 oz` is `516`. Never
  send a float, never send pounds. Display conversion happens at the edge:
  `Math.floor(oz/16) + 'lb ' + (oz%16) + 'oz'`.
- **`admin_actions` cannot be edited or deleted.** A trigger refuses both,
  even for `service_role`. A test click leaves a permanent row.
- **`merge_venues`, not `merge_venue`.** Both exist; the singular one is
  older and unaudited.
- **A new table created in `public` gets RLS enabled automatically** by an
  event trigger, with no policies — so it will read as empty from the app
  until policies are written. This looks exactly like a bug the first time.
- **Check the audit row after the first write of each type.** If `detail`
  has no `operator` key, the `set_config` is not landing and every action is
  being recorded anonymously.
