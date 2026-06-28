const express = require('express');
const { google } = require('googleapis');
const { createOAuth2Client, saveTokens, clearTokens, SCOPES, loadTokens } = require('./oauth');

const router = express.Router();

router.get('/url', (_req, res) => {
  const client = createOAuth2Client();
  const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    saveTokens({ ...tokens, email: data.email });
    res.redirect('http://localhost:5175');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', (_req, res) => {
  const tokens = loadTokens();
  if (!tokens) return res.json({ authenticated: false, email: null });
  res.json({ authenticated: true, email: tokens.email || null });
});

router.post('/logout', (_req, res) => {
  clearTokens();
  res.json({ ok: true });
});

module.exports = router;
