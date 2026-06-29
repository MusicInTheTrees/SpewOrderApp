# Item Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded apparel types, colors, and sizes with a user-configurable item catalog stored locally and synced to Google Drive.

**Architecture:** New `server/items/` module (parallel to `server/settings/`) backed by `server/items-catalog.json`. Settings screen gains System/Items tabs. LineItemCard becomes fully dynamic — item type drives active colors, sizes, and decoration methods. Decoration method is per placement (front/back). Global order notes textarea added to order builder.

**Tech Stack:** Node/Express backend, React 18 + Vite frontend, Vitest (frontend tests), Jest + supertest (backend tests), googleapis Drive client (already wired).

## Global Constraints

- `server/items-catalog.json` must be added to `.gitignore` (user-specific data, like `settings.json`)
- Frontend tests use Vitest globals (`vi.fn()`, `describe`, `test`, `expect`) — no `import { vi } from 'vitest'` needed
- Backend tests use Jest + supertest — `require('supertest')` and `require('../index')`
- Vite proxy: `/api/*` → `http://localhost:3001/*` (strips `/api` prefix) — backend mounts at `/items`, frontend calls `/api/items`
- `requireAuth` middleware lives at `server/middleware/requireAuth.js` — all items routes must use it
- Drive client at `server/drive/client.js` — add new functions there, do not duplicate auth logic
- `@paralleldrive/cuid2` is already installed in `server/node_modules` — use `const { createId } = require('@paralleldrive/cuid2')`
- Color hex values stored as `#rrggbb` lowercase strings or `null`
- Size `order` field: integers 0-based reflecting active list sequence; inactive sizes keep last order value
- `itemTypeName` is always stored as a snapshot alongside `itemTypeId` so old orders remain readable if item is renamed/deleted

---

## File Map

**Create:**
- `server/items/store.js` — read/write `items-catalog.json`
- `server/items/router.js` — CRUD + scrape + Drive sync routes
- `server/__tests__/items.test.js` — backend items API tests
- `src/api/items.js` — frontend API client
- `src/hooks/useItems.js` — React hook for catalog state + debounced saves
- `src/utils/colorUtils.js` — hex/RGB/CMY conversion pure functions
- `src/components/ColorPicker.jsx` — hex+RGB+CMY picker popover
- `src/components/ItemsTab.jsx` — full items catalog management UI

**Modify:**
- `server/config.js` — add `ITEMS_CATALOG_FILE`
- `server/index.js` — mount `/items` router
- `server/drive/client.js` — add `uploadFileContent`, `downloadFileContent`
- `server/sheets/orderSheet.js` — new Line Items schema (compact sizes, frontMethod/backMethod)
- `server/gmail/emailBuilder.js` — order notes, compact sizes, decoration methods
- `src/components/SettingsScreen.jsx` — System/Items tab structure
- `src/components/SizeButtons.jsx` — accept `sizeLabels` prop instead of hardcoded array
- `src/components/LineItemCard.jsx` — dynamic item type, colors, sizes, decoration method dropdowns
- `src/components/OrderBuilder.jsx` — `useItems()`, global notes textarea, pass `items` to cards
- `src/App.css` — tabs, two-column active/inactive lists, color swatches, picker styles
- `.gitignore` — add `server/items-catalog.json`
- `src/__tests__/SizeButtons.test.jsx` — update for `sizeLabels` prop
- `src/__tests__/LineItemCard.test.jsx` — update for dynamic item types

---

### Task 1: Backend items store + CRUD API

**Files:**
- Create: `server/items/store.js`
- Create: `server/items/router.js`
- Create: `server/__tests__/items.test.js`
- Modify: `server/config.js`
- Modify: `server/index.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `GET /items`, `POST /items`, `PUT /items/:id`, `DELETE /items/:id`
- Produces: `readCatalog()` → `{ items: [] }`, `writeCatalog(data)` → void

- [ ] **Step 1: Add `ITEMS_CATALOG_FILE` to config and gitignore**

In `server/config.js`, add one line inside the exports:
```js
ITEMS_CATALOG_FILE: path.join(__dirname, 'items-catalog.json'),
```

Full updated file:
```js
require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: 3001,
  DESIGNS_CACHE_DIR: path.join(__dirname, '..', 'designs-cache'),
  ORDERS_CACHE_DIR: path.join(__dirname, '..', 'orders-cache'),
  TOKENS_FILE: path.join(__dirname, 'tokens.json'),
  SETTINGS_FILE: path.join(__dirname, 'settings.json'),
  ITEMS_CATALOG_FILE: path.join(__dirname, 'items-catalog.json'),
  DRIVE: {
    TOP_LEVEL_FOLDER: '1OYG9ThPfJI0x13080vqW6sIY3c9Us4wk',
    DESIGN_SOURCE: '1CVhEtQZ5hgEB0vM83Y9WfjIo55-ouQ66',
    ORDER_FOLDER: '1voehD5oSz0zjy0k_8Q-RoQ76Imq62dLV',
  },
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI: 'http://localhost:3001/auth/callback',
  },
};
```

In `.gitignore`, add after `server/settings.json`:
```
server/items-catalog.json
```

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/items.test.js`:
```js
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Use a temp file so tests don't touch the real catalog
const TEST_CATALOG = path.join(__dirname, 'items-catalog-test.json');
const realFile = config.ITEMS_CATALOG_FILE;

beforeEach(() => {
  config.ITEMS_CATALOG_FILE = TEST_CATALOG;
  if (fs.existsSync(TEST_CATALOG)) fs.unlinkSync(TEST_CATALOG);
});
afterEach(() => {
  config.ITEMS_CATALOG_FILE = realFile;
  if (fs.existsSync(TEST_CATALOG)) fs.unlinkSync(TEST_CATALOG);
});

// Must re-require app AFTER patching config
function getApp() {
  jest.resetModules();
  return require('../index');
}

test('GET /items returns empty catalog when no file exists', async () => {
  const app = getApp();
  const res = await request(app).get('/items');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [] });
});

test('POST /items creates an item with id and defaults', async () => {
  const app = getApp();
  const res = await request(app).post('/items').send({ name: 'Unisex Tee' });
  expect(res.status).toBe(200);
  expect(res.body.id).toBeTruthy();
  expect(res.body.name).toBe('Unisex Tee');
  expect(res.body.colors).toEqual([]);
  expect(res.body.sizes).toEqual([]);
  expect(res.body.decorationMethods).toEqual([]);
});

test('PUT /items/:id updates an item', async () => {
  const app = getApp();
  const create = await request(app).post('/items').send({ name: 'Sticker' });
  const id = create.body.id;
  const updated = { ...create.body, name: 'Premium Sticker' };
  const res = await request(app).put(`/items/${id}`).send(updated);
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Premium Sticker');
});

test('DELETE /items/:id removes the item', async () => {
  const app = getApp();
  const create = await request(app).post('/items').send({ name: 'Hat' });
  const id = create.body.id;
  await request(app).delete(`/items/${id}`);
  const res = await request(app).get('/items');
  expect(res.body.items.find(i => i.id === id)).toBeUndefined();
});

test('PUT /items/:id returns 404 for unknown id', async () => {
  const app = getApp();
  const res = await request(app).put('/items/nonexistent').send({ name: 'x' });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 3: Run test — expect failures**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: all 5 tests fail (module not found or 404 routes).

- [ ] **Step 4: Create `server/items/store.js`**

```js
const fs = require('fs');
const config = require('../config');

const DEFAULTS = { items: [] };

function readCatalog() {
  if (!fs.existsSync(config.ITEMS_CATALOG_FILE)) return { ...DEFAULTS, items: [] };
  try { return JSON.parse(fs.readFileSync(config.ITEMS_CATALOG_FILE, 'utf8')); }
  catch { return { ...DEFAULTS, items: [] }; }
}

function writeCatalog(data) {
  fs.writeFileSync(config.ITEMS_CATALOG_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readCatalog, writeCatalog };
```

- [ ] **Step 5: Create `server/items/router.js`**

```js
const express = require('express');
const { createId } = require('@paralleldrive/cuid2');
const requireAuth = require('../middleware/requireAuth');
const { readCatalog, writeCatalog } = require('./store');

const router = express.Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json(readCatalog());
});

router.post('/', (req, res) => {
  const { name = 'New Item' } = req.body;
  const catalog = readCatalog();
  const item = { id: createId(), name, supplierUrl: '', colors: [], sizes: [], decorationMethods: [] };
  catalog.items.push(item);
  writeCatalog(catalog);
  res.json(item);
});

// push and pull routes must come before /:id to avoid capture
router.post('/push', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 2' });
});

router.post('/pull', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 2' });
});

router.put('/:id', (req, res) => {
  const catalog = readCatalog();
  const idx = catalog.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  catalog.items[idx] = { ...req.body, id: req.params.id };
  writeCatalog(catalog);
  res.json(catalog.items[idx]);
});

router.delete('/:id', (req, res) => {
  const catalog = readCatalog();
  const before = catalog.items.length;
  catalog.items = catalog.items.filter(i => i.id !== req.params.id);
  if (catalog.items.length === before) return res.status(404).json({ error: 'Item not found' });
  writeCatalog(catalog);
  res.json({ ok: true });
});

router.post('/:id/scrape-colors', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 3' });
});

