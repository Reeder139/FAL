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

# Dashboard — build this as the landing page

**Everything below is read-only.** No function calls, no writes, so none of it
needs the `set_config` wrapper. It reads `private.*` views directly, which
works because Retool connects as `postgres` over Postgres rather than through
PostgREST — those views are not reachable from the app at all.

> **This page must never be shared, screenshotted publicly, or shown to a
> member.** Panel 6 is the fraud detection. The single most valuable property
> of those checks is that anglers don't know what trips them; publish the
> thresholds and people optimise around them, which is worse than having no
> checks at all.

Weights are integer ounces everywhere. Format at the edge:
`weight_oz / 16 || ' lb ' || weight_oz % 16 || ' oz'`.

Refresh: panels 1–5 on load and every 5 minutes. Panels 6–11 on demand or
hourly — several scan the whole catch table and there is no reason to pay for
that on every page view.

**An empty dashboard is not a broken dashboard.** As of writing there are four
accounts and zero catches, so most of panels 6–11 correctly return nothing.
Build it anyway — the fraud panels are worth having in place *before* the data
arrives, because the first time you need them is the first time someone has
something to hide. Panel 8 is the exception: every row should read zero
forever, and it should be zero right now.

Before building, paste each query into the Supabase SQL Editor once with
`explain` in front of it. `explain` resolves every table, column, function and
type without executing anything, so a typo surfaces in a second rather than
after the component is wired up.

---

## Panel 1 — Headline strip

One row, six or seven stat tiles across the top. The numbers you glance at
daily.

```sql
with s as (
  select * from seasons where status = 'running' order by starts_on desc limit 1
)
select
  (select count(*) from profiles where suspended_at is null)                     as anglers,
  (select count(*) from profiles where created_at > now() - interval '7 days')   as new_this_week,
  (select count(*) from catches)                                                 as catches_all_time,
  (select count(*) from catches where created_at > now() - interval '7 days')    as catches_this_week,
  (select count(*) from catches where status in ('pending','under_review'))      as awaiting_review,
  (select count(*) from flags where resolved_at is null)                         as open_reports,
  (select count(*) from venues where approved = false and merged_into is null)   as venues_pending,
  (select count(*) from support_threads where status <> 'resolved')              as open_support,
  (select coalesce(max(c.weight_oz), 0) from catches c, s
     where c.status = 'verified'
       and c.caught_at::date between s.starts_on and s.ends_on)                  as biggest_oz,
  (select coalesce(sum(weight_oz), 0) from catches where status = 'verified')    as total_verified_oz;
```

`awaiting_review` and `open_reports` are the two that are actually actionable
— give them a colour when non-zero.

---

## Panel 2 — The signup funnel

The most useful thing on the page during beta. It tells you *where* people
give up, which no single count can.

```sql
select
  count(*)                                                             as registered,
  count(*) filter (where fair_play_accepted_at is not null)             as accepted_code,
  count(*) filter (where declared_pb_oz is not null)                    as declared_pb,
  count(*) filter (where exists (
    select 1 from posts po where po.author_id = p.id and po.deleted_at is null)) as posted_anything,
  count(*) filter (where exists (
    select 1 from catches c where c.angler_id = p.id))                  as logged_a_catch,
  count(*) filter (where exists (
    select 1 from season_entries se where se.angler_id = p.id))         as entered_a_season,
  -- the drop that matters most: signed up, never logged a fish
  count(*) filter (where not exists (
    select 1 from catches c where c.angler_id = p.id))                  as never_logged_a_catch
from profiles p;
```

A tester who accepted the Fair Play Code but never logged a catch got through
onboarding and then stalled. That gap is the product problem worth chasing.

---

## Panel 3 — Activity, last 30 days

Feed this to a line chart with `day` on the x-axis.

```sql
select
  d::date as day,
  (select count(*) from profiles where created_at::date = d::date)                        as signups,
  (select count(*) from catches  where created_at::date = d::date)                        as catches,
  (select count(*) from posts    where created_at::date = d::date and deleted_at is null) as posts,
  (select count(*) from comments where created_at::date = d::date)                        as comments,
  (select count(*) from likes    where created_at::date = d::date)                        as likes
from generate_series(now() - interval '29 days', now(), interval '1 day') d
order by day;
```

