# Item Catalog Feature Design

## Goal

Replace hardcoded apparel types, colors, and sizes in the order builder with a fully user-configurable item catalog. Items can be anything (t-shirt, sticker, hat) and each carries its own active/inactive lists of colors (with swatches), sizes (freeform labels), and decoration methods. The catalog is stored locally and synced to Google Drive so both partners share the same working set.

## Architecture

New `server/items/` module (mirrors `server/settings/`) backed by a local `server/items-catalog.json` file, which is also stored as `items-catalog.json` in the Drive top-level folder. The Settings screen gains a second tab ("Items") for catalog management. The order builder's line item card becomes fully dynamic, driven by the selected item type. Decoration method moves to the per-placement level (front/back). A global order notes field is added at the order level.

---

## 1. Data Model

### `server/items-catalog.json`

```json
{
  "items": [
    {
      "id": "cuid-generated",
      "name": "Unisex T-Shirt",
      "supplierUrl": "https://supplier.com/product/3001",
      "colors": [
        { "name": "White", "hex": "#ffffff", "active": true },
        { "name": "Black", "hex": "#000000", "active": true },
        { "name": "Cardinal Red", "hex": "#8b0000", "active": false }
      ],
      "sizes": [
        { "label": "S", "active": false, "order": 0 },
        { "label": "M", "active": true, "order": 1 },
        { "label": "L", "active": true, "order": 2 },
        { "label": "XL", "active": true, "order": 3 },
        { "label": "2XL", "active": false, "order": 4 }
      ],
      "decorationMethods": [
        { "name": "DTF", "active": true },
        { "name": "Screen Print", "active": true },
        { "name": "DTG", "active": false }
      ]
    }
  ]
}
```

- `id`: generated with `@paralleldrive/cuid2` (already a dependency)
- `hex`: optional — `null` if no swatch has been set
- `sizes[].order`: integer controlling display order in the order builder
- All three sub-lists independently managed per item — no shared global pools

### Updated Line Item (order data model)

```json
{
  "num": "01",
  "itemTypeId": "cuid-of-item",
  "itemTypeName": "Unisex T-Shirt",
  "color": "White",
  "sizes": {
    "M": { "total": 5, "inventory": 0 },
    "L": { "total": 3, "inventory": 0 }
  },
  "frontDesigns": [{ "designNum": "1", "file": "logo.png" }],
  "frontNotes": "",
  "frontMethod": "DTF",
  "backDesigns": [],
  "backNotes": "Center back, 3\" below collar",
  "backMethod": ""
}
```

- `itemTypeId` + `itemTypeName`: both stored so old orders remain readable if the catalog changes
- `sizes`: keys are now freeform labels (e.g., `"M"`, `"2x2"`) instead of hardcoded XS–XXL
- `frontMethod` / `backMethod`: decoration method per placement; empty string = defer to order notes
- Legacy orders with `apparelType` (no `itemTypeId`) are displayed read-only using the `apparelType` string; the order builder prompts the user to re-select an item type to unlock editing

### Updated Order (order-level field)

The `notes` field already exists on the order data model and is persisted to Sheet1. It just needs a UI surface (see Section 4).

### Google Sheets impact

The Line Items tab currently has fixed size columns (XS, S, M, L, XL, XXL). With dynamic size labels these cannot be fixed columns. **New format:** a single `Sizes` column containing a compact string, e.g. `M×5, L×3, XL×2`. The separate size columns are removed. This is a breaking change to the sheet schema — existing order sheets will need to be recreated or manually migrated.

---

## 2. Backend

### `server/items/store.js`

```js
const CATALOG_FILE = path.join(__dirname, '..', 'items-catalog.json');
const DEFAULTS = { items: [] };

function readCatalog()   { /* read CATALOG_FILE, return DEFAULTS on missing/error */ }
function writeCatalog(data) { /* write CATALOG_FILE */ }

module.exports = { readCatalog, writeCatalog };
```

### `server/items/router.js`

