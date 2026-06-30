const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet } = require('../sheets/orderSheet');
const { readOrderCache } = require('../orders/cache');
const { readSettings } = require('../settings/store');
const { readCatalog } = require('../items/store');
const { buildEmailHtml, buildEmailPlainText } = require('./emailBuilder');
const { upsertDraft } = require('./client');
const { listFiles, findFileByName, findFolderByName, copyFile } = require('../drive/client');
const { readRange } = require('../sheets/client');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.post('/draft', async (req, res) => {
  const { sheetId, draftId: existingDraftId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  try {
    // Read order — cache first so email reflects latest saved data
    let orderData;
    try {
      const meta = await readRange(sheetId, 'Sheet1!A1:B10');
      const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
      const orderId = infoMap['Order ID'] || '';
      if (orderId) orderData = readOrderCache(orderId);
    } catch { /* fall through */ }
    if (!orderData) orderData = await readOrderFromSheet(sheetId);

    const settings = readSettings();
    const catalog = readCatalog();
    const catalogByName = Object.fromEntries(
      catalog.items.map(i => [i.name.toLowerCase(), i])
    );
    if (!settings.spewEmail) return res.status(400).json({ error: 'Spew email not configured in settings' });

    // Copy design files to order's Designs subfolder in Drive
    const orderFolder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
    if (orderFolder) {
      const designsFolder = await findFolderByName('Designs', orderFolder.id);
      if (designsFolder) {
        const sourceFiles = await listFiles(config.DRIVE.DESIGN_SOURCE);
        const sourceMap = Object.fromEntries(sourceFiles.map(f => [f.name, f.id]));

        // Collect unique design files and their designNum (first occurrence)
        const designNumMap = {};
        for (const li of orderData.lineItems) {
          for (const d of [...(li.frontDesigns || []), ...(li.backDesigns || [])]) {
            if (!designNumMap[d.file]) {
              designNumMap[d.file] = d.designNum;
            }
          }
        }

        for (const [file, designNum] of Object.entries(designNumMap)) {
          const sourceId = sourceMap[file];
          if (sourceId) {
            const num = String(designNum).padStart(2, '0');
            const destName = `${num}-${file}`;
            await copyFile(sourceId, destName, designsFolder.id).catch(err =>
              console.warn(`Could not copy ${file}:`, err.message)
            );
          }
        }
      }
    }

    const subject = orderData.orderName
      ? `RMC Order: ${orderData.orderName}`
      : `${orderData.orderId} — Order Request`;
    const html = buildEmailHtml(orderData, settings, catalogByName);
    const plain = buildEmailPlainText(orderData, settings, catalogByName);
    const draftId = await upsertDraft(settings.spewEmail, subject, html, plain, existingDraftId || null);
    res.json({ draftId });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('gmail.googleapis.com') && msg.includes('disabled')) {
      return res.status(500).json({ error: 'Gmail API is not enabled for this Google Cloud project. Enable it at console.developers.google.com → APIs & Services → Gmail API, then try again.' });
    }
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
