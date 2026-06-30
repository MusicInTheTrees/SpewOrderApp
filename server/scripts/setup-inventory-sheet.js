// Run once to write column headers to the blank inventory sheet.
// Usage: node server/scripts/setup-inventory-sheet.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { writeRange } = require('../sheets/client');
const config = require('../config');

const HEADERS = [['In Stock', 'Item', 'Color', 'Style', 'Size']];

async function main() {
  const sheetId = config.INVENTORY_SHEET_ID;
  console.log(`Writing headers to sheet: ${sheetId}`);
  await writeRange(sheetId, 'A1', HEADERS, 'RAW');
  console.log('Done — headers written to row 1 (A–E).');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