Mounted at `/api/items` in `server/index.js`.

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/items` | Return full catalog |
| `POST` | `/api/items` | Create item (generate cuid, append to list) |
| `PUT` | `/api/items/:id` | Replace item by id |
| `DELETE` | `/api/items/:id` | Remove item by id |
| `POST` | `/api/items/:id/scrape-colors` | Scrape supplier URL for colors (see below) |
| `POST` | `/api/items/push` | Upload local catalog to Drive |
| `POST` | `/api/items/pull` | Download catalog from Drive → overwrite local |

### Color scraping (`POST /api/items/:id/scrape-colors`)

1. Read item's `supplierUrl` from catalog
2. `fetch(supplierUrl)` server-side (no CORS issues)
3. Parse HTML with a regex/DOM search for color-related patterns (supplier-specific; best-effort)
4. Return `{ colors: [{ name, hex }] }` — `hex` may be null
5. Scraped colors are merged into the item's `colors` list (inactive by default); names already present are skipped
6. Response includes `{ added: N, skipped: N }` so the UI can report results
7. If fetch fails or no colors found, return `{ error: "Could not parse colors from this URL" }` — not a 500, the UI shows a warning

### Drive sync

Uses the existing `server/drive/` Google Drive client (already handles auth/tokens).

- **Push:** find or create `items-catalog.json` in `config.DRIVE.TOP_LEVEL_FOLDER`, upload local file contents
- **Pull:** find `items-catalog.json` in the top-level folder, download and overwrite local file, return the parsed catalog
- If `items-catalog.json` does not exist on Drive during pull, return `{ error: "No catalog found on Drive" }`

---

## 3. Frontend — Settings Screen

### Tab structure

`SettingsScreen.jsx` gains a tab bar at the top:

- **System** — all existing content unchanged (brand name, spew email, default back design, default back notes, Google account, logout)
- **Items** — new item catalog management (see below)

Active tab tracked with local `useState('system' | 'items')`.

### Item Editor — Save Behavior

All changes in the item editor auto-save locally with a short debounce (text fields: 400ms after last keystroke; toggle/move actions: immediate). There is no explicit "Save Item" button. The Drive sync is the only explicit action (Push/Pull buttons). A subtle "Saved" indicator appears briefly after each local write. Colors with `hex: null` show a neutral grey square as their swatch in both the editor and the order builder.

### Items Tab Layout

```
┌─────────────────────────────────────────────┐
│ [Push to Drive]  [Pull from Drive]  Last synced: ...  │
├──────────────┬──────────────────────────────┤
│ Item List    │  Item Editor                 │
│              │                              │
│ • Unisex Tee │  Name: [______________]      │
│ • Sticker    │  URL:  [______________] [Scrape Colors] │
│              │                              │
│              │  Colors                      │
│              │  Active      | Inactive       │
│              │  ■ White     | ■ Cardinal Red │
│              │  ■ Black     | + Add color    │
│              │  + Add color |                │
│              │                              │
│              │  Sizes                       │
│              │  Active   | Inactive          │
│              │  M ⠿      | S                │
│              │  L ⠿      | 2XL              │
│              │  XL ⠿     | + Add size        │
│              │  + Add size|                  │
│              │                              │
│              │  Decoration Methods          │
│              │  Active         | Inactive    │
│              │  DTF            | DTG         │
│              │  Screen Print   | + Add       │
│              │  + Add          |             │
│              │                              │
│              │  [Delete Item]               │
│ [+ New Item] │                              │
└──────────────┴──────────────────────────────┘
```

### Color Entry

Each color in active or inactive column shows:
- A small colored square (swatch) — clicking opens the **Color Picker**
- The color name as text

**Color Picker** (inline popover/modal):
- Hex input field (`#rrggbb`)
- RGB inputs (three number fields 0–255)
- CMY inputs (three number fields 0–100%)
- All three representations stay in sync as the user edits any one
- "Clear swatch" link to remove the hex value
- Changes apply on close/confirm

**Adding a color manually:** a small form at the bottom of each column — text input for name, optional swatch picker, confirm button.

**Moving between active/inactive:** click a "→" / "←" arrow button on each color entry, or click the color name to toggle. The entry moves to the other column immediately and the item auto-saves locally.

### Size Entry