---

## Panel 4 — Who is actually using it

Activity means *doing* something, not opening the app — there is no analytics
table, and posting, commenting and liking are the three things that leave a
timestamp.

```sql
with activity as (
  select author_id as angler_id, created_at from posts where deleted_at is null
  union all
  select author_id, created_at from comments
  union all
  select user_id,   created_at from likes
)
select
  count(distinct angler_id) filter (where created_at > now() - interval '1 day')   as active_24h,
  count(distinct angler_id) filter (where created_at > now() - interval '7 days')  as active_7d,
  count(distinct angler_id) filter (where created_at > now() - interval '30 days') as active_30d
from activity;
```

Retention — of anglers who have been here longer than a week, how many are
still logging fish:

```sql
select
  count(*)                                                    as cohort,
  count(*) filter (where last_catch > now() - interval '7 days') as still_logging,
  round(100.0 * count(*) filter (where last_catch > now() - interval '7 days')
        / nullif(count(*), 0), 1)                             as pct_retained
from (
  select p.id, max(c.created_at) as last_catch
  from profiles p
  left join catches c on c.angler_id = p.id
  where p.created_at < now() - interval '7 days'
  group by p.id
) x;
```

---

## Panel 5 — Moderation load

```sql
select
  count(*) filter (where status = 'pending')      as pending,
  count(*) filter (where status = 'under_review') as under_review,
  count(*) filter (where status = 'verified')     as verified,
  count(*) filter (where status = 'rejected')     as rejected,
  min(created_at) filter (where status in ('pending','under_review')) as oldest_unreviewed,
  round(extract(epoch from (
    now() - min(created_at) filter (where status in ('pending','under_review'))
  )) / 3600.0, 1) as oldest_hours_waiting
from catches;
```

How fast you actually respond. `is_system = false` excludes the automatic
review `submit_catch` writes, so this measures *human* turnaround:

```sql
select
  count(*) as reviewed,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from (r.first_review - c.created_at)) / 3600.0)::numeric, 1) as median_hours,
  round(percentile_cont(0.9) within group (
    order by extract(epoch from (r.first_review - c.created_at)) / 3600.0)::numeric, 1) as p90_hours
from catches c
join lateral (
  select min(cr.created_at) as first_review
  from catch_reviews cr
  where cr.catch_id = c.id and cr.is_system = false
) r on r.first_review is not null;
```

What admins have been doing:

```sql
select action, count(*) as times, max(created_at) as last_used,
       count(*) filter (where actor_id is null) as by_automation
from admin_actions
where created_at > now() - interval '30 days'
group by action
order by times desc;
```

---

## Panel 6 — Fraud signals

The reason the console exists. None of these prove anything on their own —
they rank who is worth a look.

### 6a. Terminal-digit distribution

The single best signal in the app, and nearly free. Honest weights spread
evenly across the sixteen ounce values, roughly **6.25% each**. Invented
weights cluster on whole pounds and half pounds, so watch digits **0** and
**8**. Render it as a bar chart — a fraudulent population is visible at a
glance.

```sql
select
  weight_oz % 16 as ounce_digit,
  count(*)       as catches,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct,
  6.25           as expected_pct
from catches
group by 1
order by 1;
```

### 6b. Which anglers are causing it

Two digits out of sixteen should be about **12.5%** of anyone's fish. Sustained
40%+ over a decent sample is worth a conversation.

```sql
select pr.username, o.n as catches, o.ends_zero, o.ends_eight,
       o.pct_round_numbers, 12.5 as expected_pct
from private.ounce_digit_profile o
join profiles pr on pr.id = o.angler_id
where o.n >= 5
order by o.pct_round_numbers desc nulls last, o.n desc;
```

### 6c. Evidence quality

```sql
select
  count(*)                                              as photos,
  count(*) filter (where captured_in_app)               as taken_in_app,
  round(100.0 * count(*) filter (where captured_in_app)
        / nullif(count(*), 0), 1)                       as pct_in_app,
  count(*) filter (where exif_taken_at is null)         as missing_exif_time,
  count(*) filter (where exif_camera_make is null)      as missing_camera,
  count(*) filter (where not public.is_phone_camera_make(exif_camera_make)) as not_a_phone
from post_media;
```

