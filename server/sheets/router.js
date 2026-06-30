const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache, readOrderCache } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { findFileByName, uploadFileContent, downloadFileContent, createFolder } = require('../drive/client');
const fs = require('fs');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    const order = await readOrderFromSheet(req.params.sheetId);

    // Prefer full-fidelity Drive JSON if it exists
    if (order.orderId) {
      try {
        const folder = await findFileByName(order.orderId, config.DRIVE.ORDER_FOLDER);
        if (folder) {
          const jsonFile = await findFileByName('order.json', folder.id);
          if (jsonFile) {
            const content = await downloadFileContent(jsonFile.id);
            const driveOrder = JSON.parse(content);
            return res.json({ ...driveOrder, sheetId: req.params.sheetId });
          }
        }
      } catch (driveErr) {
        console.warn('Could not read order.json from Drive, using sheet data:', driveErr.message);
      }
    }

    // Fall back to sheet-parsed data with catalog name-lookup for itemTypeId
    const catalog = readCatalog();
    const byName = Object.fromEntries(catalog.items.map(i => [i.name.toLowerCase(), i.id]));
    order.lineItems = order.lineItems.map(li => ({
      ...li,
      itemTypeId: li.itemTypeId || byName[(li.itemTypeName || '').toLowerCase()] || '',
    }));
    res.json(order);
  } catch (err) {
    // Fall back to local cache — scan for matching sheetId
    const cacheFiles = fs.existsSync(config.ORDERS_CACHE_DIR)
      ? fs.readdirSync(config.ORDERS_CACHE_DIR) : [];
    for (const file of cacheFiles) {
      const data = readOrderCache(file.replace('.json', ''));
      if (data && data.sheetId === req.params.sheetId) {
        return res.json({ ...data, _fromCache: true });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/order/:sheetId', async (req, res) => {
  try {
    const orderData = req.body;
    await writeOrderToSheet(req.params.sheetId, orderData);
    writeOrderCache(orderData.orderId, orderData);

    // Best-effort: save full JSON to Drive order folder
    if (orderData.orderId) {
      try {
        let folder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
        if (!folder) {
          const id = await createFolder(orderData.orderId, config.DRIVE.ORDER_FOLDER);
          folder = { id };
        }
        await uploadFileContent('order.json', JSON.stringify(orderData), folder.id);
      } catch (driveErr) {
        console.warn('Could not save order.json to Drive:', driveErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