Each size in active column shows:
- A drag handle (⠿) for reordering within the active list
- The size label text
- A "→" button to move to inactive

Inactive column: label text + "←" button.

"+ Add size" opens a small text input for freeform label entry.

Sizes are saved with their `order` value reflecting the current active list sequence (0, 1, 2...). Inactive sizes retain their last order value.

### Decoration Methods Entry

Same two-column active/inactive layout as sizes, but no reordering drag handle needed (order doesn't matter for a dropdown). "+ Add method" opens a text input.

### Drive Sync Controls

Two buttons at the top of the Items tab:
- **Push to Drive** — uploads current local catalog; shows "Pushed!" confirmation or error toast
- **Pull from Drive** — shows a confirmation dialog ("This will overwrite your local catalog with the Drive version. Continue?") before proceeding; shows "Pulled!" or error toast
- **Last synced:** timestamp updated after each successful push or pull (stored in local state, reset on page reload)

---

## 4. Frontend — Order Builder Changes

### Global Order Notes

A `<textarea>` added below `<OrderTopBar>` and above `.builder-body`:

```jsx
<textarea
  className="order-notes"
  value={order.notes || ''}
  onChange={e => setOrder(prev => ({ ...prev, notes: e.target.value }))}
  placeholder="Order notes — e.g. All shirts DTG unless noted per placement"
/>
```

The `notes` field already exists in the order data model and is persisted to Sheet1 row 6. No backend changes needed.

### Line Item Card — Item Type

Replaces the hardcoded `APPAREL_TYPES` button group:

- Dropdown (`<select>`) populated from the items catalog (item names)
- If no items are configured: a message "No items configured — add items in Settings" with a link
- Selecting an item type:
  - Stores `itemTypeId` and `itemTypeName` on the line item
  - Resets `color`, `sizes`, `frontMethod`, `backMethod` to empty (they were specific to the old item)
  - Loads the selected item's active colors, active sizes, and active decoration methods into local state for the card

### Line Item Card — Color

Replaces hardcoded `COLORS` button group:

- Renders one button per active color for the selected item type
- Each button: small colored swatch square + color name text
- Greyed out / placeholder text if no item type selected yet

### Line Item Card — Sizes

Replaces `SizeButtons` with a dynamic version:

- Active sizes for the selected item (in configured order) are shown as quantity inputs, same `+/−` mechanic as today
- Size keys in the `sizes` object are now the freeform labels (e.g., `"M"`, `"2x2"`)
- Total and inventory rows work identically to today
- If no item type selected: sizes section shows placeholder

### Line Item Card — Decoration Method (per placement)

Added inside each placement section (Front / Back), above the design picker:

```
Front
  Decoration Method: [dropdown ▾]   ← "DTF", "Screen Print", ... or blank
  + Add Design
  [design rows]
  [notes textarea]
```

- Dropdown options: active decoration methods for the selected item type + a blank option ("— see order notes —")
- Stored as `frontMethod` / `backMethod` on the line item
- If blank, omitted from the email (covered by order-level notes)

### Email Changes

`server/gmail/emailBuilder.js` updates:

- Order notes section added at the top of the email body (if `order.notes` is non-empty)
- Line item table updated: `Apparel Type` column header → `Item`; sizes column shows `M×5, L×3` format (comma-separated label×qty pairs, zero quantities omitted)
- Placement rows now include decoration method if set: e.g. "Front — DTF"

---

## 5. Migration & Backwards Compatibility

- **Existing orders** have `apparelType` (string) instead of `itemTypeId`/`itemTypeName`. The order builder detects `!lineItem.itemTypeId` and shows the item type as read-only text with a prompt: "Select an item type to continue editing." All other fields (designs, notes) remain editable.
- **Existing Google Sheets** use fixed size columns. New orders write sizes as a single `Sizes` column string. Old sheets are unaffected until re-saved, at which point the write will update to the new format — this means the sheet structure will need to be refreshed. Document this as a known migration step.
- **`defaultBackDesign`/`defaultBackNotes`** in settings remain unchanged. When a new line item is created, the back is still pre-populated from those settings defaults.
