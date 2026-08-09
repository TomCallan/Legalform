# MONARCH Site Styleguide

## Core Philosophy
The site employs a retro, terminal-inspired, maximalist aesthetic with a distinct dark theme. It combines stark contrasts (black, white, and subtle greys) with technical, utilitarian typography to emulate early tech systems, trading terminals, and operational dashboards.

## Color Palette
The color scheme relies entirely on high contrast defaults. Do not use Tailwind default colors without explicit mapping.
- **Background:** `#000` (Defined as `--bg` in `globals.css`)
- **Foreground:** `#fff` (Defined as `--fg` in `globals.css` - used for primary text and major borders)
- **Lines/Borders:** `#2b2b2b` (Defined as `--line` in `globals.css` - used heavily for grid lines and panels)
- **Accents:** 
  - Grey text (`#777`, `#888`, `#999`, `#b9b9b9`, `#ccc`) for metadata, labels, and secondary reading.
  - `#f1c48f` for specific status highlights (e.g. `desktopFeedPanelStatus`).
  - Dark grey `#111` for repeating gradients or subtle backgrounds.

## Typography
The UI pairs two main fonts to separate human-readable prose from technical readouts.

1. **Primary Font (Prose & Body text):** `Zen Kaku Gothic New`, `sans-serif`
   Used for: Body copy, long-form reading, primary page titles (e.g. `heroTitle`).
   
2. **Technical Accent Font:** `var(--font-dot-gothic)`, `monospace`
   Used for: System labels, timestamps, metadata, component boundaries, button text. Usually paired with `uppercase` and moderate-to-high letter spacing (`0.1em` to `0.14em`).

## Layout Patterns

### Project Dimensions & Gutter
- **Max Width:** `1360px`
- **Dynamic Gutter:** `var(--gutter)` -> `clamp(18px, 4vw, 56px)`

### The `retroPage` Wrapper
Acts as the central scaffold, featuring a repeating linear gradient background to simulate scanlines/terminal grids:
- Displays vertical dividing lines.
- Horizontal repeating `#111` lines explicitly patterned every 38px/39px.

### Key Components

#### Desktop Ops Brief (`.desktopOpsBrief`)
A 4-column compact data display at the header/sidebar area.
- Uses strict borders (`var(--line)` and `#222`).
- Relies heavily on the technical tracking font for labels and huge, prominent `<strong>` numbers.

#### Desktop Feed Panel (`.desktopFeedPanel`)
Horizontal data ticker look.
- 3 columns, solid `#000` background.
- Connect buttons with `cursor: pointer` and simple inverse hover states (white bg, black text).

#### Grid / Feed System (`.feedGrid`)
- Dense grid layout (`grid-auto-flow: dense`).
- Dynamic column spans (`data-col-span="2"`, `data-col-span="3"`) to build mosaic-like content walls.
- Items are strictly boxed with `var(--line)`.

#### Hero Section (`.heroGrid`, `.heroCopy`)
- Extreme typography: up to `74px` titles (`heroTitle`) and `170px` for giant nameplates.
- Japanese characters (`.jp`) often used alongside English to emphasize a dystopian/cyberpunk tech influence. Writing mode `vertical-rl` is occasionally used for right rails (`.heroRail`).

## Interaction Elements

### Buttons and Tags
- **Base Style:** Transparent background, `1px solid` border, uppercase, high letter spacing.
- **Hover/Active:** Direct inversion—background becomes `#fff` or `#000`, text flips contrast.
- Uses `transition: background 0.2s ease, color 0.2s ease` to ensure sharp but non-jarring feedback.

### Modals (`.modalOverlay`)
- Deep blur backdrop (`backdrop-filter: blur(4px)`) atop `rgba(0, 0, 0, 0.85)`.
- Center-aligned floating panel with stark white borders and heavy drop shadow.

### Forms
- High-contrast inputs `.formInput` (`#111` background with `#333` border).
- Status hints use semi-transparent distinct colors: Success (`#4ade80`), Error (`#f87171`).

## Spacing & Responsive Behaviors
- Use `clamp()` extensively to keep elements fluid matching viewport width/height seamlessly (e.g., `clamp(18px, 2.2vh, 32px)`).
- Collapse large multi-column grids (like the Feed) into fewer columns via simple media queries: `@media (max-width: 1200px)` drops feed to 2 columns.