`pct_in_app` is the number to watch over time. In-app capture is the only
evidence that can't be a picture of someone else's fish, so if it trends
towards zero the whole tier system is decorative.

> **Read `not_a_phone` carefully.** `is_phone_camera_make(null)` returns
> **true** — a missing camera make is not treated as suspicious, deliberately,
> because plenty of phones strip it. So `not_a_phone` counts only photos that
> named a camera the list doesn't recognise. Missing metadata is a separate
> column, and `missing_exif_time` is the one `submit_catch` actually flags on.

### 6d. What people are shooting with

Same caveat: the `(none recorded)` row shows `accepted_as_phone = true`, which
is honest about how the check behaves rather than a bug in the query.

```sql
select coalesce(exif_camera_make, '(none recorded)') as camera_make,
       count(*) as photos,
       public.is_phone_camera_make(exif_camera_make) as accepted_as_phone
from post_media
group by 1, 3
order by photos desc;
```

### 6e. Photo taken nowhere near the claimed catch time

`submit_catch` already flags a gap over 7 days. This lists them so you can see
the size of the gap rather than just that one exists.

```sql
select pr.username, c.id as catch_id, c.weight_oz, c.status,
       c.caught_at, m.exif_taken_at,
       round(extract(epoch from (m.exif_taken_at - c.caught_at)) / 86400.0, 1) as gap_days
from catches c
join post_media m on m.post_id = c.post_id and m.exif_taken_at is not null
join profiles pr on pr.id = c.angler_id
where abs(extract(epoch from (m.exif_taken_at - c.caught_at))) > 7 * 86400
order by abs(extract(epoch from (m.exif_taken_at - c.caught_at))) desc;
```

### 6f. Fish far bigger than the water has produced

```sql
select pr.username, v.name as venue, c.weight_oz, c.status,
       round(d.p95_oz)::int as venue_p95_oz, d.max_oz as venue_best_oz, d.n as venue_catches
from catches c
join private.venue_distributions d on d.venue_id = c.venue_id
join venues v   on v.id = c.venue_id
join profiles pr on pr.id = c.angler_id
where d.n >= 5
  and c.weight_oz > d.p95_oz * 1.15
order by c.weight_oz - d.p95_oz desc;
```

### 6g. The same weight, more than once

Genuinely possible, and genuinely what someone does when they are making
numbers up and forget which ones they used.

```sql
select pr.username,
       c.weight_oz,
       c.weight_oz / 16 || ' lb ' || c.weight_oz % 16 || ' oz' as weight,
       count(*) as times,
       min(c.caught_at)::date as first_claimed,
       max(c.caught_at)::date as last_claimed
from catches c
join profiles pr on pr.id = c.angler_id
group by pr.username, c.weight_oz
having count(*) > 1
order by count(*) desc, c.weight_oz desc;
```

### 6h. Fish that land suspiciously just over the qualifying line

```sql
with s as (select * from seasons where status = 'running' order by starts_on desc limit 1)
select pr.username,
       count(*) filter (where c.weight_oz between s.min_qualifying_oz
                                             and s.min_qualifying_oz + 16) as just_over_line,
       count(*) as total_catches
from catches c
cross join s
join profiles pr on pr.id = c.angler_id
group by pr.username
having count(*) filter (where c.weight_oz between s.min_qualifying_oz
                                              and s.min_qualifying_oz + 16) >= 2
order by just_over_line desc;
```

### 6i. Possible duplicate accounts

Postcode district only — the app never stores a full postcode.

```sql
select postcode_district,
       count(*) as accounts,
       string_agg(username, ', ' order by created_at) as anglers
from profiles
where postcode_district is not null
group by postcode_district
having count(*) > 1
order by count(*) desc;
```

> **Not covered here:** the same fish photographed twice from slightly
> different angles. `submit_catch` only rejects an *exact* perceptual-hash
> match, so a re-crop or re-save sails through. Closing that needs Hamming
> distance rather than equality — see `docs/same-fish-recognition-scope.md`.