module.exports = router;
```

- [ ] **Step 6: Mount router in `server/index.js`**

Add after the settings line:
```js
app.use('/items', require('./items/router'));
```

- [ ] **Step 7: Run tests — expect pass**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: 5 passing. (Push/pull/scrape return 501 — not tested yet.)

- [ ] **Step 8: Commit**

```
git add server/config.js server/index.js server/items/store.js server/items/router.js server/__tests__/items.test.js .gitignore
git commit -m "feat: backend items catalog store and CRUD API"
```

---

### Task 2: Drive sync for item catalog

**Files:**
- Modify: `server/drive/client.js`
- Modify: `server/items/router.js`

**Interfaces:**
- Consumes: `findFileByName(name, parentId)` from `server/drive/client.js` (already exists)
- Produces: `uploadFileContent(name, content, parentId)` → `fileId` string
- Produces: `downloadFileContent(fileId)` → string
- Produces: `POST /items/push` → `{ ok: true }` or `{ error }`
- Produces: `POST /items/pull` → `{ items: [...] }` or `{ error }`

- [ ] **Step 1: Write failing tests for push/pull**

Append to `server/__tests__/items.test.js`:
```js
test('POST /items/push returns ok (mocked drive)', async () => {
  jest.mock('../drive/client', () => ({
    findFileByName: jest.fn().mockResolvedValue(null),
    uploadFileContent: jest.fn().mockResolvedValue('file-id-123'),
    downloadFileContent: jest.fn(),
    findFolderByName: jest.fn(),
  }));
  const app = getApp();
  await request(app).post('/items').send({ name: 'Tee' });
  const res = await request(app).post('/items/push');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('POST /items/pull returns error when no catalog on Drive', async () => {
  jest.mock('../drive/client', () => ({
    findFileByName: jest.fn().mockResolvedValue(null),
    uploadFileContent: jest.fn(),
    downloadFileContent: jest.fn(),
    findFolderByName: jest.fn(),
  }));
  const app = getApp();
  const res = await request(app).post('/items/pull');
  expect(res.status).toBe(200);
  expect(res.body.error).toMatch(/No catalog/i);
});
```

- [ ] **Step 2: Run — expect fail**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: the two new tests fail (501 responses).

- [ ] **Step 3: Add `uploadFileContent` and `downloadFileContent` to `server/drive/client.js`**

Append before `module.exports`:
```js
async function uploadFileContent(name, content, parentId) {
  const drive = getDrive();
  const existing = await findFileByName(name, parentId);
  const media = { mimeType: 'application/json', body: content };
  if (existing) {
    await drive.files.update({ fileId: existing.id, media });
    return existing.id;
  }
  const res = await drive.files.create({
    resource: { name, parents: [parentId] },
    media,
    fields: 'id',
  });
  return res.data.id;
}

async function downloadFileContent(fileId) {
  const drive = getDrive();
  const chunks = [];
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    res.data.on('data', chunk => chunks.push(chunk));
    res.data.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.data.on('error', reject);
  });
}
```

Add `uploadFileContent` and `downloadFileContent` to the `module.exports` object.

- [ ] **Step 4: Implement push/pull in `server/items/router.js`**

Replace the stub push/pull routes:
```js
const config = require('../config');
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');

const CATALOG_DRIVE_NAME = 'items-catalog.json';

router.post('/push', async (_req, res) => {
  try {
    const catalog = readCatalog();
    await uploadFileContent(CATALOG_DRIVE_NAME, JSON.stringify(catalog, null, 2), config.DRIVE.TOP_LEVEL_FOLDER);
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/pull', async (_req, res) => {
  try {
    const file = await findFileByName(CATALOG_DRIVE_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
    if (!file) return res.json({ error: 'No catalog found on Drive' });
    const content = await downloadFileContent(file.id);
    const catalog = JSON.parse(content);
    writeCatalog(catalog);
    res.json(catalog);
  } catch (err) {
    res.json({ error: err.message });
  }
});
```

Also add the `config` and drive client imports at the top of `router.js`:
```js
const config = require('../config');
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');
const CATALOG_DRIVE_NAME = 'items-catalog.json';
```

- [ ] **Step 5: Run tests — expect pass**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: all 7 tests passing.

- [ ] **Step 6: Commit**

```
git add server/drive/client.js server/items/router.js
git commit -m "feat: Drive push/pull sync for items catalog"
```

---

### Task 3: Color scraping endpoint

**Files:**
- Modify: `server/items/router.js`

**Interfaces:**
- Produces: `POST /items/:id/scrape-colors` → `{ added: N, skipped: N }` or `{ error: string }`

- [ ] **Step 1: Write failing test**

Append to `server/__tests__/items.test.js`:
```js
test('POST /items/:id/scrape-colors merges colors into inactive list', async () => {
  // Mock https fetch by injecting a local scraper helper
  jest.mock('../items/scrapeColors', () => ({
    scrapeColorsFromUrl: jest.fn().mockResolvedValue([
      { name: 'White', hex: '#ffffff' },
      { name: 'Black', hex: '#000000' },
    ]),
  }));
  const app = getApp();
  const created = await request(app).post('/items').send({ name: 'Tee' });
  const id = created.body.id;
  const res = await request(app).post(`/items/${id}/scrape-colors`);
  expect(res.status).toBe(200);
  expect(res.body.added).toBe(2);
  expect(res.body.skipped).toBe(0);
  // Re-fetch item and verify colors are inactive
  const catalog = await request(app).get('/items');
  const item = catalog.body.items.find(i => i.id === id);
  expect(item.colors).toHaveLength(2);
  expect(item.colors[0].active).toBe(false);
});
```

- [ ] **Step 2: Run — expect fail**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: new test fails (501 stub).

- [ ] **Step 3: Create `server/items/scrapeColors.js`**

```js
const https = require('https');
const http = require('http');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseColors(html) {
  const colors = [];
  const seen = new Set();

  // Pattern 1: data-color-name or data-color attributes
  const dataAttr = /data-color(?:-name)?="([^"]+)"/gi;
  let m;
  while ((m = dataAttr.exec(html)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      colors.push({ name, hex: null });
    }
  }

  // Pattern 2: common color swatch elements with title attributes
  const titleAttr = /class="[^"]*(?:color|swatch)[^"]*"[^>]*title="([^"]+)"/gi;
  while ((m = titleAttr.exec(html)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      colors.push({ name, hex: null });
    }
  }

  // Pattern 3: inline style background-color with adjacent text
  const bgHex = /background(?:-color)?:\s*(#[0-9a-f]{6})/gi;
  // (hex values alone are not useful without a name — skip)

  return colors;
}

async function scrapeColorsFromUrl(url) {
  if (!url) throw new Error('No supplier URL set for this item');
  const html = await fetchUrl(url);
  return parseColors(html);
}

module.exports = { scrapeColorsFromUrl };
```

- [ ] **Step 4: Implement scrape route in `server/items/router.js`**

Replace the scrape stub:
```js
const { scrapeColorsFromUrl } = require('./scrapeColors');

