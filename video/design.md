# Patiently — video design system

Taken from the product's own Tailwind theme so the film looks like the thing it
is showing, not like a template wrapped around it.

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| brand-700 | `#0c6b54` | deep accent, emphasis text on light |
| brand-600 | `#0e8265` | primary brand, buttons, key words |
| brand-500 | `#10b981` | live indicators, "agent" accents |
| brand-100 | `#d1fae5` | chips, soft fills |
| brand-50  | `#ecfdf5` | light ground |
| ink-900   | `#0f172a` | headlines on light, dark ground |
| ink-700   | `#1e293b` | dark ground, second layer |
| ink-500   | `#475569` | body copy on light |
| ink-300   | `#94a3b8` | muted copy on dark |
| ink-100   | `#e2e8f0` | hairlines |
| ink-50    | `#f8fafc` | light ground |
| alert-600 | `#dc2626` | red flags, triage alerts |
| alert-100 | `#fee2e2` | alert fills |
| warn-600  | `#d97706` | unsigned / incomplete states |

Ground is `#0f172a` for cards, `#f8fafc` for footage surrounds.

## Typography

- Display: **Inter** 800. Headlines, numbers. (Single family — the renderer
  resolves Inter automatically; a second family would need bundled .woff2 files
  and would fall back silently if missing.)
- Body: **Inter**, 400/500/600. Captions, lower thirds, labels.
- Mono: **ui-monospace** for tool names (`sign_prescription`).
- Headlines 96–140px. Lower thirds 34–44px. Labels 24–28px, uppercase, tracking 0.08em.
- `font-variant-numeric: tabular-nums` on every number.

## Corners and depth

- Radius 24px on cards, 999px on pills.
- Flat. No drop shadows on the dark ground — separate with color, not blur.
- Footage sits on a 20px ink-900 surround with a 1px `rgba(255,255,255,0.08)` hairline.

## Motion

- Entrances `power3.out`, 0.5–0.7s. Vary the ease per element.
- Nothing moves more than 60px on entry.
- Transitions are crossfades, 0.5s. No wipes, no spins.
- Hold on footage. The product is the content; the frame should not perform.

## What NOT to do

- No stock imagery, no generated clinic or doctor footage — every frame of
  product is a real recording of the deployed app.
- No emoji.
- No full-screen linear gradients on dark (H.264 bands).
- No exit animations except the final card.
