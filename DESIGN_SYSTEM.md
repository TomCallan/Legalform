# Sig (LegalForm) Design System

This document defines the core visual design tokens, component standards, typography rules, and status color maps for **Sig (LegalForm)** to ensure consistency across the home landing page and admin dashboard.

---

## 🎨 Color Palette & Tokens

```css
:root {
  /* Surface & Backgrounds */
  --bg-app:        #090d16; /* Deep dark slate background */
  --bg-card:       #111726; /* Dark panel & card fill */
  --bg-input:      #1a2234; /* Dark input background */
  --border-subtle: #1e293b; /* Subtle structural divider border */
  --border-active: #334155; /* Interactive hover border */

  /* Typography */
  --text-primary:  #f8fafc; /* Primary headings & body text */
  --text-muted:    #64748b; /* Secondary metadata & labels */
  --text-subtle:   #94a3b8; /* Paragraphs & descriptions */

  /* Brand & Accents */
  --accent-brand:  #3b82f6; /* Electric blue primary action color */
  --accent-hover:  #2563eb; /* Hover state for primary action */
}
```

---

## 🏷️ Status Badge Color Map

Status pills reflect exact database states from `schema.sql` (`documents` and `document_parties` tables):

| Status Enum | Usage | Styling Rule |
| :--- | :--- | :--- |
| `active` / `unlocked` / `sent` | Active signing links ready for execution | `background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.25);` |
| `pending` / `partially-signed` | Multi-party sequence waiting for prior signer | `background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.25);` |
| `completed` / `fully_executed` | All signers have completed execution | `background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.25);` |
| `expired` / `revoked` / `closed` | Slugs force closed, expired, or purged | `background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.25);` |

---

## 🔤 Typography & Font System

- **Display / Headings:** `Inter`, `-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`
  - Font weights: `600`, `700`, `800`
  - Letter spacing: `-0.025em`
- **Body Text:** `Inter`, `system-ui, sans-serif`
  - Font weight: `400`
  - Line height: `1.6`
- **Monospace / Utility Text:** `'Fira Code', 'SF Mono', Consolas, monospace`
  - Usage: Document IDs, Slugs, Party Tokens, SHA-256 Audit Hashes, UTC Timestamps, and YAML Spec Code Panels.

---

## 🔐 Signature Visual Element

The signature visual element is the **Cryptographic Verification Pill**:
```html
<div class="verification-badge">
  <span class="dot"></span>
  <code>sha256: 8f3a...b19e VERIFIED</code>
</div>
```
This element anchors Sig to its core technical differentiator: cryptographic non-repudiation and field-level audit telemetry.

---

## 📱 Component Standards

1. **Buttons (`.btn`, `.btn-secondary`, `.btn-danger`):**
   - High-contrast rounded buttons with subtle hover lift and 2px focus ring.
   - NO emojis in button labels or tab headers.
2. **Modal Dialogs (`#notification-modal`):**
   - Backdrop blur overlays (`backdrop-filter: blur(8px)`) with explicit action confirmation buttons ("Revoke", "Delete", "Re-up").
3. **Empty States (`.empty-state`):**
   - Actionable zero-state panels featuring copyable CLI / MCP deployment commands when no documents are returned.
