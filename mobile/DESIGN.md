# FAL Design System

Extracted from the approved app mockups. This is the visual reference for
[`src/constants/theme.ts`](src/constants/theme.ts) — every value documented
here is exported from that file. Screens must consume the exports, never
these hex codes directly.

The app is dark-first (14 of 16 reference screens are dark mode); a light
variant exists, derived from the two light mockups (Monthly Big Fish Comp,
My Submissions), which use a deeper ocean-blue accent instead of cyan since
bright cyan reads poorly on a white background.

## Color

### Dark mode (default)

| Name | Hex | Used for |
|---|---|---|
| Midnight | `#070D14` | App background |
| Deep Water | `#0C141F` | Header/background alt |
| Surface | `#121C2B` | Card backgrounds |
| Surface Elevated | `#1B2839` | Selected/elevated card state |
| Border | `#293A4F` | Card hairline strokes |
| Muted | `#4A5C73` | Disabled icons, strong borders |
| Pure White | `#FFFFFF` | Primary text |
| Mist | `#A9B8C9` | Secondary text |
| Slate Muted | `#6E7F94` | Tertiary/meta text |
| **Angler Cyan** | `#22D3EE` | Primary accent — logo, active tab, primary buttons, progress rings, links |
| Ink Navy | `#0F2A43` | `onPrimaryStrong` — dark text on primary-colored surfaces (League summary strip); cyan is too bright for white text |
| Cyan Mist | `#67E0F2` | Uppercase eyebrow labels ("YOUR RANK") |
| Deep Cyan | `#0E93AD` | Primary button pressed/gradient-end state |
| **Royal Purple** | `#8B5CF6` | Secondary accent — Division 2, vote/social CTAs |
| Deep Violet | `#5B21B6` | Secondary button pressed/gradient-end state |
| Lilac | `#C4B5FD` | Muted purple text/links |
| Success Green | `#34D399` | Up-trend arrows, checkmarks, Division 3 |
| Alert Red | `#F87171` | Down-trend arrows, destructive actions |
| Division Blue | `#3B82F6` | Division 1 |
| Champion Gold | `#F5B93F` | Rank #1, trophies, prize amounts |
| Silver | `#B8C4D0` | Rank #2 |
| Bronze | `#C97F45` | Rank #3 |

### Light mode

| Name | Hex | Used for |
|---|---|---|
| Cloud White | `#F4F8FC` | App background |
| Pure White | `#FFFFFF` | Card backgrounds |
| Border Light | `#DCE6F0` | Card hairline strokes |
| Ink Navy | `#0F2A43` | Primary text; also `onPrimaryStrong` on primary-colored surfaces |
| Slate | `#5B6B7C` | Secondary text |
| **Ocean Blue** | `#1E88E5` | Primary accent (replaces cyan in light mode) |
| Ocean Blue Deep | `#125EA3` | Pressed state, uppercase labels |

Division and status colors (purple/green/blue/gold/silver/bronze) stay the
same hue across modes, just shifted darker for contrast on white — see
`Colors.light` in theme.ts for exact values.

**Rule: never write a hex code in a screen.** Import `Colors` (semantic,
mode-aware) or, for the rare case you need a raw brand value outside the
semantic map, `Palette` — both from `theme.ts`.

## Type scale

All sizes in px, `fontSize`/`lineHeight`. Font is the platform system font
(`Fonts.sans`).

| Token | Size / Line height | Weight | Notes |
|---|---|---|---|
| `display` | 32 / 38 | 800 (extrabold) | Greeting hero text ("Alex!") |
| `h1` | 24 / 30 | 700 (bold) | Screen titles ("DIVISIONS") |
| `h2` | 18 / 24 | 700 (bold) | Card/section titles, angler names |
| `h3` | 15 / 20 | 700 (bold) | List item titles |
| `numericHero` | 40 / 44 | 800 (extrabold) | Big centered numbers in progress rings |
| `statValue` | 26 / 30 | 800 (extrabold) | Stat-tile numbers ("186.7") |
| `body` | 15 / 22 | 500 (medium) | Default body copy, captions |
| `bodySmall` | 13 / 18 | 500 (medium) | Supporting copy |
| `label` | 11 / 14 | 700 (bold), letter-spacing 0.8, uppercase | Eyebrow labels ("CURRENT DIVISION") |
| `caption` | 12 / 16 | 500 (medium) | Timestamps, meta text |
| `navLabel` | 10 / 13 | 600 (semibold) | Bottom tab bar labels — five tabs plus the raised Catch button leave ~47px each at phone width, so anything larger clips "Divisions" |
| `button` | 15 / 20 | 700 (bold), letter-spacing 0.4, uppercase | Button labels |

### Font weights

`regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700 · `extrabold` 800

## Spacing scale

4px-rooted. Every margin/padding/gap should be one of these.

| Token | Value | Typical use |
|---|---|---|
| `half` | 2 | Hairline gaps |
| `one` | 4 | Icon-to-text gaps |
| `two` | 8 | Tight internal padding |
| `three` | 16 | Standard card padding, list gaps |
| `four` | 24 | Card-to-card gaps, screen horizontal padding |
| `five` | 32 | Section spacing |
| `six` | 64 | Large section breaks |

## Corner radii

| Token | Value | Used for |
|---|---|---|
| `xs` | 6 | Small chips, rank badges |
| `sm` | 10 | Inputs, small buttons, thumbnails |
| `md` | 14 | Standard cards |
| `lg` | 20 | Hero cards/banners, division cards |
| `xl` | 28 | Bottom sheets, large modals |
| `pill` | 999 | Segmented tabs, pill badges, pill buttons |
| `circle` | 9999 | Avatars, icon circles, progress rings (pair with equal width/height) |

## Shadow / elevation

Dark-mode cards get depth mainly from a lighter `surface` color plus a
hairline `border` — **not** heavy drop shadow. Reserve real shadow for two
cases:

- `card` — subtle lift for cards sitting over the background/photo (black,
  4px offset, 25% opacity, 12px blur)
- `raised` — modals, sheets, anything floating above the whole layout (black,
  8px offset, 35% opacity, 20px blur)
- `glowPrimary` / `glowSecondary` — soft accent-colored glow (cyan/purple)
  behind primary CTAs and progress rings. Used sparingly — it's the "this is
  the one thing to tap" signal, not a default button treatment.

## Buttons

| Variant | Background | Text | Radius | Used for |
|---|---|---|---|---|
| `primary` | Angler Cyan (→ Deep Cyan pressed) | White, `button` type, uppercase | `pill` | Main CTA per screen ("SUBMIT CATCH") |
| `secondary` | Royal Purple (→ Deep Violet pressed) | White, `button` type, uppercase | `pill` | Social/vote actions ("VOTE NOW") |
| `outline` | Transparent, 1.5px accent border | Accent color, `button` type | `pill` | Secondary action next to a primary/secondary button ("SHARE FISH") |
| `tabActive` | Angler Cyan, solid | Midnight (dark-on-bright) | `pill` | Active segment in a segmented control |
| `tabInactive` | Transparent, 1px border | Mist | `pill` | Inactive segment |

All button padding is `Spacing.three` vertical / `Spacing.four` horizontal.

There's also an **underline tab** pattern (see "Division 1 Leaderboard" →
STANDINGS/ANGLERS/BIGGEST FISH/POINTS HISTORY): active = accent text + 2px
accent bottom border, inactive = `textMuted`, no border. Build this from the
same color tokens; it doesn't need a new component preset since it's just
text + a border, not a filled shape.

## Inputs

Filled style, not underlined/outlined-only:

- Background: `surface`
- Border: 1px `border`
- Radius: `md` (14)
- Padding: `Spacing.two` vertical / `Spacing.three` horizontal
- Label: uppercase, `label` type, `Cyan Mist` (`#67E0F2`), positioned above
  the value
- Value text: `body` type, primary text color
- Trailing icon (calendar/clock/location/camera): tinted Angler Cyan, ~18–20px

## Division and rank color coding

This mapping is used consistently everywhere a division or rank appears
(cards, badges, table rows, leaderboards):

- **Division 1** → blue (`divisionOne`)
- **Division 2** → purple (`divisionTwo`)
- **Division 3** → green (`divisionThree`)
- **Rank #1** → gold, **#2** → silver, **#3** → bronze, **#4+** → neutral
  `surfaceElevated` badge

Don't invent new division colors per screen — always pull `divisionOne` /
`divisionTwo` / `divisionThree` from `Colors`.

## Layout

| Token | Value | Used for |
|---|---|---|
| `MaxContentWidth` | 800 | Content column cap on wide/web viewports — every screen centers within this instead of stretching edge to edge |
| `BottomTabInset` | 50 (iOS) / 80 (Android) / 0 (web) | Extra bottom padding on scrollable content so it clears the native tab bar |
| `SuggestedFollowsRailHeight` | 146 | Feed's suggested-follows rail — fits a circular avatar plus name, division/position and the follow button (card height is `avatar + 64`, so 140px at the widest avatar) |
| `LeagueStripBannerHeight` | `{ min: 28, max: 48 }` | Join banner in the League Position strip, clamped — see below |
| `LeagueStripTextMinWidth` | 208 | Width the strip reserves for its text column before sizing the banner |
| `SearchIconSize` | 28 | Member-search icon on the feed, right-aligned on the tab pills' row |
| `NavIconSize` | 42 | Bottom nav bar icons — bounded by tab width (~62px at 360), not height |
| `NavIconWide` | 54×33 | Box for the activity icon, whose art is 1.63:1 — area-matched to the rest |