router.post('/:id/scrape-colors', async (req, res) => {
  const catalog = readCatalog();
  const item = catalog.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let scraped;
  try {
    scraped = await scrapeColorsFromUrl(item.supplierUrl);
  } catch (err) {
    return res.json({ error: err.message });
  }

  if (!scraped.length) return res.json({ error: 'Could not parse colors from this URL', added: 0, skipped: 0 });

  const existingNames = new Set(item.colors.map(c => c.name.toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const sc of scraped) {
    if (existingNames.has(sc.name.toLowerCase())) { skipped++; continue; }
    item.colors.push({ name: sc.name, hex: sc.hex || null, active: false });
    added++;
  }

  writeCatalog(catalog);
  res.json({ added, skipped });
});
```

- [ ] **Step 5: Run tests — expect pass**

```
cd server && npx jest __tests__/items.test.js --no-coverage
```

Expected: all 8 tests passing.

- [ ] **Step 6: Commit**

```
git add server/items/router.js server/items/scrapeColors.js
git commit -m "feat: color scraping endpoint for item supplier URLs"
```

---

### Task 4: Update Sheets + email for new data model

**Files:**
- Modify: `server/sheets/orderSheet.js`
- Modify: `server/gmail/emailBuilder.js`

**Interfaces:**
- `writeOrderToSheet` and `readOrderFromSheet` must handle both old format (fixed size cols) and new format (compact Sizes string + frontMethod/backMethod)
- New Line Items columns: `#`, `Item Type`, `Color`, `Sizes`, `Front Method`, `Front Notes`, `Back Method`, `Back Notes`
- Compact sizes format: `M×5, L×3` (zero quantities omitted, `×` as separator)

- [ ] **Step 1: Write failing tests for sheets**

Create `server/__tests__/orderSheet.test.js`:
```js
const { writeOrderToSheet, readOrderFromSheet } = require('../sheets/orderSheet');

// Mock the sheets client
jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  writeRange: jest.fn(),
  clearRange: jest.fn(),
  addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs']),
}));

const { readRange, writeRange, clearRange } = require('../sheets/client');

test('writeOrderToSheet writes compact sizes and methods', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();

  const order = {
    orderId: 'RMC-001-2026-06-28',
    orderName: 'Summer Drop',
    state: 'building',
    created: '2026-06-28',
    notes: 'All DTG',
    sheetId: 'sheet123',
    lineItems: [{
      num: '01',
      itemTypeId: 'abc',
      itemTypeName: 'Unisex Tee',
      color: 'White',
      sizes: { M: { total: 5, inventory: 0 }, L: { total: 3, inventory: 1 } },
      frontMethod: 'DTF',
      frontNotes: 'chest center',
      frontDesigns: [{ designNum: '1', file: 'logo.png' }],
      backMethod: '',
      backNotes: '',
      backDesigns: [],
    }],
  };

  await writeOrderToSheet('sheet123', order);

  // Find the Line Items writeRange call
  const liCall = writeRange.mock.calls.find(c => c[1].startsWith('Line Items'));
  const rows = liCall[2];
  expect(rows[0]).toEqual(['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes']);
  expect(rows[1][0]).toBe('01');
  expect(rows[1][1]).toBe('Unisex Tee');
  expect(rows[1][3]).toBe('M×5, L×3');
  expect(rows[1][4]).toBe('DTF');
});

test('readOrderFromSheet reads new format', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-001'],
      ['Order Name', 'Test'],
      ['State', 'building'],
      ['Created', '2026-06-28'],
      ['Last Updated', '2026-06-28'],
      ['Notes', 'Global note'],
      ['Sheet ID', 'sheet123'],
    ]);
    if (range.startsWith('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes'],
      ['01', 'Unisex Tee', 'White', 'M×5, L×3', 'DTF', 'chest', '', ''],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.lineItems[0].itemTypeName).toBe('Unisex Tee');
  expect(order.lineItems[0].sizes).toEqual({ M: { total: 5, inventory: 0 }, L: { total: 3, inventory: 0 } });
  expect(order.lineItems[0].frontMethod).toBe('DTF');
  expect(order.notes).toBe('Global note');
});
```

- [ ] **Step 2: Run — expect fail**

```
cd server && npx jest __tests__/orderSheet.test.js --no-coverage
```

Expected: both tests fail (old column format).

- [ ] **Step 3: Rewrite `server/sheets/orderSheet.js`**

```js
const { readRange, writeRange, clearRange, addSheet, getSheetNames } = require('./client');

function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => `${label}×${v.total}`)
    .join(', ');
}

function parseSizes(str) {
  const sizes = {};
  if (!str) return sizes;
  for (const part of str.split(',')) {
    const trimmed = part.trim();
    const m = trimmed.match(/^(.+?)×(\d+)$/);
    if (m) sizes[m[1]] = { total: parseInt(m[2], 10), inventory: 0 };
  }
  return sizes;
}

async function initOrderSheet(sheetId, orderData) {
  const existingNames = await getSheetNames(sheetId);
  if (!existingNames.includes('Line Items')) await addSheet(sheetId, 'Line Items');
  if (!existingNames.includes('Designs')) await addSheet(sheetId, 'Designs');
  await writeOrderToSheet(sheetId, orderData);
}

async function writeOrderToSheet(sheetId, orderData) {
  await clearRange(sheetId, 'Sheet1!A1:B10');
  await writeRange(sheetId, 'Sheet1!A1:B7', [
    ['Order ID',     orderData.orderId],
    ['Order Name',   orderData.orderName || ''],
    ['State',        orderData.state],
    ['Created',      orderData.created],
    ['Last Updated', new Date().toISOString().slice(0, 10)],
    ['Notes',        orderData.notes || ''],
    ['Sheet ID',     orderData.sheetId || ''],
  ]);

  await clearRange(sheetId, 'Line Items!A1:Z1000');
  const liHeader = ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes'];
  const liRows = [liHeader];
  for (const item of orderData.lineItems || []) {
    const invSizes = Object.entries(item.sizes || {}).filter(([, v]) => (v?.inventory ?? 0) > 0);
    liRows.push([
      item.num,
      item.itemTypeName || item.apparelType || '',
      item.color || '',
      formatSizes(item.sizes),
      item.frontMethod || '',
      item.frontNotes || '',
      item.backMethod || '',
      item.backNotes || '',
    ]);
    if (invSizes.length > 0) {
      const invStr = invSizes.map(([label, v]) => `${label}×${v.inventory}`).join(', ');
      liRows.push([`${item.num}-inv`, '(from stock)', '', invStr, '', '', '', '']);
    }
  }
  await writeRange(sheetId, 'Line Items!A1', liRows, 'RAW');

  await clearRange(sheetId, 'Designs!A1:Z1000');
  const dHeader = ['Line Item #', 'Design #', 'Design File', 'Placement'];
  const dRows = [dHeader];
  for (const item of orderData.lineItems || []) {
    for (const d of item.frontDesigns || []) dRows.push([item.num, d.designNum, d.file, 'Front']);
    for (const d of item.backDesigns || []) dRows.push([item.num, d.designNum, d.file, 'Back']);
  }
  await writeRange(sheetId, 'Designs!A1', dRows, 'RAW');
}

function isNewFormat(headerRow) {
  return Array.isArray(headerRow) && headerRow.includes('Sizes');
}

async function readOrderFromSheet(sheetId) {
  const info    = await readRange(sheetId, 'Sheet1!A1:B10');
  const infoMap = Object.fromEntries(info.map(([k, v]) => [k, v]));

  const allLiRows = await readRange(sheetId, 'Line Items!A1:Z1000');
  const [headerRow, ...liRows] = allLiRows;
  const newFmt = isNewFormat(headerRow);

  const lineItemsMap = {};
  for (const row of liRows) {
    if (!row[0]) continue;
    const num = row[0];
    if (num.endsWith('-inv')) {
      const baseNum = num.replace('-inv', '');
      if (lineItemsMap[baseNum] && newFmt) {
        const invSizes = parseSizes(row[3]);
        for (const [label, v] of Object.entries(invSizes)) {
          if (lineItemsMap[baseNum].sizes[label]) {
            lineItemsMap[baseNum].sizes[label].inventory = v.total;
          }
        }
      }
      continue;
    }
    if (newFmt) {
      const [num, itemTypeName, color, sizesStr, frontMethod, frontNotes, backMethod, backNotes] = row;
      lineItemsMap[num] = {
        num, itemTypeName, color,
        sizes: parseSizes(sizesStr),
        frontMethod: frontMethod || '', frontNotes: frontNotes || '',
        backMethod: backMethod || '', backNotes: backNotes || '',
        frontDesigns: [], backDesigns: [],
      };
    } else {
      // Legacy format: #, Apparel Type, Color, XS, S, M, L, XL, XXL, Front Notes, Back Notes
      const OLD_SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const [num, apparelType, color, ...rest] = row;
      const sizes = {};
      OLD_SIZE_COLS.forEach((s, i) => { sizes[s] = { total: parseInt(rest[i], 10) || 0, inventory: 0 }; });
      lineItemsMap[num] = {
        num, apparelType, color, sizes,
        frontMethod: '', frontNotes: rest[6] || '',
        backMethod: '', backNotes: rest[7] || '',
        frontDesigns: [], backDesigns: [],
      };
    }
  }

  const dRows = await readRange(sheetId, 'Designs!A2:D1000');
  for (const [lineItemNum, designNum, file, placement] of dRows) {
    if (lineItemsMap[lineItemNum]) {
      const arr = placement === 'Back' ? 'backDesigns' : 'frontDesigns';
      lineItemsMap[lineItemNum][arr].push({ designNum, file });
    }
  }

  return {
    orderId:     infoMap['Order ID']     || '',
    orderName:   infoMap['Order Name']   || '',
    state:       infoMap['State']        || 'building',
    created:     infoMap['Created']      || '',
    lastUpdated: infoMap['Last Updated'] || '',
    notes:       infoMap['Notes']        || '',
    sheetId:     infoMap['Sheet ID']     || sheetId,
    lineItems:   Object.values(lineItemsMap),
  };
}

module.exports = { initOrderSheet, writeOrderToSheet, readOrderFromSheet };
```

- [ ] **Step 4: Rewrite `server/gmail/emailBuilder.js`**

```js
function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => {
      const total   = v.total;
      const inv     = v.inventory ?? 0;
      const toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${label}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total)           return `${label}: ${total} (all from stock)`;
      return `${label}: ${total}`;
    })
    .join(', ');
}

function groupByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const cat = item.itemTypeName || item.apparelType || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function buildEmailHtml(orderData, _settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;

  let html = `<h2>${title}</h2>`;

  if (orderData.notes) {
    html += `<p><strong>Order Notes:</strong> ${orderData.notes}</p>`;
  }

  for (const [category, items] of Object.entries(groups)) {
    html += `<h3>${category}</h3><table border="1" cellpadding="6" cellspacing="0">`;
    html += '<tr><th>#</th><th>Color</th><th>Sizes</th><th>Front Method</th><th>Front Designs</th><th>Front Notes</th><th>Back Method</th><th>Back Designs</th><th>Back Notes</th></tr>';
    for (const item of items) {
      const frontList = (item.frontDesigns || []).map(d => d.file).join('<br>') || '—';
      const backList  = (item.backDesigns  || []).map(d => d.file).join('<br>') || '—';
      html += `<tr>
        <td>${item.num}</td>
        <td>${item.color || '—'}</td>
        <td>${formatSizes(item.sizes)}</td>
        <td>${item.frontMethod || '—'}</td>
        <td>${frontList}</td>
        <td>${item.frontNotes || ''}</td>
        <td>${item.backMethod || '—'}</td>
        <td>${backList}</td>
        <td>${item.backNotes || ''}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<p>📁 Design files: see order folder in Google Drive (Order ID: ${orderData.orderId})</p>`;
  return html;
}

function buildEmailPlainText(orderData, _settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;
  let text = `${title}\n\n`;

  if (orderData.notes) text += `Order Notes: ${orderData.notes}\n\n`;

  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      text += `• #${item.num} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
      const frontList = (item.frontDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.frontMethod) text += `  Front method: ${item.frontMethod}\n`;
      if (frontList) text += `  Front:\n${frontList}\n`;
      if (item.frontNotes) text += `  Front notes: ${item.frontNotes}\n`;
      const backList = (item.backDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.backMethod) text += `  Back method: ${item.backMethod}\n`;
      if (backList) text += `  Back:\n${backList}\n`;
      if (item.backNotes) text += `  Back notes: ${item.backNotes}\n`;
    }
    text += '\n';
  }
  text += `Design files: Order folder in Google Drive (${orderData.orderId})\n`;
  return text;
}

