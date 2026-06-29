import { useState } from 'react';
import SizeButtons from './SizeButtons';
import ConfirmDialog from './ConfirmDialog';

export default function LineItemCard({ item, items = [], onChange, onRemove, onAddDesign }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const selectedCatalogItem = items.find(i => i.id === item.itemTypeId) || null;
  const activeColors   = selectedCatalogItem?.colors.filter(c => c.active) || [];
  const activeSizes    = selectedCatalogItem?.sizes.filter(s => s.active).sort((a, b) => a.order - b.order).map(s => s.label) || [];
  const activeMethods  = selectedCatalogItem?.decorationMethods.filter(m => m.active) || [];
  const isLegacy       = !item.itemTypeId && !!item.apparelType;

  function update(field, value) {
    onChange({ ...item, [field]: value });
  }

  function selectItemType(e) {
    const id = e.target.value;
    const catalogItem = items.find(i => i.id === id);
    onChange({
      ...item,
      itemTypeId: id,
      itemTypeName: catalogItem?.name || '',
      color: '',
      sizes: {},
      frontMethod: '',
      backMethod: '',
    });
  }

  function removeDesign(placement, idx) {
    const field = placement === 'front' ? 'frontDesigns' : 'backDesigns';
    update(field, (item[field] || []).filter((_, i) => i !== idx));
  }

  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="line-item-num">#{item.num}</span>
        <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
      </div>

      {/* Item Type */}
      <div className="field-group">
        <div className="field-section-header">Item Type</div>
        {isLegacy ? (
          <p className="legacy-item-note">
            <strong>{item.apparelType}</strong> — Select an item type from the catalog to continue editing.
          </p>
        ) : (
          <select value={item.itemTypeId || ''} onChange={selectItemType}>
            <option value="">— select item type —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
        {items.length === 0 && !isLegacy && (
          <p className="items-empty-note">No items configured — add items in Settings.</p>
        )}
      </div>

      {/* Color */}
      <div className="field-group">
        <div className="field-section-header">Color</div>
        {activeColors.length > 0 ? (
          <div className="btn-group">
            {activeColors.map(c => (
              <button
                key={c.name}
                className={item.color === c.name ? 'active' : ''}
                onClick={() => update('color', c.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  className={`color-swatch${c.hex ? '' : ' no-color'}`}
                  style={c.hex ? { background: c.hex } : {}}
                />
                {c.name}
              </button>
            ))}
          </div>
        ) : isLegacy ? null : (
          <p className="field-placeholder">{item.itemTypeId ? 'No active colors — configure in Settings.' : 'Select an item type first.'}</p>
        )}
      </div>

      {/* Sizes */}
      <div className="field-group">
        <div className="field-section-header">Sizes</div>
        {activeSizes.length > 0 ? (
          <SizeButtons
            sizeLabels={activeSizes}
            sizes={item.sizes}
            onChange={sizes => update('sizes', sizes)}
          />
        ) : isLegacy ? null : (
          <p className="field-placeholder">{item.itemTypeId ? 'No active sizes — configure in Settings.' : 'Select an item type first.'}</p>
        )}
      </div>

      {/* Front placement */}
      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Front</span>
          <button onClick={() => onAddDesign('front')}>+ Add Design</button>
        </div>
        {selectedCatalogItem && (
          <div className="field-group">
            <label>Decoration Method</label>
            <select value={item.frontMethod || ''} onChange={e => update('frontMethod', e.target.value)}>
              <option value="">— see order notes —</option>
              {activeMethods.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        )}
        {(item.frontDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <img className="design-row-thumb" src={`http://localhost:3001/designs-cache/${d.file}`} alt={d.file} />
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('front', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.frontNotes || ''}
          onChange={e => update('frontNotes', e.target.value)}
          placeholder="Front placement notes..."
        />
      </div>

      {/* Back placement */}
      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Back</span>
          <button onClick={() => onAddDesign('back')}>+ Add Design</button>
        </div>
        {selectedCatalogItem && (
          <div className="field-group">
            <label>Decoration Method</label>
            <select value={item.backMethod || ''} onChange={e => update('backMethod', e.target.value)}>
              <option value="">— see order notes —</option>
              {activeMethods.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        )}
        {(item.backDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <img className="design-row-thumb" src={`http://localhost:3001/designs-cache/${d.file}`} alt={d.file} />
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('back', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.backNotes || ''}
          onChange={e => update('backNotes', e.target.value)}
          placeholder="Back placement notes..."
        />
      </div>

      <ConfirmDialog
        message={confirmRemove ? 'Remove this line item?' : null}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
