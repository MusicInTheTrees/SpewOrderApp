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

  return colors;
}

async function scrapeColorsFromUrl(url) {
  if (!url) throw new Error('No supplier URL set for this item');
  const html = await fetchUrl(url);
  return parseColors(html);
}

module.exports = { scrapeColorsFromUrl };