---

## Panel 7 — League integrity

Division balance. A division with two anglers in it is not a competition:

```sql
with s as (select * from seasons where status = 'running' order by starts_on desc limit 1)
select d.rank, d.name,
       d.min_pb_oz, d.max_pb_oz,
       count(se.id)                                  as anglers,
       count(se.id) filter (where se.tier = 'competitor') as paying,
       count(se.id) filter (where se.prize_eligible)      as prize_eligible
from s
join divisions d on d.season_id = s.id
left join season_entries se on se.division_id = d.id and se.left_at is null
group by d.rank, d.name, d.min_pb_oz, d.max_pb_oz
order by d.rank;
```

Is the scoring curve doing anything? If every division has the same spread,
the PB banding isn't separating anyone:

```sql
select d.rank, d.name,
       count(*)                                       as anglers,
       round(min(lt.total_points), 1)                 as lowest,
       round(percentile_cont(0.5) within group (order by lt.total_points)::numeric, 1) as median,
       round(max(lt.total_points), 1)                 as highest,
       round(avg(lt.counting_fish), 1)                as avg_counting_fish,
       max(lt.best_fish_oz)                           as best_fish_oz
from league_table lt
join divisions d on d.id = lt.division_id
group by d.rank, d.name
order by d.rank;
```

**Verified fish that score nothing.** Every one of these is an angler who
believes they are on the board and isn't:

```sql
with s as (select * from seasons where status = 'running' order by starts_on desc limit 1)
select
  count(*) filter (where c.weight_oz < s.min_qualifying_oz)                as below_qualifying_weight,
  count(*) filter (where c.caught_at::date not between s.starts_on
                                                   and s.ends_on)          as dated_outside_the_season,
  count(*) filter (where not exists (
    select 1 from season_entries se
    where se.angler_id = c.angler_id and se.season_id = s.id))             as angler_not_entered
from catches c
cross join s
where c.status = 'verified';
```

`dated_outside_the_season` is worth an alert. A live bug once put a catch in
2014 off a camera-roll photo's EXIF date; it stayed verified and scored zero
in silence. The app warns about this at entry now, but this is the backstop.

---

## Panel 8 — Things that should never be true

A standing list of integrity checks. Every row should read zero. Anything
non-zero is a bug, not a moderation decision.

```sql
select 'verified catch dated outside every season' as issue, count(*) as n
  from catches c
  where c.status = 'verified'
    and not exists (select 1 from seasons s
                    where c.caught_at::date between s.starts_on and s.ends_on)
union all
select 'catch post with no catch row', count(*)
  from posts p
  where p.kind = 'catch' and p.deleted_at is null
    and not exists (select 1 from catches c where c.post_id = p.id)
union all
select 'catch with no photo at all', count(*)
  from catches c
  where not exists (select 1 from post_media m where m.post_id = c.post_id)
union all
select 'catch dated in the future', count(*)
  from catches where caught_at > now()
union all
select 'profile has not accepted the Fair Play Code', count(*)
  from profiles where fair_play_accepted_at is null
union all
select 'abandoned upload files in storage', count(*)
  from private.orphaned_upload_objects
union all
select 'season entry using another season''s division', count(*)
  from season_entries se
  join divisions d on d.id = se.division_id
  where d.season_id <> se.season_id
union all
select 'venue merged into itself', count(*)
  from venues where merged_into = id
union all
select 'open report on a catch that no longer exists', count(*)
  from flags f
  where f.resolved_at is null
    and not exists (select 1 from catches c where c.id = f.catch_id)
order by n desc, issue;
```

---

## Panel 9 — Venues

```sql
select v.name, v.county, v.water_type, v.approved,
       count(c.id)                      as verified_catches,
       count(distinct c.angler_id)      as anglers,
       round(avg(c.weight_oz) / 16.0, 1) as avg_lb,
       max(c.weight_oz)                 as biggest_oz
from venues v
left join catches c on c.venue_id = v.id and c.status = 'verified'
where v.merged_into is null
group by v.id, v.name, v.county, v.water_type, v.approved
order by verified_catches desc, v.name;
```

