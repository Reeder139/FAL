# Same-fish recognition — scope

## The thing to get right before any of it

**Detecting the same fish is not the same as detecting fraud.**

Named fish are the sport. `catches.fish_name` and `seasons.named_fish_multiplier`
exist because famous individual carp get caught repeatedly, by different
anglers, and that is worth *more* points, not fewer. A system that flags
"same fish" as a problem would fire hardest on exactly the catches the game
is built around, and a reviewer would learn to ignore it within a week.

So the output is not "these are the same fish". It is **"these are the same
fish in a shape that does not make sense"**:

| Pattern | Reading |
|---|---|
| Same fish, same angler, days apart, same water | Plausible. Big fish get caught twice. Low signal. |
| Same fish, **different anglers**, overlapping dates | One of them did not catch it. |
| Same fish, **different venues** | A fish did not move lakes. Someone reused a photo. |
| Same fish, **materially different weight** | One weight is wrong, and weight is the score. |
| Same fish, same angler, **same session** | Double-counted, deliberately or not. |

The model supplies the "same fish" edge. The **rules above supply the flag**,
and they are cheap SQL once the edge exists. Getting this ordering wrong is
the main way this project fails.

---

## Why the existing hash cannot be extended to do it

`perceptual_hash` is a dHash: shrink the image, compare each pixel to its
right-hand neighbour, emit the bits. It identifies **an image file**, not an
animal. It survives re-compression and nothing else — not a crop, not a
rotation, not a different photograph of the same fish thirty seconds later.

It is also currently compared with **exact equality** in both places it is
used, so even a near-identical file slips through.

That is not a flaw to fix in the hash. Same-fish matching is a different
problem needing a different representation.

---

## What the pipeline has to be

**1. Find the fish in the photo.**
Non-negotiable, and the step most likely to be skipped. A general image
embedding of a whole catch photo clusters on *scene* — man, mat, unhooking
cradle, bivvy, grass, night flash. Two different fish held by the same angler
on the same mat will look more alike than the same fish photographed at two
different lakes. Without a detection/segmentation step that crops to the fish,
the system measures the background and looks like it works until it is
audited.

**2. Embed the fish crop.**
A vector per fish, distance ≈ visual similarity.

**3. Store and search.**
`pgvector` in the existing Postgres, with an index for approximate
nearest-neighbour. Not currently installed.

**4. Apply the pattern rules.** SQL over the candidate edges.

**5. Surface it.** Add to `private.catch_review_detail` alongside
`hash_matches`, and — only once calibrated — write to `flags` or call
`request_evidence()`.

Inference cannot run inside `submit_catch`. That RPC is on the angler's
critical path and already does real work. This is asynchronous: a queue, an
Edge Function, or a scheduled sweep.

---

## The hard parts, worst first

**1. Common carp are nearly featureless.**
Mirror carp are the ideal case — irregular scale patterns that genuinely work
like fingerprints, and the reason this technique is established in carp
fisheries at all. **Common carp are fully and regularly scaled** and offer far
less to lock onto: mouth and fin damage, occasional scars. All 217 catches in
the database are `species = 'carp'` with no mirror/common distinction
recorded, so today we cannot even measure how much of the population is the
easy case. Expect accuracy to differ sharply between the two, and expect the
honest answer on commons to be "this does not work reliably".

**2. Left flank ≠ right flank.**
A fish photographed on its left side and the same fish on its right side are,
to any visual model, two different patterns. Roughly half of all genuine
same-fish pairs are therefore unmatchable in principle. This halves recall
before anything else goes wrong, and no amount of model quality fixes it.

**3. There is no data to calibrate on.**
The database holds **9 photos**, all on one angler's catches, **none captured
in-app**. Against 217 catches. There is no corpus, no known same-fish pair,
and therefore no way to choose a similarity threshold or to state a false
positive rate. Any threshold picked today would be a guess presented as a
number.

This is the binding constraint. It is not a reason to abandon the idea; it is
the reason the first phase must be about accumulating data rather than
shipping a detector.

