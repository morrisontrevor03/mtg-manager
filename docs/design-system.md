# Design system

MTG Manager's UI is built on [shadcn/ui](https://ui.shadcn.com/) primitives, themed
with the app's own **parchment & ink** look: warm charcoal surfaces, aged-paper text,
one burnished amber accent, physical motion. Dark only.

The direction is a **collector's archive**: a card catalogue first, a dashboard second.
That means real card art, mana and set symbols, and collector metadata everywhere, and
hierarchy built from type, spacing and hairlines rather than a box around everything.

Three layers, from most generic to most specific:

| Layer | Where | What goes there |
| --- | --- | --- |
| Tokens | `src/app/globals.css` | Colours, radius, shadows, easing, motion classes |
| Primitives | `src/components/ui/` | shadcn components (Button, Dialog, DropdownMenu, Tooltip, HoverCard, Input, Select, …) |
| Patterns | `src/components/patterns.tsx` | Layout shapes: `Section`, `Surface`, `StatRow`/`StatItem`, `PageHeader`, `ActionLink`, `EmptyState`, `SkeletonLines`, `LoadError`, `BackLink` |
| MTG | `src/components/mtg.tsx` | `ManaSymbol`, `ManaCost`, `ColorIdentity`, `SetSymbol`, `Printing`, `FoilMark`, `CardThumb`, `CardPreview` |
| Analytics | `src/components/charts.tsx` | `ManaCurve`, `ColourBreakdown`, `RarityBreakdown`, `BarList` (plain HTML, no chart library) |

Pages should compose patterns and primitives. Raw `<button>`/`<input>` elements or
hand-picked colours in a page usually mean a primitive or token is missing.

## Tokens

The names follow shadcn's contract, so every primitive picks the theme up unchanged.
The shadcn meanings differ from what the names suggest:

| Token | Value | Use it for |
| --- | --- | --- |
| `background` | `#120f0c` | The page |
| `card` | `#1c1712` | Panels and raised surfaces |
| `muted` / `secondary` | `#272019` | Wells, inputs, quiet buttons (a step above `card`) |
| `accent` | `#322a20` | Hover and pressed states. **Not amber.** |
| `popover` | `#272019` | Menus, dropdowns, suggestion lists |
| `primary` | `#d6a04a` | The amber: primary actions, links, warnings, highlights |
| `foreground` | `#f2e9d8` | Body text |
| `muted-foreground` | `#a3947c` | Secondary text, labels |
| `faint-foreground` | `#7a6d59` | Set codes, dates, hints (extension) |
| `border` / `input` | `#382f24` | Hairlines and control borders |
| `border-strong` | `#4d4030` | Hover borders, popover rims (extension) |
| `destructive` | `#c4593f` | Errors and deletes |
| `success` / `info` | `#8aa363` / `#5b9bd9` | Status (extensions) |
| `rarity-*` | common … mythic, special | Expansion-symbol colours (extension; game data) |
| `chart-1`…`chart-5` | amber, then mana hues | Legacy; the current charts use mana and rarity colours |

Do not use Tailwind's stock palette (`red-400`, `green-400`, `amber-300`, …). It is
cool-toned and breaks the warmth. Mana and rarity colours in `mtg.tsx` and `charts.tsx`
are game data, so they stay literal.

**Amber is earned.** It marks the primary action, selection, money (collection value,
prices worth calling out, cards to acquire) and things needing review. Charts, dividers
and decorative bars are neutral; mana and rarity charts use their game colours.

**Surfaces have three levels:** the canvas (`background`) holds most content directly;
`Surface` (`card`) is the one raised panel per region, divided inside by hairlines;
`muted` is for controls and hovered rows. Borders mark interactive objects (inputs,
dialogs, popovers) and empty slots (the dashed `EmptyState`), not every section.

**Radius is a hierarchy**, not one value: inputs and selects `rounded-sm` (6px), buttons
and toggles `rounded-md` (8px), popovers, menus, alerts `rounded-lg` (10px), raised panels
and dialogs `rounded-xl` (14px). Card art uses its own small radius. Elevation utilities
are `shadow-hairline`, `shadow-raised` and `shadow-raised-lg`, all warm-tinted.

## Primitive conventions

- **Button.** `default` is the amber key with the hover sheen; use it once per view
  for the main action. `outline` is the everyday secondary button. `destructive` is a
  tinted red, not a solid fill. `ghost` and `link` are for inline actions. Every variant
  carries the `press` class (lift on hover, sink when held). For a link that looks like
  a button, use `<Button asChild><Link …/></Button>`.
- **Badge.** Status uses the `success`, `warning`, `info` and `muted` variants: a tinted
  wash with a matching rim.
- **Alert.** Use `destructive` for failures (see `LoadError`) and `warning` for things
  the user should know but can proceed past.
- **AlertDialog.** Use it for confirmation, never `window.confirm`.
- **Select.** Radix items cannot have an empty `value`. Use a sentinel such as
  `"__auto"` for "no preference" (see `DeckBuilderForm`).

## Type and motion

- `.display` (Fraunces) is for the brand, page titles, and the card detail drawer's
  title. Nothing else: stats, section headings, tables and labels are Geist Sans.
- Section headings are **sentence case** ("Mana curve", "Recently added") via `Section`.
  Uppercase is for collector metadata only: `.meta` (mono small caps for set codes and
  collector numbers) and `FoilMark`. `.eyebrow` still exists but should be rare.
- `.numeral` for tabular figures.
- One easing curve, `ease-settle`. `.ink-in` is the signature entrance, `.stagger`
  deals children in sequence, `.card-lift` lifts and tilts a card on hover.
- `prefers-reduced-motion` disables all of it globally. Keep new motion inside that
  rule.

## MTG assets

Mana symbols, set symbols and card art come from Scryfall's CDNs (`svgs.scryfall.io`,
`cards.scryfall.io`), which send `Access-Control-Allow-Origin: *`. Set symbols are drawn
as CSS masks (`.set-symbol`) so they take their rarity colour, as on a printed card. Set
names for tooltips come from `useSets()`, which fetches Scryfall's set list in the browser
and caches a trimmed copy in `localStorage` for a week. `src/lib/scryfallAssets.ts` turns
the stored `normal` image URL into `art_crop` (rows) or other sizes.

## Icons

Use [lucide](https://lucide.dev/) (shadcn's icon set, `lucide-react`) for UI icons. The
custom inline SVGs in `src/components/icons.tsx` (`WaveformIcon`, `StopIcon`,
`SparkIcon`, `GoogleIcon`) stay for the app's own marks. **No emoji in the UI.**

## Adding a shadcn component

```sh
npx shadcn@latest add <component>
```

`components.json` is configured (new-york style, lucide, `@/components/ui`). After
adding a component, restyle it in place to match:

- move control backgrounds from `bg-transparent` / `dark:bg-input/30` to `bg-muted`;
- popovers get `border-border-strong` and `shadow-raised-lg`;
- focus rings use `focus-visible:border-primary-soft` with `ring-ring/16`.

Treat the generated code as ours to edit. That is the point of shadcn.
