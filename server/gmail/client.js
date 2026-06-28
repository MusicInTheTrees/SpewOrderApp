const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

async function createDraft(to, subject, htmlBody, plainTextBody) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const boundary = 'boundary_speworderapp';
  const rawEmail = [
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

  const encoded = Buffer.from(rawEmail).toString('base64url');
  const res = await gmail.users.drafts.create({
    userId: 'me',
    resource: { message: { raw: encoded } },
  });
  return res.data.id;
}

module.exports = { createDraft };
