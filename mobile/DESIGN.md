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
| `SuggestedFollowsRailHeight` | 164 | Feed's suggested-follows rail — fits a circular avatar plus name, division/position, best fish and the follow button (~147px of content) |
| `LeagueStripBannerHeight` | `{ min: 28, max: 48 }` | Join banner in the League Position strip, clamped — see below |
| `LeagueStripTextMinWidth` | 208 | Width the strip reserves for its text column before sizing the banner |

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
