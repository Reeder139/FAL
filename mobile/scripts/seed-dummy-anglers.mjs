// One-off dev seeding script — creates N dummy "paid league" accounts
// (real auth.users rows, since profiles.id is FK'd to auth.users) spread
// across all three current-season divisions, each with a handful of
// verified catches, so League/Leaders/Feed have real volume to render
// against instead of a single test account.
//
// Never commit a service_role key. Pass it (and the project URL) as env
// vars at invocation time only:
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
//     node scripts/seed-dummy-anglers.mjs [count]
//
// Dummy accounts are all tagged with the `dummy` username/email prefix so
// they can be found and bulk-deleted later without touching real users:
//   select id from auth.users where email like 'dummy%@fal-test.dev';
// (deleting via supabase.auth.admin.deleteUser cascades through profiles
// -> posts -> catches -> season_entries automatically).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COUNT = parseInt(process.argv[2] ?? '20', 10);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VENUE_NAMES = [
  'Bluebell Wood Lake',
  'Yateley Complex',
  'Linear Fisheries',
  'Wraysbury',
  'Ephels Fisheries',
];

const FIRST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Chris', 'Ryan', 'Dan', 'Josh', 'Ben', 'Luke', 'Matt',
  'Tom', 'Jack', 'Will', 'Harry', 'George', 'Owen', 'Liam', 'Sean', 'Nathan', 'Craig',
];
const LAST_INITIALS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

/** Realistic weight_oz: an even ounce-digit spread rather than the 0/8
 * clustering CLAUDE.md flags as a fraud signal — matches the honest-weight
 * distribution the app itself expects, even though this is just seed data. */
function randomWeightOz(minLb, maxLb) {
  const lb = randInt(minLb, maxLb);
  const oz = randInt(0, 15);
  return lb * 16 + oz;
}

function randomDateBetween(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString();
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: season, error: seasonErr } = await admin
    .from('seasons')
    .select('id, name, starts_on, ends_on, counting_fish')
    .in('status', ['open', 'running'])
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seasonErr) throw seasonErr;
  if (!season) throw new Error('No open/running season found for today — nothing to seed against.');

  const { data: divisions, error: divErr } = await admin
    .from('divisions')
    .select('id, name, rank, min_pb_oz, max_pb_oz')
    .eq('season_id', season.id)
    .order('rank');
  if (divErr) throw divErr;
  if (!divisions?.length) throw new Error('Season has no divisions.');

  const { data: venues, error: venueErr } = await admin
    .from('venues')
    .select('id, name')
    .in('name', VENUE_NAMES);
  if (venueErr) throw venueErr;
  const venueIds = (venues ?? []).map((v) => v.id);

  console.log(`Seeding ${COUNT} dummy anglers into "${season.name}" (${divisions.length} divisions)...`);

  // Distribute PBs round-robin across divisions so every division gets
  // roughly equal coverage, with the actual weight randomized within range.
  const created = [];
  for (let i = 0; i < COUNT; i++) {
    const division = divisions[i % divisions.length];
    const minLb = division.min_pb_oz !== null ? Math.ceil(division.min_pb_oz / 16) : 15;
    const maxLb = division.max_pb_oz !== null ? Math.floor(division.max_pb_oz / 16) : 55;
    const pbOz = randomWeightOz(minLb, maxLb);

    const n = String(i + 1).padStart(2, '0');
    const username = `dummy${n}`;
    const displayName = `${pick(FIRST_NAMES)} ${pick(LAST_INITIALS).toUpperCase()}`;
    const email = `dummy${n}@fal-test.dev`;

    const { data: created_user, error: userErr } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (userErr) {
      console.error(`  [${username}] user create failed:`, userErr.message);
      continue;
    }
    const userId = created_user.user.id;

    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        declared_pb_oz: pbOz,
        identity_verified: Math.random() < 0.3,
      })
      .eq('id', userId);
    if (profileErr) console.error(`  [${username}] profile update failed:`, profileErr.message);

    const { error: entryErr } = await admin.from('season_entries').insert({
      season_id: season.id,
      angler_id: userId,
      division_id: division.id,
      tier: 'competitor',
      joined_at: season.starts_on,
    });
    if (entryErr) console.error(`  [${username}] season_entries insert failed:`, entryErr.message);

    const catchCount = randInt(1, 6);
    for (let c = 0; c < catchCount; c++) {
      // Most catches sit under the declared PB; occasionally let one beat
      // it slightly to exercise the "current PB grows from catches" path.
      const isBreaker = c === catchCount - 1 && Math.random() < 0.2;
      const weightOz = isBreaker
        ? pbOz + randInt(1, 5 * 16)
        : Math.max(minLb * 16, Math.round(pbOz * (0.6 + Math.random() * 0.35)));
      const caughtAt = randomDateBetween(season.starts_on, today);
      const namedFish = Math.random() < 0.15;

      const { data: post, error: postErr } = await admin
        .from('posts')
        .insert({
          author_id: userId,
          kind: 'catch',
          caption: 'Logged during test-data seeding.',
          visibility: 'public',
        })
        .select('id')
        .single();
      if (postErr) {
        console.error(`  [${username}] post insert failed:`, postErr.message);
        continue;
      }

      const { error: catchErr } = await admin.from('catches').insert({
        post_id: post.id,
        angler_id: userId,
        weight_oz: weightOz,
        species: 'carp',
        fish_name: namedFish ? 'The Old Warrior' : null,
        caught_at: caughtAt,
        venue_id: venueIds.length > 0 ? pick(venueIds) : null,
        evidence_tier: 2,
        status: 'verified',
        is_pb: isBreaker,
      });
      if (catchErr) console.error(`  [${username}] catch insert failed:`, catchErr.message);
    }

    created.push({ username, displayName, division: division.name, pbOz, catchCount });
    console.log(`  [${username}] ${displayName} — ${division.name}, PB ${pbOz}oz, ${catchCount} catches`);
  }

  console.log(`\nDone. Created ${created.length}/${COUNT} dummy anglers.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