module.exports = { buildEmailHtml, buildEmailPlainText };
```

- [ ] **Step 5: Run tests**

```
cd server && npx jest --no-coverage
```

Expected: all backend tests passing including new orderSheet tests.

- [ ] **Step 6: Commit**

```
git add server/sheets/orderSheet.js server/gmail/emailBuilder.js server/__tests__/orderSheet.test.js
git commit -m "feat: update Sheets schema and email for dynamic sizes and decoration methods"
```

---

### Task 5: Frontend items API + useItems hook

**Files:**
- Create: `src/api/items.js`
- Create: `src/hooks/useItems.js`

**Interfaces:**
- Produces: `useItems()` → `{ catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive }`
- `catalog` shape: `{ items: [{ id, name, supplierUrl, colors, sizes, decorationMethods }] }`
- `updateItem(item)` debounces local → server sync at 400ms

- [ ] **Step 1: Create `src/api/items.js`**

```js
import { apiFetch } from './client';

export const getItems      = ()        => apiFetch('/items');
export const postItem      = (data)    => apiFetch('/items', { method: 'POST', body: data });
export const putItem       = (id, data)=> apiFetch(`/items/${id}`, { method: 'PUT', body: data });
export const deleteItem    = (id)      => apiFetch(`/items/${id}`, { method: 'DELETE' });
export const scrapeColors  = (id)      => apiFetch(`/items/${id}/scrape-colors`, { method: 'POST' });
export const pushCatalog   = ()        => apiFetch('/items/push', { method: 'POST' });
export const pullCatalog   = ()        => apiFetch('/items/pull', { method: 'POST' });
```

- [ ] **Step 2: Create `src/hooks/useItems.js`**

```js
import { useState, useEffect, useRef, useCallback } from 'react';
import { getItems, postItem, putItem, deleteItem as apiDelete, scrapeColors as apiScrape, pushCatalog, pullCatalog } from '../api/items';

export function useItems() {
  const [catalog, setCatalog] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef({});

  useEffect(() => {
    getItems().then(setCatalog).catch(console.error).finally(() => setLoading(false));
  }, []);

  const createItem = useCallback(async () => {
    const item = await postItem({ name: 'New Item' });
    setCatalog(prev => ({ ...prev, items: [...prev.items, item] }));
    return item;
  }, []);

  const updateItem = useCallback((updated) => {
    setCatalog(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === updated.id ? updated : i),
    }));
    clearTimeout(saveTimers.current[updated.id]);
    saveTimers.current[updated.id] = setTimeout(() => {
      putItem(updated.id, updated).catch(console.error);
    }, 400);
  }, []);

  const deleteItem = useCallback(async (id) => {
    await apiDelete(id);
    setCatalog(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  }, []);

  const scrapeColors = useCallback(async (id) => {
    const result = await apiScrape(id);
    if (!result.error) {
      const fresh = await getItems();
      setCatalog(fresh);
    }
    return result;
  }, []);

  const pushToDrive = useCallback(() => pushCatalog(), []);

  const pullFromDrive = useCallback(async () => {
    const result = await pullCatalog();
    if (!result.error) setCatalog(result);
    return result;
  }, []);

  return { catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive };
}
```

- [ ] **Step 3: No tests needed here** — `useItems` is a thin wrapper; coverage comes from component tests in Tasks 7–9.

- [ ] **Step 4: Commit**

```
git add src/api/items.js src/hooks/useItems.js
git commit -m "feat: frontend items API client and useItems hook"
```

---

### Task 6: ColorPicker component + color utils

**Files:**
- Create: `src/utils/colorUtils.js`
- Create: `src/components/ColorPicker.jsx`
- Create: `src/__tests__/colorUtils.test.js`

**Interfaces:**
- Produces: `hexToRgb(hex)` → `{r,g,b}|null`, `rgbToHex({r,g,b})` → `#rrggbb`
- Produces: `rgbToCmy({r,g,b})` → `{c,m,y}` (0–100), `cmyToRgb({c,m,y})` → `{r,g,b}`
- Produces: `<ColorPicker hex={string|null} onChange={fn} />` — renders inline, calls `onChange(hex|null)`

- [ ] **Step 1: Write failing tests for color utils**

Create `src/__tests__/colorUtils.test.js`:
```js
import { hexToRgb, rgbToHex, rgbToCmy, cmyToRgb } from '../utils/colorUtils';

test('hexToRgb parses #ffffff', () => {
  expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
});

test('hexToRgb parses without hash', () => {
  expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
});

test('hexToRgb returns null for invalid', () => {
  expect(hexToRgb('nope')).toBeNull();
});

test('rgbToHex produces lowercase hex', () => {
  expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
});

test('rgbToHex clamps values', () => {
  expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
});

test('rgbToCmy converts white', () => {
  expect(rgbToCmy({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0 });
});

test('rgbToCmy converts black', () => {
  expect(rgbToCmy({ r: 0, g: 0, b: 0 })).toEqual({ c: 100, m: 100, y: 100 });
});

test('cmyToRgb round-trips', () => {
  const rgb = { r: 128, g: 64, b: 200 };
  const cmy = rgbToCmy(rgb);
  const back = cmyToRgb(cmy);
  expect(back.r).toBeCloseTo(rgb.r, 0);
  expect(back.g).toBeCloseTo(rgb.g, 0);
  expect(back.b).toBeCloseTo(rgb.b, 0);
});
```

- [ ] **Step 2: Run — expect fail**

```
npx vitest run src/__tests__/colorUtils.test.js
```

Expected: fail (module not found).

- [ ] **Step 3: Create `src/utils/colorUtils.js`**

```js
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

export function rgbToCmy({ r, g, b }) {
  return {
    c: Math.round((1 - r / 255) * 100),
    m: Math.round((1 - g / 255) * 100),
    y: Math.round((1 - b / 255) * 100),
  };
}

export function cmyToRgb({ c, m, y }) {
  return {
    r: Math.round((1 - c / 100) * 255),
    g: Math.round((1 - m / 100) * 255),
    b: Math.round((1 - y / 100) * 255),
  };
}
```

- [ ] **Step 4: Run — expect pass**

```
npx vitest run src/__tests__/colorUtils.test.js
```

Expected: 8 passing.

- [ ] **Step 5: Create `src/components/ColorPicker.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { hexToRgb, rgbToHex, rgbToCmy, cmyToRgb } from '../utils/colorUtils';

export default function ColorPicker({ hex, onChange }) {
  const [hexInput, setHexInput] = useState(hex || '');
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [cmy, setCmy] = useState({ c: 0, m: 0, y: 0 });

  useEffect(() => {
    const parsed = hexToRgb(hex || '');
    if (parsed) {
      setHexInput(rgbToHex(parsed));
      setRgb(parsed);
      setCmy(rgbToCmy(parsed));
    } else {
      setHexInput('');
      setRgb({ r: 0, g: 0, b: 0 });
      setCmy({ c: 0, m: 0, y: 0 });
    }
  }, [hex]);

  function applyHex(raw) {
    setHexInput(raw);
    const parsed = hexToRgb(raw);
    if (parsed) {
      setRgb(parsed);
      setCmy(rgbToCmy(parsed));
      onChange(rgbToHex(parsed));
    }
  }

  function applyRgb(next) {
    setRgb(next);
    const h = rgbToHex(next);
    setHexInput(h);
    setCmy(rgbToCmy(next));
    onChange(h);
  }

  function applyCmy(next) {
    setCmy(next);
    const converted = cmyToRgb(next);
    setRgb(converted);
    const h = rgbToHex(converted);
    setHexInput(h);
    onChange(h);
  }

  const previewStyle = hex ? { background: hex } : { background: '#ccc' };

  return (
    <div className="color-picker">
      <div className="color-picker-preview" style={previewStyle} />
      <div className="color-picker-fields">
        <label>Hex
          <input
            value={hexInput}
            onChange={e => applyHex(e.target.value)}
            placeholder="#rrggbb"
            maxLength={7}
          />
        </label>
        <label>R <input type="number" min="0" max="255" value={rgb.r} onChange={e => applyRgb({ ...rgb, r: +e.target.value })} /></label>
        <label>G <input type="number" min="0" max="255" value={rgb.g} onChange={e => applyRgb({ ...rgb, g: +e.target.value })} /></label>
        <label>B <input type="number" min="0" max="255" value={rgb.b} onChange={e => applyRgb({ ...rgb, b: +e.target.value })} /></label>
        <label>C <input type="number" min="0" max="100" value={cmy.c} onChange={e => applyCmy({ ...cmy, c: +e.target.value })} /></label>
        <label>M <input type="number" min="0" max="100" value={cmy.m} onChange={e => applyCmy({ ...cmy, m: +e.target.value })} /></label>
        <label>Y <input type="number" min="0" max="100" value={cmy.y} onChange={e => applyCmy({ ...cmy, y: +e.target.value })} /></label>
        <button className="color-picker-clear" onClick={() => onChange(null)}>Clear swatch</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```
git add src/utils/colorUtils.js src/__tests__/colorUtils.test.js src/components/ColorPicker.jsx
git commit -m "feat: ColorPicker component with hex/RGB/CMY inputs"
```

---

### Task 7: Settings tabs + ItemsTab shell + CSS

**Files:**
- Modify: `src/components/SettingsScreen.jsx`
- Create: `src/components/ItemsTab.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `useItems()` from `src/hooks/useItems.js`
- `ItemsTab` renders item list (left) + item editor (right); color/size/method sub-sections added in Tasks 8–9

- [ ] **Step 1: Write failing test**

