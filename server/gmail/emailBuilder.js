const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function groupByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const cat = item.apparelType || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function sizeBreakdown(item) {
  return SIZES
    .filter(s => (item.sizes?.[s]?.total ?? 0) > 0)
    .map(s => {
      const total = item.sizes[s].total;
      const inv = item.sizes[s].inventory ?? 0;
      const toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${s}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total) return `${s}: ${total} (all from stock)`;
      return `${s}: ${total}`;
    })
    .join(', ');
}

function buildEmailHtml(orderData, settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const brandName = settings.brandName || '';

  let html = `<h2>${orderData.orderId} — Order Request</h2>`;

  for (const [category, items] of Object.entries(groups)) {
    html += `<h3>${category}</h3><table border="1" cellpadding="6" cellspacing="0">`;
    html += '<tr><th>#</th><th>Design(s)</th><th>Color</th><th>Sizes</th><th>Notes</th></tr>';
    for (const item of items) {
      const designs = (item.designs || [])
        .map(d => `${d.placement}: ${d.file === 'brand_name_text' ? brandName : d.file}`)
        .join('<br>');
      html += `<tr>
        <td>${item.num}</td>
        <td>${designs || '—'}</td>
        <td>${item.color || '—'}</td>
        <td>${sizeBreakdown(item)}</td>
        <td>${item.notes || ''}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<p>📁 Design files: see order folder in Google Drive (Order ID: ${orderData.orderId})</p>`;
  return html;
}

function buildEmailPlainText(orderData, settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const brandName = settings.brandName || '';
  let text = `${orderData.orderId} — Order Request\n\n`;

  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      const designs = (item.designs || [])
        .map(d => `  ${d.placement}: ${d.file === 'brand_name_text' ? brandName : d.file}`)
        .join('\n');
      text += `• #${item.num} | ${item.color || ''} | ${sizeBreakdown(item)}\n`;
      if (designs) text += `${designs}\n`;
      if (item.notes) text += `  Notes: ${item.notes}\n`;
    }
    text += '\n';
  }
  text += `Design files: Order folder in Google Drive (${orderData.orderId})\n`;
  return text;
}

module.exports = { buildEmailHtml, buildEmailPlainText };