Venues only one person has ever fished — either a genuinely private syndicate,
or somewhere invented to host invented fish:

```sql
select v.name, v.approved,
       count(*) as catches,
       min(pr.username) as only_angler,
       max(c.weight_oz) as biggest_oz
from venues v
join catches c   on c.venue_id = v.id
join profiles pr on pr.id = c.angler_id
where v.merged_into is null
group by v.id, v.name, v.approved
having count(distinct c.angler_id) = 1 and count(*) >= 3
order by count(*) desc;
```

---

## Panel 10 — Content and engagement

```sql
select kind,
       count(*)                    as posts,
       sum(like_count)             as likes,
       sum(comment_count)          as comments,
       round(avg(like_count), 1)   as avg_likes,
       count(*) filter (where visibility <> 'public') as non_public
from posts
where deleted_at is null
group by kind
order by posts desc;
```

Best posts — useful for picking what to feature:

```sql
select pr.username, p.kind, left(coalesce(p.caption, ''), 60) as caption,
       p.like_count, p.comment_count,
       c.weight_oz, p.created_at
from posts p
join profiles pr on pr.id = p.author_id
left join catches c on c.post_id = p.id
where p.deleted_at is null
order by p.like_count + p.comment_count * 2 desc
limit 20;
```

Anglers who have never posted — the beta list worth chasing personally:

```sql
select pr.username, pr.display_name, pr.country, pr.created_at,
       pr.follower_count, pr.fair_play_accepted_at is not null as accepted_code
from profiles pr
where not exists (select 1 from posts p where p.author_id = pr.id and p.deleted_at is null)
order by pr.created_at desc;
```

---

## Panel 11 — Storage

```sql
select count(*) as abandoned_files,
       pg_size_pretty(coalesce(sum(size_bytes), 0)) as wasted_space,
       min(created_at) as oldest
from private.orphaned_upload_objects;
```

Should sit at or near zero — the app cleans up after a failed submission
itself. A number that climbs means something is failing quietly. Clear them
with the Storage API call from the purge flow above.

```sql
select round(avg(n), 2) as avg_photos_per_catch,
       max(n)           as most_on_one_catch,
       count(*) filter (where n = 1) as single_photo_catches,
       count(*) filter (where n = 0) as no_photo_catches
from (
  select c.id, count(m.id) as n
  from catches c
  left join post_media m on m.post_id = c.post_id
  group by c.id
) x;
```

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
// comp_membership — grant membership without payment, for beta testers and
// the Atomic Tackle team. Returns what it did, so surface it: the three
// answers are "comped from season start", "comped from today" and "already a
// competitor".
//
// backdate is the decision that matters, not a checkbox to leave alone:
//   false — competitor from now. Fish they have already logged keep counting
//           in the National League, where everyone's best fish count, but
//           score nothing towards their division's £1,500.
//   true  — backdated to the season's start, so everything caught this season
//           counts in the division too. This deliberately grants what the
//           "paid fish only" rule normally prevents, so ask for it on purpose.
//
// A comp is NOT a fake subscription — no Stripe row is created, and none
// should be. It is a `competitor` stint, which is what is_paid_member(), the
// gold ring, mini leagues and the divisional tables all actually read.
export default async function ({ params, user }) {
  const { userId, backdate, reason } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.comp_membership($2::uuid, $3::boolean, $4::text) as outcome from actor`,
    [user.email, userId, !!backdate, reason.trim()]
  )
  return { success: true, outcome: result.data[0]?.outcome }
}
```

```ts
// end_membership — the undo for a comp. Closes the open competitor stint,
// leaving exactly the shape a lapsed subscription leaves.
//
// Safe on a paying member, but it cancels nothing at Stripe: they keep being
// charged and the next webhook reopens a stint. Cancel in Stripe instead, or
// have them use the billing portal.
export default async function ({ params, user }) {
  const { userId, reason } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select public.end_membership($2::uuid, $3::text) as outcome from actor`,
    [user.email, userId, reason.trim()]
  )
  return { success: true, outcome: result.data[0]?.outcome }
}
```

```sql
-- Membership state for the member table. Comped members are the ones with a
-- competitor stint and no subscription behind it — there is no flag for it,
-- and there should not be: a comp is a membership someone granted rather than
-- a different kind of membership.
select
  p.id,
  p.username,
  p.display_name,
  se.tier,
  se.joined_at,
  d.name as division,
  s.status as stripe_status,
  case
    when se.tier is distinct from 'competitor' then 'free'
    when s.angler_id is null                   then 'comped'
    else 'paying'
  end as membership