Append to `src/__tests__/OrderBuilder.test.jsx` (or create a new file `src/__tests__/SettingsScreen.test.jsx`):

Create `src/__tests__/SettingsScreen.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsScreen from '../components/SettingsScreen';

vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ brandName: '', spewEmail: '', defaultBackDesign: '', defaultBackNotes: '' }),
  saveSettings: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../api/auth', () => ({
  getAuthStatus: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('../api/items', () => ({
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  postItem: vi.fn(),
  putItem: vi.fn(),
  deleteItem: vi.fn(),
  scrapeColors: vi.fn(),
  pushCatalog: vi.fn(),
  pullCatalog: vi.fn(),
}));
vi.mock('../api/designs', () => ({
  listDesigns: vi.fn().mockResolvedValue([]),
  refreshDesigns: vi.fn().mockResolvedValue({}),
}));

test('Settings screen shows System and Items tabs', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
});

test('clicking Items tab shows item catalog UI', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  expect(screen.getByText(/Push to Drive/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect fail**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: both tests fail (no tab buttons).

- [ ] **Step 3: Update `src/components/SettingsScreen.jsx` to add tabs**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, saveSettings } from '../api/settings';
import { getAuthStatus, logout } from '../api/auth';
import DesignPicker from './DesignPicker';
import ItemsTab from './ItemsTab';
import Toast from './Toast';

export default function SettingsScreen() {
  const [tab, setTab] = useState('system');
  const [settings, setSettings] = useState({
    brandName: '',
    spewEmail: '',
    defaultBackDesign: '',
    defaultBackNotes: '',
  });
  const [email, setEmail] = useState(null);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAuthStatus().then(s => setEmail(s.email)).catch(console.error);
  }, []);

  async function handleSave() {
    try {
      await saveSettings(settings);
      setToast('Settings saved');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  function set(field) {
    return e => setSettings(s => ({ ...s, [field]: e.target.value }));
  }

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Settings</h2>

      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === 'system' ? ' active' : ''}`}
          onClick={() => setTab('system')}
        >System</button>
        <button
          className={`settings-tab${tab === 'items' ? ' active' : ''}`}
          onClick={() => setTab('items')}
        >Items</button>
      </div>

      {tab === 'system' && (
        <>
          <div className="field-group">
            <label>Brand Name (back-print reference)</label>
            <input value={settings.brandName} onChange={set('brandName')} />
          </div>
          <div className="field-group">
            <label>Spew Email Address</label>
            <input type="email" value={settings.spewEmail} onChange={set('spewEmail')} />
          </div>
          <div className="settings-section-label">Line Item Defaults</div>
          <div className="field-group">
            <label>Default Back Design</label>
            <DesignPicker
              value={settings.defaultBackDesign}
              onChange={val => setSettings(s => ({ ...s, defaultBackDesign: val }))}
            />
          </div>
          <div className="field-group">
            <label>Default Back Notes</label>
            <textarea
              value={settings.defaultBackNotes}
              onChange={set('defaultBackNotes')}
              placeholder="e.g. Center back, 3 inches below collar"
            />
          </div>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
          <div className="account-section">
            <p>Connected as: {email || 'Unknown'}</p>
            <button className="btn-secondary" onClick={handleLogout}>Sign out</button>
          </div>
        </>
      )}

      {tab === 'items' && <ItemsTab />}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/ItemsTab.jsx` (shell — colors/sizes/methods in later tasks)**

```jsx
import { useState } from 'react';
import { useItems } from '../hooks/useItems';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