### Bottom nav bar

The bar is icon-only: the artwork replaced the text labels entirely, so each
tab's name survives only as an accessibility label. Five tabs plus the raised
Catch button leave ~56px of width per tab, which is the constraint everything
here is sized against.

`scripts/prepare-nav-icons.mjs` crops each symbol to its own ink and pads it
back to a common square. Both halves matter: the sources float the symbol in
the middle of a 768px canvas using only ~200–274px of it, so uncropped the
bar would render mostly empty space; and they range from 0.98 to 1.26 in
aspect, so squaring them at a shared size is what stops the podium (widest)
out-weighing the profile ring (tallest) side by side at identical box sizes.

An earlier version of this artwork had each tab's name baked in underneath
the symbol, which the script also cropped off. The current sources are
symbol-only, so there's nothing to strip — but the bar stays icon-only
either way.

The selected tab is shown two ways: the `backgroundSelected` pill behind it,
and full opacity against 0.65 for the rest. The icons are full-colour gold,
so a "muted" color token would fight the artwork — opacity is what dims them
without recolouring.

The bar sits flush to the bottom of the screen with square ends — no padding
underneath and no corner radius, since a radius there curved the bottom two
corners away from the screen edge and showed the background through at each
end. It keeps its horizontal inset, so it's a centred block anchored to the
bottom rather than a full-bleed one.

The Catch FAB's `bottom` offset tracks the bar's depth: it's set so the FAB
overhangs the bar's top edge by ~14px. Anything that changes the bar's height
moves that relationship, so the FAB has to move with it or it ends up sunk
into the bar (or floating free of it).

Bar depth is 74px of visible bar inside a 90px footprint (the outer
`Spacing.three` padding is above it only), up from 50px of bar when it held
two-line text labels. Depth is derived, not chosen: it's the tallest icon box
plus the button and container padding.

**Tab order** is Feed, League, [Catch], Activity, Profile — four tabs splitting
2/2 around the raised button. League lands on the National League table (every
angler in the season, paid or free, in one standing); the divisions overview and
the leaders board were tabs of their own and are now slim links from that page.

**What caps the icon size.** The bar splits into two equal halves either side of
the Catch button, and that split has to stay even: the FAB is centred on the
viewport, so the gap between the groups is only centred when both groups are the
same width. Weighting each group by its tab count slides the gap left and the FAB
ends up over an icon.

With four tabs that's 2/2, so every tab is the same ~62px width at 360 and there
is headroom above 36. It was tighter at five: a 2/3 split left right-hand tabs at
~41px, giving 5.3px between icons at 36 and 1.3px at 40 — which is why 40 was
backed out then. Adding a fifth tab back brings that constraint with it.

**Mismatched aspects.** The activity artwork is 1.63:1 where the others are
0.98–1.26, so squaring it leaves the art filling ~61% of the box height and
reading as the small icon in the row. It gets `NavIconWide` instead, whose width
is `NavIconSize * sqrt(1.63)` — matching the others by *area* (54×33 against
42×42). Matching by height would need a 68px box, wider than a whole tab at 360.

Its asset is also left at its true aspect by the prep script rather than padded
to a square, and `NavIconWide` carries an explicit height to suit. That isn't
cosmetic: the bar's row height comes from the tallest icon box, so a square
activity box padded the row with transparency nobody could see and made the
whole bar 12px deeper. Any future icon this far from square needs both halves —
an unsquared asset and a true-aspect box.

### The League Position strip's join banner

The banner is sized by **height**, not width, and the width follows from the
artwork's fixed 3.7:1 ratio. That ordering is the whole design: the banner is
the tallest thing in the row, so it sets the strip's depth and the strip hugs
it — which is what makes the artwork read as *filling* the strip rather than
floating in it.

It can't simply take a share of the row, though, because it shares that row
with the standings. At 3.7:1, height buys width fast, and every pixel of width
the banner takes comes off the text column; once "Your Current League Position"
no longer fits on one line it wraps, and the wrap deepens the strip by more
than the taller banner gained. So the strip reserves `LeagueStripTextMinWidth`
for the text first, gives the leftover width to the banner, and clamps the
resulting height to `LeagueStripBannerHeight`. Measured result:

| Viewport | Strip | Banner | Space above/below |
|---|---|---|---|
| 360 | 44 | 104×28 | 8 |
| 375 | 44 | 119×32 | 6 |
| 430 | 57 | 174×47 | 5 |
| ≥800 | 58 | 178×48 | 5 |

**Don't size this from the strip's own height** (`alignSelf: 'stretch'` plus
`aspectRatio`), which looks like the obvious way to make it fill. That's a
cyclic size dependency — the strip's height depends on its children, the
banner's width depends on the strip's height — and the browser breaks the cycle
by laying the strip out as if the text had never wrapped, which left the
standings overflowing the strip's border by 16px at 360.