from profiles p
left join season_entries se
  on se.angler_id = p.id
 and se.season_id = (select id from seasons where status = 'running' limit 1)
 and se.left_at is null
left join divisions d on d.id = se.division_id
left join subscriptions s on s.angler_id = p.id
order by p.created_at desc;
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

## Purging an upload — full, permanent deletion

**Add this to the console.** `delete_post` above hides a post and keeps
everything; `purge_post` destroys it. Both are needed and they are not
interchangeable.

Use `delete_post` when the fish was wrong — a bad weight, a rejected catch, a
disputed capture. The photograph is the evidence you would settle a dispute
with, and it stays.

Use `purge_post` when the upload should never have existed: a test post, an
accidental double, a photo on the wrong account, or a member asking for their
content to be removed.

There is one more reason to reach for it, and it is the common one.
`submit_catch` refuses any photo whose perceptual hash is already in
`post_media`, and `post_media` survives a soft delete — so a deleted post
blocks its own photograph from ever being uploaded again. That is correct
while the evidence is on file, and wrong once you have decided the upload
should not exist. **If a member says "it won't let me re-upload my photo",
purging the old post is the fix.**

### Step 1 — the database side

```ts
// purge_post — permanent. Deletes the post, its catch, every photo record,
// comments, likes, flags and catch reviews, in one transaction.
//
// Returns the storage paths it orphaned. Step 2 removes the files; this
// function deliberately does not, because deleting from storage.objects in
// SQL drops Postgres's record of a file without removing the file itself.
//
// The audit entry records what was destroyed — weight, status, paths, counts
// — so there is still a trail after the rows are gone.
export default async function ({ params, user }) {
  const { postId, reason } = params
  if (!reason?.trim()) throw new Error('A reason is required.')

  // cross join lateral, not a plain comma: it forces the actor CTE to be
  // evaluated before the function, so the operator's email is already set
  // when the audit row is written. With a plain join the planner is free to
  // run them the other way round and the audit loses who did it.
  const result = await carpLeaguesAdmin.query(
    `with actor as (select set_config('app.admin_actor', $1, true))
     select p.*
     from actor
     cross join lateral public.purge_post($2::uuid, $3::text) p`,
    [user.email, postId, reason.trim()]
  )

  // Hand the paths straight to the storage query below.
  return result.rows[0]   // { storage_paths, photos_removed, comments_removed, ... }
}
```

### Step 2 — remove the files

Needs a **REST API resource** in Retool (call it `carpLeaguesStorage`):

- Base URL `https://heplwptnonxfxvobjnri.supabase.co/storage/v1`
- Headers `apikey: <service_role key>` and `Authorization: Bearer <service_role key>`

Then one query, run on success of step 1:

```
DELETE  /object/post-media
Body (JSON):  { "prefixes": {{ purgePost.data.storage_paths }} }
```

Wire the button as: `purgePost` → on success → `purgePostFiles`. If step 2
fails the rows are still gone and the files simply show up in the orphan
sweep below, so a half-finished purge is recoverable rather than silent.

### Step 3 — the orphan sweep

Files in the bucket that nothing references. Two ways in: a submission that
failed after its photos uploaded, and a purge whose step 2 never ran. The app
now clears the first kind itself, so this should normally be empty — a
growing number here means something is failing quietly.

```sql
-- Abandoned upload files, newest first
select storage_path, author_id, created_at,
       round(size_bytes / 1024.0) as size_kb
from private.orphaned_upload_objects
order by created_at desc;
```

Feed `storage_path` from the selected rows into the same
`DELETE /object/post-media` call as step 2. Safe by construction: the view
only lists objects no `post_media` row points at, so it can never contain a
live catch's photo.

> Avatars are excluded — they live at the top level of the angler's folder
> and are not upload artefacts.

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