**4. Photo conditions vary enormously.**
Day and night, flash, wet and dry flanks, fish held at different angles and
distances, motion blur. All of it moves an embedding.

**5. False accusations are expensive.**
This flags a member as a probable cheat. A false positive on a genuine
career-best fish is worse than several missed frauds — it drives away exactly
the anglers the league needs. The bar for auto-flagging is much higher than
for surfacing to a reviewer.

---

## Phasing

### Phase 0 — cheap wins that need no model *(~1 day)*

Do these regardless of whether the rest ever happens.

- Switch hash comparison from exact equality to **Hamming distance**, so
  crops, re-saves and minor edits of the same file are caught. Currently a
  one-pixel change defeats it.
- Record **mirror vs common** on submission. Costs one enum on the form and
  determines whether same-fish matching is even viable per catch. Without it,
  phase 2 cannot be evaluated.
- Prompt for a **left-flank photo** as the convention in the in-app capture
  flow. Free now, and it is the difference between a usable corpus and a
  coin-flip on which side was shot.

### Phase 1 — accumulate a corpus *(passive, 1–3 months)*

- Get in-app capture actually happening. **Zero of nine photos** are
  `captured_in_app` today, which means the evidence tier that the whole trust
  model rests on is not being exercised either.
- Store crops as they arrive.
- Use `fish_name` as **weak labels** — 30 catches already carry one. Two
  catches naming the same fish are a probable positive pair. Not clean
  ground truth, but it is free and it is real.
- Admin review decisions become labels too, once the console is in use.

**Exit criterion, and it should be explicit:** a few hundred fish photos with
at least a few dozen known same-fish pairs. Below that, any measured accuracy
is noise.

### Phase 2 — build and measure *(~1–2 weeks, once phase 1 has data)*

- Fish detection/segmentation, then embeddings from an off-the-shelf vision
  model. No fine-tuning at first — measure what a general model gives before
  paying for a specialised one.
- `pgvector` + ANN index.
- Backfill the corpus, then **measure precision and recall on the weak
  labels, separately for mirrors and commons.**
- Decision point: if precision on mirrors is not usable, stop. Say so and
  stop, rather than shipping something that produces plausible-looking noise.

### Phase 3 — surface, then act *(~1 week)*

- Add `fish_matches` to `catch_review_detail`, next to `hash_matches`.
- **Reviewer-visible only, for a period.** Watch how often the reviewer agrees.
- Only then wire the pattern rules to `flags` or `request_evidence()`, and
  even then start with the unambiguous cases: same fish, different anglers, or
  same fish at different venues.

---

## What it costs to run

Embeddings are cheap — one inference per catch photo, a few hundred a month
at beta scale, negligible either self-hosted or through an API. `pgvector`
adds no licence cost. The expense is entirely build and calibration time, not
runtime.

---

## Decisions needed from you

1. **Do we ask anglers for a left-flank photo?** A small friction on every
   submission that roughly doubles usable recall. My view: yes, and frame it
   as the fish's ID photo rather than as an anti-fraud measure.
2. **Mirror/common on the form?** Cheap, and it decides whether this is
   measurable at all.
3. **Auto-flag, or reviewer-only?** My view: reviewer-only until there is a
   measured false positive rate, and permanently reviewer-only for commons.
4. **Self-hosted model or API?** API is faster to try; self-hosted avoids
   sending member photos to a third party, which is worth thinking about
   before it becomes a privacy question rather than a technical one.

---

## Recommendation

**Do Phase 0 now. Do not start Phase 2 yet.**

The idea is sound and it targets the fraud the current checks genuinely
cannot see — a real fish, photographed properly, claimed twice or passed
between accounts. EXIF and in-app capture catch lazy fraud; this catches the
careful kind.

But with 9 photos and no labelled pairs, anything built this month would be
uncalibrated by construction, and an uncalibrated fraud detector is worse than
none: it produces confident-looking output nobody can trust, and it takes a
reviewer's attention away from the signals that do work.

The three Phase 0 items cost about a day between them, improve matters
immediately, and are the difference between having a corpus in three months
and not having one.