export default function ItemsTab() {
  const { catalog, loading, createItem, updateItem, deleteItem, pushToDrive, pullFromDrive } = useItems();
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);

  const selectedItem = catalog.items.find(i => i.id === selectedId) || null;

  async function handleCreate() {
    const item = await createItem();
    setSelectedId(item.id);
  }

  async function handleDelete() {
    if (!selectedItem) return;
    await deleteItem(selectedItem.id);
    setSelectedId(null);
  }

  async function handlePush() {
    try {
      await pushToDrive();
      setToast('Pushed to Drive!');
    } catch (err) {
      setToast(`Push failed: ${err.message}`);
    }
  }

  async function handlePull() {
    try {
      const result = await pullFromDrive();
      if (result.error) { setToast(`Pull failed: ${result.error}`); return; }
      setToast('Pulled from Drive!');
      setSelectedId(null);
    } catch (err) {
      setToast(`Pull failed: ${err.message}`);
    }
  }

  function updateField(field, value) {
    if (!selectedItem) return;
    updateItem({ ...selectedItem, [field]: value });
  }

  if (loading) return <div className="loading">Loading catalog...</div>;

  return (
    <div className="items-tab">
      <div className="items-sync-bar">
        <button className="btn-secondary" onClick={handlePush}>Push to Drive</button>
        <button className="btn-secondary" onClick={() => setConfirmPull(true)}>Pull from Drive</button>
      </div>

      <div className="items-layout">
        <div className="items-list-panel">
          {catalog.items.map(item => (
            <div
              key={item.id}
              className={`items-list-row${selectedId === item.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              {item.name}
            </div>
          ))}
          <button className="btn-secondary items-new-btn" onClick={handleCreate}>+ New Item</button>
        </div>

        <div className="items-editor-panel">
          {!selectedItem ? (
            <p className="items-empty">Select an item to edit, or create a new one.</p>
          ) : (
            <>
              <div className="field-group">
                <label>Name</label>
                <input
                  value={selectedItem.name}
                  onChange={e => updateField('name', e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Supplier URL</label>
                <input
                  value={selectedItem.supplierUrl || ''}
                  onChange={e => updateField('supplierUrl', e.target.value)}
                  placeholder="https://supplier.com/product/..."
                />
              </div>
              {/* Colors, Sizes, Decoration Methods added in Tasks 8–9 */}
              <button className="btn-danger" onClick={handleDelete}>Delete Item</button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        message={confirmPull ? 'This will overwrite your local catalog with the Drive version. Continue?' : null}
        onConfirm={() => { setConfirmPull(false); handlePull(); }}
        onCancel={() => setConfirmPull(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
```

- [ ] **Step 5: Add CSS to `src/App.css`**

Append to the end of `src/App.css`:
```css
/* ===== Settings Tabs ===== */
.settings-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--border);
  margin-bottom: 24px;
}
.settings-tab {
  padding: 8px 20px;
  border: none;
  background: none;
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.settings-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.settings-tab:hover:not(.active) {
  color: var(--text-h);
}

/* ===== Items Tab ===== */
.items-sync-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.items-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 20px;
  min-height: 400px;
}
.items-list-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.items-list-row {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--text);
}
.items-list-row:last-of-type { border-bottom: none; }
.items-list-row:hover { background: var(--code-bg); }
.items-list-row.selected { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
.items-new-btn {
  margin: 10px;
  align-self: flex-start;
}
.items-editor-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.items-empty {
  color: var(--text);
  opacity: 0.5;
  font-style: italic;
}

/* ===== Active/Inactive Two-Column Lists ===== */
.active-inactive-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.active-inactive-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-h);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.active-inactive-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.active-inactive-col {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.active-inactive-col-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--steel);
  margin-bottom: 4px;
}
.ai-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.ai-row:hover { background: var(--code-bg); }
.ai-row-name { flex: 1; }
.ai-move-btn {
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: none;
  cursor: pointer;
  color: var(--text);
}
.ai-move-btn:hover { background: var(--accent-bg); border-color: var(--accent); }
.ai-add-row {
  margin-top: 4px;
  display: flex;
  gap: 4px;
}
.ai-add-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.ai-add-btn {
  padding: 4px 10px;
  font-size: 12px;
}
.drag-handle {
  cursor: grab;
  color: var(--steel);
  font-size: 14px;
  user-select: none;
}

/* ===== Color Swatches ===== */
.color-swatch {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  border: 1px solid var(--border);
  flex-shrink: 0;
  cursor: pointer;
  display: inline-block;
}
.color-swatch.no-color { background: #ccc; }

/* ===== Color Picker ===== */
.color-picker {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: white;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.color-picker-preview {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.color-picker-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.color-picker-fields label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text);
}
.color-picker-fields input[type="number"] {
  width: 56px;
  padding: 3px 6px;
  font-size: 12px;
}
.color-picker-fields input[type="text"] {
  width: 90px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: monospace;
}
.color-picker-clear {
  font-size: 11px;
  padding: 4px 8px;
  color: var(--steel);
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
}

/* ===== Scrape Colors button/result ===== */
.scrape-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.scrape-result {
  font-size: 12px;
  color: var(--steel);
}

/* ===== Order Notes ===== */
.order-notes {
  width: 100%;
  min-height: 56px;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  resize: vertical;
  margin: 0 24px;
  width: calc(100% - 48px);
  box-sizing: border-box;
  color: var(--text);
  background: white;
}
```

- [ ] **Step 6: Run tests**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: both tests passing.

- [ ] **Step 7: Commit**

```
git add src/components/SettingsScreen.jsx src/components/ItemsTab.jsx src/App.css
git commit -m "feat: Settings System/Items tabs and ItemsTab shell"
```

---

### Task 8: Colors section in ItemsTab

**Files:**
- Modify: `src/components/ItemsTab.jsx`

**Interfaces:**
- Consumes: `ColorPicker` from `src/components/ColorPicker.jsx`
- `item.colors` shape: `[{ name, hex, active }]`
- `updateItem({ ...item, colors: [...] })` triggers debounced save

- [ ] **Step 1: Write failing test**

Append to `src/__tests__/SettingsScreen.test.jsx`:
```jsx
import { getItems, postItem, putItem } from '../api/items';

test('clicking → on active color moves it to inactive', async () => {
  getItems.mockResolvedValue({
    items: [{
      id: 'item1', name: 'Tee', supplierUrl: '',
      colors: [{ name: 'White', hex: '#ffffff', active: true }],
      sizes: [], decorationMethods: [],
    }],
  });
  putItem.mockResolvedValue({});
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  await userEvent.click(await screen.findByText('Tee'));
  // The active column should show White with a → button
  const moveBtn = await screen.findByTitle('Move to inactive');
  await userEvent.click(moveBtn);
  expect(putItem).toHaveBeenCalledWith('item1', expect.objectContaining({
    colors: expect.arrayContaining([expect.objectContaining({ name: 'White', active: false })]),
  }));
});
```

- [ ] **Step 2: Run — expect fail**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: new test fails (no colors section rendered).

- [ ] **Step 3: Add colors section to `ItemsTab.jsx`**

Replace the `{/* Colors, Sizes, Decoration Methods added in Tasks 8–9 */}` comment with:

```jsx
import ColorPicker from './ColorPicker';
```
(add to imports at top of file)

Replace the comment in JSX:
```jsx
{/* Colors section */}
<div className="active-inactive-section">
  <div className="active-inactive-label">Colors</div>
  <div className="active-inactive-cols">
    <ColorColumn
      label="Active"
      colors={selectedItem.colors.filter(c => c.active)}
      onMove={(name) => moveColor(name, false)}
      onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
      moveLabel="Move to inactive"
      moveSymbol="→"
    />
    <ColorColumn
      label="Inactive"
      colors={selectedItem.colors.filter(c => !c.active)}
      onMove={(name) => moveColor(name, true)}
      onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
      moveLabel="Move to active"
      moveSymbol="←"
    />
  </div>
  <div className="ai-add-row">
    <input
      className="ai-add-input"
      placeholder="Color name..."
      id={`add-color-${selectedItem.id}`}
    />
    <button className="btn-secondary ai-add-btn" onClick={() => {
      const inp = document.getElementById(`add-color-${selectedItem.id}`);
      const name = inp.value.trim();
      if (!name || selectedItem.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
      inp.value = '';
      updateItem({ ...selectedItem, colors: [...selectedItem.colors, { name, hex: null, active: true }] });
    }}>Add</button>
  </div>
  {/* Scrape from URL */}
  <div className="scrape-row">
    <button className="btn-secondary" onClick={() => handleScrapeColors(selectedItem.id)}>
      Scrape Colors from URL
    </button>
    {scrapeResult && <span className="scrape-result">{scrapeResult}</span>}
  </div>
</div>
{/* Color picker open state managed per-color via expandedColor state */}
{expandedColor && (
  <div className="color-picker-popover">
    <ColorPicker
      hex={expandedColor.hex}
      onChange={(hex) => {
        changeColorSwatch(expandedColor.name, hex);
        setExpandedColor(prev => ({ ...prev, hex }));
      }}
    />
    <button onClick={() => setExpandedColor(null)}>Done</button>
  </div>
)}
```

Add the needed state and helper functions at the top of `ItemsTab`:
```jsx
const [expandedColor, setExpandedColor] = useState(null); // { name, hex }
const [scrapeResult, setScrapeResult] = useState(null);

function moveColor(name, makeActive) {
  if (!selectedItem) return;
  updateItem({
    ...selectedItem,
    colors: selectedItem.colors.map(c => c.name === name ? { ...c, active: makeActive } : c),
  });
}

function changeColorSwatch(name, hex) {
  if (!selectedItem) return;
  updateItem({
    ...selectedItem,
    colors: selectedItem.colors.map(c => c.name === name ? { ...c, hex } : c),
  });
}

async function handleScrapeColors(id) {
  setScrapeResult('Scraping...');
  try {
    const result = await scrapeColors(id);
    if (result.error) { setScrapeResult(`Error: ${result.error}`); return; }
    setScrapeResult(`Added ${result.added}, skipped ${result.skipped}`);
  } catch (err) {
    setScrapeResult(`Error: ${err.message}`);
  }
}
```

Add `scrapeColors` to the destructured `useItems()` call at the top of `ItemsTab`.

Create the `ColorColumn` component **inside** `ItemsTab.jsx` (it's not used anywhere else):
```jsx
function ColorColumn({ label, colors, onMove, onSwatchChange, moveLabel, moveSymbol }) {
  return (
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">{label}</div>
      {colors.map(c => (
        <div key={c.name} className="ai-row">
          <span
            className={`color-swatch${c.hex ? '' : ' no-color'}`}
            style={c.hex ? { background: c.hex } : {}}
            onClick={() => onSwatchChange(c.name, c.hex)}
            title="Edit swatch"
          />
          <span className="ai-row-name">{c.name}</span>
          <button className="ai-move-btn" title={moveLabel} onClick={() => onMove(c.name)}>
            {moveSymbol}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```
git add src/components/ItemsTab.jsx
git commit -m "feat: colors active/inactive section in ItemsTab with swatch picker"
```

---

### Task 9: Sizes + Decoration Methods + Drive sync in ItemsTab

**Files:**
- Modify: `src/components/ItemsTab.jsx`

**Interfaces:**
- `item.sizes` shape: `[{ label, active, order }]`
- `item.decorationMethods` shape: `[{ name, active }]`
- Sizes active list supports drag reorder via HTML5 drag API

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/SettingsScreen.test.jsx`:
```jsx
test('clicking → on active size moves it to inactive', async () => {
  getItems.mockResolvedValue({
    items: [{
      id: 'item1', name: 'Tee', supplierUrl: '', colors: [],
      sizes: [{ label: 'M', active: true, order: 0 }],
      decorationMethods: [],
    }],
  });
  putItem.mockResolvedValue({});
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  await userEvent.click(await screen.findByText('Tee'));
  const moveBtn = await screen.findByTitle('Move size to inactive');
  await userEvent.click(moveBtn);
  expect(putItem).toHaveBeenCalledWith('item1', expect.objectContaining({
    sizes: expect.arrayContaining([expect.objectContaining({ label: 'M', active: false })]),
  }));
});
```

- [ ] **Step 2: Run — expect fail**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: new test fails.

- [ ] **Step 3: Add sizes and decoration methods sections to `ItemsTab.jsx`**

After the colors section JSX and before `<button className="btn-danger">`, add:

```jsx
{/* Sizes section */}
<div className="active-inactive-section">
  <div className="active-inactive-label">Sizes</div>
  <div className="active-inactive-cols">
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">Active (drag to reorder)</div>
      {[...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order).map((s, idx, arr) => (
        <div
          key={s.label}
          className="ai-row"
          draggable
          onDragStart={() => { dragSizeIdx.current = idx; }}
          onDragOver={e => e.preventDefault()}
          onDrop={() => reorderSize(idx)}
        >
          <span className="drag-handle">⠿</span>
          <span className="ai-row-name">{s.label}</span>
          <button className="ai-move-btn" title="Move size to inactive" onClick={() => moveSize(s.label, false)}>→</button>
        </div>
      ))}
      <div className="ai-add-row">
        <input className="ai-add-input" placeholder="Label..." id={`add-size-${selectedItem.id}`} />
        <button className="btn-secondary ai-add-btn" onClick={() => {
          const inp = document.getElementById(`add-size-${selectedItem.id}`);
          const label = inp.value.trim();
          if (!label || selectedItem.sizes.find(s => s.label === label)) return;
          inp.value = '';
          const maxOrder = Math.max(-1, ...selectedItem.sizes.filter(s => s.active).map(s => s.order));
          updateItem({ ...selectedItem, sizes: [...selectedItem.sizes, { label, active: true, order: maxOrder + 1 }] });
        }}>Add</button>
      </div>
    </div>
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">Inactive</div>
      {selectedItem.sizes.filter(s => !s.active).map(s => (
        <div key={s.label} className="ai-row">
          <span className="ai-row-name">{s.label}</span>
          <button className="ai-move-btn" title="Move size to active" onClick={() => moveSize(s.label, true)}>←</button>
        </div>
      ))}
    </div>
  </div>
</div>

{/* Decoration Methods section */}
<div className="active-inactive-section">
  <div className="active-inactive-label">Decoration Methods</div>
  <div className="active-inactive-cols">
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">Active</div>
      {selectedItem.decorationMethods.filter(m => m.active).map(m => (
        <div key={m.name} className="ai-row">
          <span className="ai-row-name">{m.name}</span>
          <button className="ai-move-btn" title="Move to inactive" onClick={() => moveMethod(m.name, false)}>→</button>
        </div>
      ))}
      <div className="ai-add-row">
        <input className="ai-add-input" placeholder="Method name..." id={`add-method-${selectedItem.id}`} />
        <button className="btn-secondary ai-add-btn" onClick={() => {
          const inp = document.getElementById(`add-method-${selectedItem.id}`);
          const name = inp.value.trim();
          if (!name || selectedItem.decorationMethods.find(m => m.name === name)) return;
          inp.value = '';
          updateItem({ ...selectedItem, decorationMethods: [...selectedItem.decorationMethods, { name, active: true }] });
        }}>Add</button>
      </div>
    </div>
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">Inactive</div>
      {selectedItem.decorationMethods.filter(m => !m.active).map(m => (
        <div key={m.name} className="ai-row">
          <span className="ai-row-name">{m.name}</span>
          <button className="ai-move-btn" title="Move to active" onClick={() => moveMethod(m.name, true)}>←</button>
        </div>
      ))}
    </div>
  </div>
</div>
```

Add state and helpers at the top of `ItemsTab`:
```jsx
const dragSizeIdx = useRef(null);

function moveSize(label, makeActive) {
  if (!selectedItem) return;
  const activeSizes = selectedItem.sizes.filter(s => s.active && s.label !== label).sort((a, b) => a.order - b.order);
  const maxOrder = activeSizes.length > 0 ? Math.max(...activeSizes.map(s => s.order)) : -1;
  updateItem({
    ...selectedItem,
    sizes: selectedItem.sizes.map(s => s.label === label
      ? { ...s, active: makeActive, order: makeActive ? maxOrder + 1 : s.order }
      : s
    ),
  });
}

function reorderSize(dropIdx) {
  if (!selectedItem || dragSizeIdx.current === null) return;
  const fromIdx = dragSizeIdx.current;
  dragSizeIdx.current = null;
  if (fromIdx === dropIdx) return;
  const active = [...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order);
  const [moved] = active.splice(fromIdx, 1);
  active.splice(dropIdx, 0, moved);
  const reordered = active.map((s, i) => ({ ...s, order: i }));
  updateItem({
    ...selectedItem,
    sizes: selectedItem.sizes.map(s => {
      const found = reordered.find(r => r.label === s.label);
      return found || s;
    }),
  });
}

function moveMethod(name, makeActive) {
  if (!selectedItem) return;
  updateItem({
    ...selectedItem,
    decorationMethods: selectedItem.decorationMethods.map(m =>
      m.name === name ? { ...m, active: makeActive } : m
    ),
  });
}
```

Add `useRef` to `ItemsTab` imports:
```jsx
import { useState, useRef } from 'react';
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/__tests__/SettingsScreen.test.jsx
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```
git add src/components/ItemsTab.jsx
git commit -m "feat: sizes drag-reorder and decoration methods in ItemsTab"
```

---

### Task 10: Dynamic SizeButtons

**Files:**
- Modify: `src/components/SizeButtons.jsx`
- Modify: `src/__tests__/SizeButtons.test.jsx`

**Interfaces:**
- `<SizeButtons sizeLabels={['M', 'L', 'XL']} sizes={...} onChange={...} />`
- `sizeLabels` replaces hardcoded `SIZES` array; behavior otherwise identical

- [ ] **Step 1: Update the test first**

Replace `src/__tests__/SizeButtons.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SizeButtons from '../components/SizeButtons';

const LABELS = ['S', 'M', 'L'];

test('clicking + increments total for a size label', async () => {
  const onChange = vi.fn();
  render(<SizeButtons sizeLabels={LABELS} sizes={{}} onChange={onChange} />);
  const plusButtons = screen.getAllByText('+');
  // First + is for 'S' (index 0)
  await userEvent.click(plusButtons[0]);
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ S: { total: 1, inventory: 0 } }));
});

test('inventory cannot exceed total', async () => {
  const onChange = vi.fn();
  const sizes = { M: { total: 2, inventory: 2 } };
  render(<SizeButtons sizeLabels={LABELS} sizes={sizes} onChange={onChange} />);
  // With M total=2 inventory=2, the inv + button should be disabled
  // The inv + appears after the size + buttons; find by context
  const allPlus = screen.getAllByText('+');
  // allPlus: [S+, M+, L+, M-inv+]  — M-inv+ should be disabled
  const invPlus = allPlus[allPlus.length - 1];
  expect(invPlus).toBeDisabled();
});

test('renders all provided size labels', () => {
  render(<SizeButtons sizeLabels={['XS', 'S', 'M', 'L', 'XL', '2XL']} sizes={{}} onChange={vi.fn()} />);
  expect(screen.getByText('XS')).toBeInTheDocument();
  expect(screen.getByText('2XL')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect fail on 'renders all provided size labels' (old hardcoded list)**

```
npx vitest run src/__tests__/SizeButtons.test.jsx
```

Expected: 'renders all provided size labels' fails (component doesn't accept `sizeLabels`).

- [ ] **Step 3: Update `src/components/SizeButtons.jsx`**

```jsx
export default function SizeButtons({ sizeLabels = [], sizes = {}, onChange }) {
  function getVal(size, key) {
    return sizes[size]?.[key] ?? 0;
  }

  function setTotal(size, rawValue) {
    const next = Math.max(0, parseInt(rawValue, 10) || 0);
    const inv = Math.min(getVal(size, 'inventory'), next);
    onChange({ ...sizes, [size]: { total: next, inventory: inv } });
  }

  function adjustInv(size, delta) {
    const total = getVal(size, 'total');
    const next = Math.max(0, Math.min(total, getVal(size, 'inventory') + delta));
    onChange({ ...sizes, [size]: { total, inventory: next } });
  }

  return (
    <div className="size-buttons">
      {sizeLabels.map(size => {
        const total = getVal(size, 'total');
        const inv   = getVal(size, 'inventory');
        return (
          <div key={size} className={`size-row${total > 0 ? ' active' : ''}`}>
            <span className="size-label">{size}</span>
            <div className="size-total-row">
              <button
                className="size-adj"
                onClick={() => setTotal(size, total - 1)}
                disabled={total === 0}
              >−</button>
              <input
                className="size-input"
                type="number"
                min="0"
                value={total || ''}
                placeholder="0"
                onChange={e => setTotal(size, e.target.value)}
              />
              <button
                className="size-adj"
                onClick={() => setTotal(size, total + 1)}
              >+</button>
            </div>
            {total > 0 && (
              <div className="size-inv-row">
                <span className="inv-label">inv</span>
                <button
                  className="size-adj"
                  onClick={() => adjustInv(size, -1)}
                  disabled={inv === 0}
                >−</button>
                <span className="inv-count">{inv}</span>
                <button
                  className="size-adj"
                  onClick={() => adjustInv(size, 1)}
                  disabled={inv >= total}
                >+</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```
npx vitest run src/__tests__/SizeButtons.test.jsx
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```
git add src/components/SizeButtons.jsx src/__tests__/SizeButtons.test.jsx
git commit -m "feat: SizeButtons accepts dynamic sizeLabels prop"
```

---

### Task 11: Dynamic LineItemCard

**Files:**
- Modify: `src/components/LineItemCard.jsx`
- Modify: `src/__tests__/LineItemCard.test.jsx`

**Interfaces:**
- Consumes: `items` prop — array of item objects from catalog
- `item.itemTypeId`, `item.itemTypeName`, `item.frontMethod`, `item.backMethod` — new fields
- Legacy: if `!item.itemTypeId && item.apparelType`, show read-only apparel type text

- [ ] **Step 1: Update LineItemCard test**

Replace `src/__tests__/LineItemCard.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemCard from '../components/LineItemCard';

const CATALOG_ITEMS = [{
  id: 'item1',
  name: 'Unisex Tee',
  colors: [
    { name: 'White', hex: '#ffffff', active: true },
    { name: 'Black', hex: '#000000', active: true },
  ],
  sizes: [
    { label: 'M', active: true, order: 0 },
    { label: 'L', active: true, order: 1 },
  ],
  decorationMethods: [{ name: 'DTF', active: true }, { name: 'Screen Print', active: true }],
}];

const BASE_ITEM = {
  num: '01', itemTypeId: '', itemTypeName: '', color: '', sizes: {},
  frontDesigns: [], frontNotes: '', frontMethod: '',
  backDesigns: [], backNotes: '', backMethod: '',
};

test('selecting item type stores itemTypeId and itemTypeName', async () => {
  const onChange = vi.fn();
  render(<LineItemCard item={BASE_ITEM} items={CATALOG_ITEMS} onChange={onChange} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.selectOptions(screen.getByRole('combobox'), 'item1');
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    itemTypeId: 'item1',
    itemTypeName: 'Unisex Tee',
  }));
});

test('active colors render as buttons after item type selected', async () => {
  const item = { ...BASE_ITEM, itemTypeId: 'item1', itemTypeName: 'Unisex Tee' };
  render(<LineItemCard item={item} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  expect(screen.getByText('White')).toBeInTheDocument();
  expect(screen.getByText('Black')).toBeInTheDocument();
});

test('shows confirm dialog before removing', async () => {
  render(<LineItemCard item={BASE_ITEM} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Remove'));
  expect(screen.getByText('Remove this line item?')).toBeInTheDocument();
});

test('legacy item with apparelType shows read-only type name', () => {
  const legacyItem = { ...BASE_ITEM, apparelType: 'Youth', itemTypeId: undefined };
  render(<LineItemCard item={legacyItem} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  expect(screen.getByText(/Youth/)).toBeInTheDocument();
  expect(screen.getByText(/Select an item type/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect failures**

```
npx vitest run src/__tests__/LineItemCard.test.jsx
```

Expected: 3 of 4 tests fail (no `items` prop, no `itemTypeId` handling).

- [ ] **Step 3: Rewrite `src/components/LineItemCard.jsx`**

```jsx
import { useState } from 'react';
import SizeButtons from './SizeButtons';
import ConfirmDialog from './ConfirmDialog';

export default function LineItemCard({ item, items = [], onChange, onRemove, onAddDesign }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const selectedCatalogItem = items.find(i => i.id === item.itemTypeId) || null;
  const activeColors   = selectedCatalogItem?.colors.filter(c => c.active) || [];
  const activeSizes    = selectedCatalogItem?.sizes.filter(s => s.active).sort((a, b) => a.order - b.order).map(s => s.label) || [];
  const activeMethods  = selectedCatalogItem?.decorationMethods.filter(m => m.active) || [];
  const isLegacy       = !item.itemTypeId && !!item.apparelType;

  function update(field, value) {
    onChange({ ...item, [field]: value });
  }

  function selectItemType(e) {
    const id = e.target.value;
    const catalogItem = items.find(i => i.id === id);
    onChange({
      ...item,
      itemTypeId: id,
      itemTypeName: catalogItem?.name || '',
      color: '',
      sizes: {},
      frontMethod: '',
      backMethod: '',
    });
  }

  function removeDesign(placement, idx) {
    const field = placement === 'front' ? 'frontDesigns' : 'backDesigns';
    update(field, (item[field] || []).filter((_, i) => i !== idx));
  }

  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="line-item-num">#{item.num}</span>
        <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
      </div>

      {/* Item Type */}
      <div className="field-group">
        <div className="field-section-header">Item Type</div>
        {isLegacy ? (
          <p className="legacy-item-note">
            <strong>{item.apparelType}</strong> — Select an item type from the catalog to continue editing.
          </p>
        ) : (
          <select value={item.itemTypeId || ''} onChange={selectItemType}>
            <option value="">— select item type —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
        {items.length === 0 && !isLegacy && (
          <p className="items-empty-note">No items configured — add items in Settings.</p>
        )}
      </div>

      {/* Color */}
      <div className="field-group">
        <div className="field-section-header">Color</div>
        {activeColors.length > 0 ? (
          <div className="btn-group">
            {activeColors.map(c => (
              <button
                key={c.name}
                className={item.color === c.name ? 'active' : ''}
                onClick={() => update('color', c.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  className={`color-swatch${c.hex ? '' : ' no-color'}`}
                  style={c.hex ? { background: c.hex } : {}}
                />
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="field-placeholder">{item.itemTypeId ? 'No active colors — configure in Settings.' : 'Select an item type first.'}</p>
        )}
      </div>

      {/* Sizes */}
      <div className="field-group">
        <div className="field-section-header">Sizes</div>
        {activeSizes.length > 0 ? (
          <SizeButtons
            sizeLabels={activeSizes}
            sizes={item.sizes}
            onChange={sizes => update('sizes', sizes)}
          />
        ) : (
          <p className="field-placeholder">{item.itemTypeId ? 'No active sizes — configure in Settings.' : 'Select an item type first.'}</p>
        )}
      </div>

      {/* Front placement */}
      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Front</span>
          <button onClick={() => onAddDesign('front')}>+ Add Design</button>
        </div>
        <div className="field-group">
          <label>Decoration Method</label>
          <select value={item.frontMethod || ''} onChange={e => update('frontMethod', e.target.value)}>
            <option value="">— see order notes —</option>
            {activeMethods.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        {(item.frontDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <img className="design-row-thumb" src={`http://localhost:3001/designs-cache/${d.file}`} alt={d.file} />
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('front', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.frontNotes || ''}
          onChange={e => update('frontNotes', e.target.value)}
          placeholder="Front placement notes..."
        />
      </div>

      {/* Back placement */}
      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Back</span>
          <button onClick={() => onAddDesign('back')}>+ Add Design</button>
        </div>
        <div className="field-group">
          <label>Decoration Method</label>
          <select value={item.backMethod || ''} onChange={e => update('backMethod', e.target.value)}>
            <option value="">— see order notes —</option>
            {activeMethods.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        {(item.backDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <img className="design-row-thumb" src={`http://localhost:3001/designs-cache/${d.file}`} alt={d.file} />
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('back', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.backNotes || ''}
          onChange={e => update('backNotes', e.target.value)}
          placeholder="Back placement notes..."
        />
      </div>

      <ConfirmDialog
        message={confirmRemove ? 'Remove this line item?' : null}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for new elements in App.css**

Append to `src/App.css`:
```css
.legacy-item-note {
  font-size: 13px;
  color: var(--steel);
  margin: 4px 0;
}
.items-empty-note {
  font-size: 13px;
  color: var(--steel);
  font-style: italic;
}
.field-placeholder {
  font-size: 13px;
  color: var(--steel);
  font-style: italic;
  margin: 4px 0;
}
```

- [ ] **Step 5: Run tests — expect pass**

```
npx vitest run src/__tests__/LineItemCard.test.jsx
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```
git add src/components/LineItemCard.jsx src/__tests__/LineItemCard.test.jsx src/App.css
git commit -m "feat: dynamic LineItemCard driven by item catalog"
```

---

### Task 12: OrderBuilder wiring + global order notes

**Files:**
- Modify: `src/components/OrderBuilder.jsx`

**Interfaces:**
- Consumes: `useItems()` from `src/hooks/useItems.js`
- Global notes textarea bound to `order.notes`
- `addLineItem()` initializes `itemTypeId: '', itemTypeName: '', frontMethod: '', backMethod: ''`
- Each `LineItemCard` receives `items={catalog.items}`

- [ ] **Step 1: Write failing test**

Append to `src/__tests__/OrderBuilder.test.jsx`. First check what mocks are already there and add:
```jsx
vi.mock('../hooks/useItems', () => ({
  useItems: () => ({
    catalog: { items: [] },
    loading: false,
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    scrapeColors: vi.fn(),
    pushToDrive: vi.fn(),
    pullFromDrive: vi.fn(),
  }),
}));
```

Then add a test:
```jsx
test('order notes textarea is rendered', async () => {
  // Assumes existing OrderBuilder test setup provides a mock order
  // (check existing mocks in this file and ensure order.notes exists)
  render(/* existing render setup from this file */);
  expect(screen.getByPlaceholderText(/Order notes/i)).toBeInTheDocument();
});
```

> **Note:** Read the existing `src/__tests__/OrderBuilder.test.jsx` before writing this step to understand the existing mock setup, then fit the `useItems` mock and the new test into the existing structure without breaking existing tests.

- [ ] **Step 2: Run existing tests — verify they still pass before changes**

```
npx vitest run src/__tests__/OrderBuilder.test.jsx
```

Record passing count.

- [ ] **Step 3: Update `src/components/OrderBuilder.jsx`**

Add import:
```jsx
import { useItems } from '../hooks/useItems';
```

Add to the hook call section (after existing hooks):
```jsx
const { catalog } = useItems();
```

Add `saveNow` to the `useOrder` destructure (already present from earlier work):
```jsx
const { order, setOrder, saving, offline, syncPending, saveNow } = useOrder(sheetId);
```

Update `addLineItem()` to initialize new fields:
```jsx
function addLineItem() {
  const num = nextLineItemNum(order.lineItems);
  const { defaultBackDesign, defaultBackNotes } = settingsRef.current;
  setOrder(prev => ({
    ...prev,
    lineItems: [...prev.lineItems, {
      num,
      itemTypeId: '',
      itemTypeName: '',
      color: '',
      sizes: {},
      frontDesigns: [],
      frontNotes: '',
      frontMethod: '',
      backDesigns: defaultBackDesign ? [{ designNum: '1', file: defaultBackDesign }] : [],
      backNotes: defaultBackNotes || '',
      backMethod: '',
    }],
  }));
}
```

Add the global notes textarea after `<OrderTopBar .../>` and before `<div className="builder-body">`:
```jsx
<textarea
  className="order-notes"
  value={order.notes || ''}
  onChange={e => setOrder(prev => ({ ...prev, notes: e.target.value }))}
  placeholder="Order notes — e.g. All shirts DTG unless noted per placement"
/>
```

Add `items={catalog.items}` to each `<LineItemCard>`:
```jsx
<LineItemCard
  key={item.num}
  item={item}
  items={catalog.items}
  onChange={updated => updateLineItem(item.num, updated)}
  onRemove={() => removeLineItem(item.num)}
  onAddDesign={(placement) => setSelectingDesign({ num: item.num, placement })}
/>
```

- [ ] **Step 4: Run all frontend tests**

```
npx vitest run
```

Expected: all tests passing (or more than before — verify no regressions).

- [ ] **Step 5: Run all backend tests**

```
cd server && npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 6: Commit**

```
git add src/components/OrderBuilder.jsx
git commit -m "feat: wire useItems into OrderBuilder, add global order notes textarea"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `server/items-catalog.json` data model with colors/hex/active, sizes/label/active/order, decorationMethods/name/active
- ✅ CRUD endpoints (GET, POST, PUT, DELETE)
- ✅ Drive push/pull (`uploadFileContent`, `downloadFileContent` added to drive client)
- ✅ Color scraping (`scrapeColorsFromUrl` in `server/items/scrapeColors.js`)
- ✅ Scraped colors → inactive by default
- ✅ Sheets: new format (compact sizes string, frontMethod/backMethod, Item Type column), legacy read
- ✅ Email: order notes at top, compact sizes, decoration methods per placement
- ✅ Settings System/Items tabs
- ✅ Item editor: name, URL, scrape button
- ✅ Colors: active/inactive two-column, swatch, color picker (hex/RGB/CMY), add manually
- ✅ Sizes: active/inactive, drag reorder in active, add freeform
- ✅ Decoration methods: active/inactive, add manually
- ✅ Drive sync: Push/Pull buttons + confirmation dialog for Pull
- ✅ Auto-save on item changes (debounced 400ms in `useItems.updateItem`)
- ✅ Order builder: dynamic item type dropdown, active colors with swatches, dynamic SizeButtons, decoration method dropdowns per placement
- ✅ Legacy orders with `apparelType` show read-only text + prompt
- ✅ Global order notes textarea in OrderBuilder
- ✅ `items-catalog.json` in `.gitignore`
- ✅ `itemTypeName` stored as snapshot alongside `itemTypeId`

**Placeholder scan:** No TBDs, TODOs, or incomplete steps found.

**Type consistency:** `item.itemTypeId`/`item.itemTypeName` used consistently in Task 11 LineItemCard, Task 12 OrderBuilder, and Task 4 sheets/email. `sizeLabels` prop name used consistently in Tasks 10 and 11. `frontMethod`/`backMethod` used consistently across Tasks 4, 11, 12.
