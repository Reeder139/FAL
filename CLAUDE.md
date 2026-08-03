# FAL — Fantasy Angling Leagues

A mobile-first fantasy carp fishing league app. Anglers log catches, follow a social
feed, and compete in seasonal leaderboards scored from real fish weights.

## Stack

- **Client**: Expo (React Native)
- **Backend**: Supabase (Postgres, Auth, Storage, RLS, Data API)
- [fal_schema_v2.sql](fal_schema_v2.sql) is the cumulative current-state snapshot —
  what a fresh Supabase project should look like after everything in
  `supabase/migrations/` has run. `supabase/migrations/` is the actual source of
  truth for how the live database got there; keep both in sync when you change
  either.

## Schema changes always go through migrations

**Never make schema changes directly in the Supabase dashboard SQL Editor.** Every
change — tables, columns, constraints, views, storage buckets, policies — goes in a
new file under `supabase/migrations/`, applied with `supabase db push`. This
happened once already: the `post-media` storage bucket and its RLS policies were
created by hand in the dashboard and had to be reverse-engineered back into a
migration afterward. `fal_schema_v2.sql` should be updated to match in the same
change, since it's meant to reflect the current cumulative schema, not just v2's
original state.

## UI: design tokens only, never hardcoded values

[`mobile/src/constants/theme.ts`](mobile/src/constants/theme.ts) is the single source
of truth for color, type, spacing, radius, and shadow — see
[`mobile/DESIGN.md`](mobile/DESIGN.md) for the full extracted design system and visual
reference. **Every screen and component must build its styles from `theme.ts`'s
exports (`Colors`, `Typography`, `Spacing`, `Radii`, `Shadows`, `ButtonVariants`,
`InputStyle`). No hardcoded hex colors, font sizes, or spacing numbers anywhere in
screen code.** If a value you need isn't in `theme.ts`, add it there (and document it
in DESIGN.md) rather than inlining it — that's what keeps light/dark mode and the
brand's visual consistency from silently drifting screen by screen.

## Every tab screen uses `<TabScreen>` — never rebuild the shell by hand

[`mobile/src/components/tab-screen.tsx`](mobile/src/components/tab-screen.tsx) is the
shared shell (background, safe area, and the "Your Current League Position" strip)
for every screen reachable from the bottom tab bar. **Any new screen under
`(tabs)/` — whether a top-level tab or nested in its own stack (see
`(tabs)/league/` for the pattern: a division drill-down page that still keeps the
tab bar and Catch FAB visible) — wraps its content in `<TabScreen>` instead of
reimplementing the outer `View`/`SafeAreaView` pair.** This is what makes "every
page keeps both bars" a property of the template rather than something to
remember per screen: change `TabScreen` (or `LeagueStrip`) once and every page
picks it up. Screens outside the tabs entirely (auth, onboarding, `log-catch`'s
modal) don't use it — there's no tab bar to keep visible there by construction.

## Core model: two layers, deliberately separated

- **Posts** are the social layer (the Instagram part). Every feed item is a post —
  `kind` is `catch`, `photo`, `video`, or `announcement`. Posts carry captions,
  visibility, likes, and comments.
- **Catches** are the game layer. A `catches` row is a 1:1 *optional* extension of a
  post (`catches.post_id` is unique + not null) — only `kind = 'catch'` posts have one.
  This is what feeds scoring, leaderboards, and fraud review. Not every post is a
  catch, but every catch is a post.

Keep this separation in mind when building features: social interactions (likes,
comments, follows) operate on `posts`; competitive logic (weight, evidence, status,
scoring) operates on `catches`.

## Weights: integer ounces, always

`weight_oz` is an **integer**, never a float, never pounds. `32 lb 4 oz` is stored as
`516`. This is deliberate:

- Exact arithmetic everywhere, no float drift.
- Terminal-digit fraud analysis is just `weight_oz % 16` — honest weights spread
  0–15 across that range; invented weights cluster on 0 and 8 (see
  `private.ounce_digit_profile`).

Never introduce a pounds/float representation of weight anywhere in the app or
schema. Convert for display only, at the edge.

## Scoring: computed, never stored

Points are **never persisted** — they're computed on read by `fal_points()` and the
`scored_catches` / `league_table` views, from per-season tunable columns on
`seasons` (`scoring_multiplier`, `scoring_offset_oz`, `scoring_exponent`,
`min_qualifying_oz`, plus `pb_bonus_multiplier` and `named_fish_multiplier`).

This means changing those numbers on a `seasons` row instantly re-scores every
leaderboard with no backfill or migration. That's the whole point — it's the beta
tuning loop. **Do not add a `points` column to `catches` or cache scores anywhere.**
If scoring needs to change, change the season's parameters or `fal_points()`, not
individual catch rows.

`scored_catches` only ranks/qualifies fish that are `status = 'verified'` and fall
inside the season's date range; `league_table` then sums each angler's top
`counting_fish` scores per division. A catch's `rank_in_season` there is what decides
whether it's a counting fish.

## Evidence and fraud prevention

Trust is tiered and structural, not just policy:

- `post_media.captured_in_app` is the single most important anti-fraud field —
  tier 2+ evidence requires photos taken in-app (`capture_token`), not uploaded from
  the camera roll.
- `catches.evidence_tier` (1–3) and `status` (`pending` / `verified` /
  `under_review` / `rejected`) gate whether a catch counts.
- Anglers can **insert** catches but there is deliberately no update/delete policy —
  once submitted, a weight is evidence. Corrections go through `catch_reviews`
  (append-only, admin-written via service_role) instead of mutating the row.
- `private.venue_distributions` and `private.ounce_digit_profile` are fraud-analysis
  views in the `private` schema, which is never exposed via the Data API. Anglers
  must never see what trips these checks, or they'll optimize around it — do not
  expose this schema or its logic to the client, ever.
- `profiles.pb_verified`: unverified PBs seed into Division 1 (the hardest). Proving
  a *low* PB is what buys an easier division — this is intentional anti-sandbagging,
  not a bug.

## Competition structure

`seasons` → `divisions` (ranked, 1 = hardest, sized by PB range) → `season_entries`
(one per angler per season, pins them to a division). `mini_leagues` are
user-created sub-groups (join-code based) layered on top of a season, independent of
division.

## Views vs tables

All views use `security_invoker = on` so they respect the querying user's RLS
instead of running as the view's creator — treat this as required, not optional,
for any new view. Without it, a view is a hole straight through the RLS policies
below it.

- `feed_items` — the social feed, joining posts + profile + optional catch/venue.
- `scored_catches` — per-catch points and in-season rank, verified catches only.
- `league_table` — per-angler totals and position, built from each angler's
  counting fish.

## RLS

Every table has RLS enabled — no exceptions. Notable patterns:

- Most tables are broadly readable (`using (true)`) with inserts/updates
  restricted to `auth.uid()` matching the owning column.
- `catches` has no update/delete policy for anglers (see Evidence above).
- `flags` and `catch_reviews` are admin-gated via `public.is_admin()`, a
  `security definer` helper that avoids RLS recursion on `profiles`.
- The `service_role` key bypasses RLS entirely — that's how the admin console and
  edge functions operate. It must never ship inside the Expo app.

## Known gaps (see schema comments)

- The "one counting fish per 24 hours" rule is not yet enforced anywhere — it's
  meant to filter in `scored_catches`, not at submission time, so anglers can still
  post every fish they catch. Not implemented yet.
