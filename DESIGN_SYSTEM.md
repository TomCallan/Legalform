# Legalform Design System

Legalform follows the **MONARCH** design language: *Apple meets capital markets meets Anduril*.

- **Apple** — clean sans-serif type, generous whitespace, hairline separators, muted secondary text.
- **Capital markets** — tabular numerals, small uppercase readouts with wide tracking, thin rule lines separating rows, precise information density.
- **Anduril** — sharp (never rounded), high-contrast black/white, uppercase technical labels, no decoration that doesn't carry information.

Hard rules:

- **White background, black text.** Light theme only. There is no dark theme and no theme toggle.
- **Text is left-aligned** throughout.
- **One typeface:** Zen Kaku Gothic New (`400`, `500`, `600`, `700`, `900`), loaded from Google Fonts. There is no mono font and no serif font — the previous retro/dot-matrix aesthetic is retired.
- **Remove what isn't used.** No dead code, no unused design constructs.

## Design Tokens

All colors come from these tokens — never invent new colors inline.

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#ffffff` | Page background |
| `--bg-surface` | `#fafafa` | Expanded detail background, pane headers |
| `--bg-surface-hover` | `#f5f5f5` | Row hover, form input resting background |
| `--border-subtle` | `#e5e5e5` | Hairline separators, borders, inactive underlines |
| `--border-active` | `#000000` | Focus / active border |
| `--text-main` | `#000000` | Primary text, primary borders, primary buttons |
| `--text-muted` | `#6e6e73` | Secondary text, labels, metadata |
| `--accent-brand` | `#000000` | Link and primary-action color |
| `--success` | `#0f7b3d` | Form status — success |
| `--error` | `#c02424` | Form status — error |

## Typography

| Role | Size | Weight | Tracking | Case | Color |
|---|---|---|---|---|---|
| Display title (`h1`) | `clamp(40px, 6.4vw, 104px)` | 900 | `-0.03em` | UPPERCASE | `--text-main` |
| Eyebrow / section label | `clamp(10px, 0.75vw, 11px)` | 600 | `0.24em` | UPPERCASE | `--text-muted` |
| Deck / body | `clamp(13px, 0.95vw, 15px)` | 400–500 | normal | sentence | `--text-muted` |
| Wordmark | `1rem` | 700 | `0.22em` | UPPERCASE | `--text-main` |
| Footer | `clamp(9px, 0.7vw, 11px)` | 600 | `0.2em` | UPPERCASE | `--text-muted` |

Numerics and readouts use `font-variant-numeric: tabular-nums` so columns align (document ids, counts, audit hashes).

## Components

- **Buttons** — primary: black background, white text, 1px black border, uppercase `0.14em` tracking, sharp corners; hover inverts to white bg / black text. Outline: transparent, black text, `--border-subtle` border; hover fills black border. Danger ghost: `--error` border/text, fills `--error` on hover. Disabled: `opacity: 0.4`.
- **Text links** — hairline underline (`text-decoration-color: var(--border-subtle)`, offset 4px, thickness 1px); on hover the underline fills `--text-main`.
- **Form controls** — inputs sit on `#f5f5f5` with a transparent border; on focus the border becomes `--border-active` and background `#fff`. Uppercase labels with wide tracking.
- **Tables** — uppercase muted headers separated from the body by a 1px black rule; hairline row separators; `#f5f5f5` row hover; tabular numerals.
- **Status badges** — 1px bordered pills; `--success` for active/completed, `--error` for closed/failed, muted for pending.
- **Sidebar nav** — bordered rail; active item gets a black fill (`--text-main` background, white text).
- **Modals** — white card, 1px `--border-subtle` border, `0 24px 60px rgba(0,0,0,0.12)` shadow, on a `rgba(0,0,0,0.4)` blurred backdrop.
- **Spinner** — square (no radius), `--border-subtle` frame with `--text-main` top edge, linear spin.

## Layouts

- **Landing page (`index.html`)** — sticky header with wordmark + actions; hero with uppercase display title, muted deck (`max-width: 46ch`); demo window and features as hairline-bordered panels. The page scrolls normally.
- **Signer flow (`index.html?slug=…`)** — a document execution view (app page, scrolls normally). Bordered card: uppercase jurisdiction eyebrow, 900-weight uppercase title, tabular meta row (document id / expiry / signing role), static clause sections with uppercase section labels, form fields, signature pad (bordered square canvas), statutory `legal_footer` between the form and the signature, black `Sign & Execute` button, and a confirmation view showing the SHA-256 audit digest in tabular numerals.
- **Workspace (`admin.html`)** — sidebar rail (black fill for the active item) + top bar + scrolling content area; ledger table and visual/YAML builder split panes.

## Do / Don't

**Do:** use tokens; use `clamp()`; left-align; use hairlines over solid fills; uppercase labels with wide tracking; tabular numerals; sharp corners; delete unused code.

**Don't:** reintroduce dark mode, the dot-matrix font, tickers/feeds, scanline/gradient backgrounds, decorative non-Latin text, serif or monospace type, or rounded corners.
