const { buildEmailHtml, buildEmailPlainText } = require('../gmail/emailBuilder');

const ORDER = {
  orderId: 'RMC-001-2026-06-28',
  lineItems: [
    {
      num: '01',
      apparelType: "Women's Round Neck",
      color: 'Black',
      sizes: { M: { total: 2, inventory: 1 }, L: { total: 1, inventory: 0 } },
      notes: 'Curved lettering lower back',
      designs: [
        { designNum: '1', file: 'bestie_bitches.png', placement: 'Front' },
        { designNum: '2', file: 'brand_name_text', placement: 'Back' },
      ],
    },
  ],
};
const SETTINGS = { brandName: 'Rocky Meowtain Co.', spewEmail: 'orders@spew.com' };

test('HTML includes order ID', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('RMC-001-2026-06-28');
});

test('HTML shows brand name for back text design', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('Rocky Meowtain Co.');
});

test('HTML shows partial inventory breakdown', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('from stock');
});

test('plain text includes size breakdown', () => {
  const text = buildEmailPlainText(ORDER, SETTINGS);
  expect(text).toContain('M: 2');
  expect(text).toContain('from stock');
});
