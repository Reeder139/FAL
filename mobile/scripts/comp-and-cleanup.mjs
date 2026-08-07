// One-off admin data fix, run once against the live project on 2026-08-07.
// Kept in the repo as the record of what was changed and why, not because it
// is meant to be run again — re-running it is a no-op for the delete and will
// be refused by the overlapping-stint exclusion constraint for the insert.
//
//   1. reeder139 held a legacy `open`-tier stint backdated to season start,
//      created by hand while testing the payment flow. Real free members have
//      no season_entries row at all, so it was an artefact that made him look
//      like a state the app never actually produces. Deleted, leaving only the
//      genuine `competitor` stint the Stripe webhook opened.
//
//   2. LeeAT (essex_carper89) is comped to full membership. A comp is just a
//      `competitor` stint — is_paid_member() and every paid-member check in the
//      app read season_entries, not subscriptions — so no Stripe row is
//      invented for him. Backdated to season start on the owner's instruction,
//      so the fish he caught before being comped count towards his division.
//
// Reads the admin key from docs/key.txt. Run from mobile/:
//   node scripts/comp-and-cleanup.mjs [--apply]
// Without --apply it prints what it would do and changes nothing.

import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const URL = 'https://heplwptnonxfxvobjnri.supabase.co';
const KEY = readFileSync('../docs/key.txt', 'utf8').trim().split(/\s+/).pop();
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const REEDER = 'c0f3c498-4d90-4ced-8b69-068b90de157d';
const LEE = '185604c5-9a25-430f-b570-3d5400e0d317';

const die = (msg, error) => {
  console.error(`\n${msg}`, error?.message ?? error ?? '');
  process.exit(1);
};

const { data: season, error: seasonErr } = await db
  .from('seasons')
  .select('id, name, starts_on')
  .eq('status', 'running')
  .maybeSingle();
if (seasonErr || !season) die('could not read the running season', seasonErr);
console.log(`season: ${season.name} (starts ${season.starts_on})`);

const entries = async (id) =>
  (await db.from('season_entries').select('id, tier, division_id, joined_at, left_at').eq('angler_id', id).eq('season_id', season.id)).data ?? [];

const dump = async (label, id) => {
  const rows = await entries(id);
  console.log(`\n${label}: ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`);
  for (const r of rows) console.log(`  ${r.tier.padEnd(11)} joined ${r.joined_at}  left ${r.left_at ?? '—'}`);
};

await dump('reeder139 before', REEDER);
await dump('LeeAT before', LEE);

// --- 1. drop reeder139's legacy open stint --------------------------------
const legacy = (await entries(REEDER)).filter((r) => r.tier === 'open');
console.log(`\n[1] reeder139: ${legacy.length} legacy open-tier stint(s) to delete`);

// --- 2. comp LeeAT --------------------------------------------------------
// His division comes from his declared PB, the same way apply_membership picks
// one, rather than being hardcoded here.
const { data: profile } = await db.from('profiles').select('declared_pb_oz').eq('id', LEE).maybeSingle();
const { data: divisions } = await db
  .from('divisions')
  .select('id, name, min_pb_oz, max_pb_oz')
  .eq('season_id', season.id)
  .order('rank');
const pb = profile?.declared_pb_oz ?? 0;
const division = (divisions ?? []).find(
  (d) => (d.min_pb_oz === null || pb >= d.min_pb_oz) && (d.max_pb_oz === null || pb <= d.max_pb_oz)
);
if (!division) die(`no division covers a PB of ${pb}oz`);
const joinedAt = `${season.starts_on}T00:00:00+00:00`;
console.log(`[2] LeeAT: PB ${pb}oz -> ${division.name}, competitor stint from ${joinedAt}`);

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to make these changes.');
  process.exit(0);
}

for (const row of legacy) {
  const { error } = await db.from('season_entries').delete().eq('id', row.id);
  if (error) die('failed deleting legacy stint', error);
}
console.log(`\ndeleted ${legacy.length} legacy stint(s)`);

const { error: insErr } = await db.from('season_entries').insert({
  season_id: season.id,
  angler_id: LEE,
  division_id: division.id,
  tier: 'competitor',
  joined_at: joinedAt,
});
if (insErr) die('failed comping LeeAT', insErr);
console.log('comped LeeAT');

await dump('reeder139 after', REEDER);
await dump('LeeAT after', LEE);
