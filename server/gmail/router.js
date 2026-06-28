const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet } = require('../sheets/orderSheet');
const { readSettings } = require('../settings/store');
const { buildEmailHtml, buildEmailPlainText } = require('./emailBuilder');
const { createDraft } = require('./client');

const router = express.Router();
router.use(requireAuth);

router.post('/draft', async (req, res) => {
  const { sheetId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  try {
    const [orderData, settings] = await Promise.all([
      readOrderFromSheet(sheetId),
      Promise.resolve(readSettings()),
    ]);
    if (!settings.spewEmail) return res.status(400).json({ error: 'Spew email not configured in settings' });

    const subject = `${orderData.orderId} — Order Request`;
    const html = buildEmailHtml(orderData, settings);
    const plain = buildEmailPlainText(orderData, settings);
    const draftId = await createDraft(settings.spewEmail, subject, html, plain);
    res.json({ draftId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
