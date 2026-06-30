const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

function buildRaw(to, subject, htmlBody, plainTextBody) {
  const boundary = 'boundary_speworderapp';
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainTextBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

async function upsertDraft(to, subject, htmlBody, plainTextBody, existingDraftId = null) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  const encoded = buildRaw(to, subject, htmlBody, plainTextBody);

  if (existingDraftId) {
    try {
      const res = await gmail.users.drafts.update({
        userId: 'me',
        id: existingDraftId,
        resource: { message: { raw: encoded } },
      });
      return res.data.id;
    } catch {
      // Draft was sent or deleted — fall through to create a new one
    }
  }

  const res = await gmail.users.drafts.create({
    userId: 'me',
    resource: { message: { raw: encoded } },
  });
  return res.data.id;
}

module.exports = { upsertDraft };
