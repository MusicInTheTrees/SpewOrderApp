import { useState } from 'react';
import SizeButtons from './SizeButtons';
import ConfirmDialog from './ConfirmDialog';

const APPAREL_TYPES = ["Youth", "Women's Round Neck", "Women's V-Neck", "Men's T-Shirt", "Tote"];
const COLORS = ['White', 'Black', 'Navy', 'Red', 'Forest Green', 'Royal Blue', 'Heather Grey'];

export default function LineItemCard({ item, onChange, onRemove, onAddDesign }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  function update(field, value) {
    onChange({ ...item, [field]: value });
  }

  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="line-item-num">#{item.num}</span>
        <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
      </div>

      <div className="field-group">
        <label>Apparel Type</label>
        <div className="btn-group">
          {APPAREL_TYPES.map(t => (
            <button
              key={t}
              className={item.apparelType === t ? 'active' : ''}
              onClick={() => update('apparelType', t)}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Color</label>
        <div className="btn-group">
          {COLORS.map(c => (
            <button
              key={c}
              className={item.color === c ? 'active' : ''}
              onClick={() => update('color', c)}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Sizes</label>
        <SizeButtons sizes={item.sizes} onChange={sizes => update('sizes', sizes)} />
      </div>

      <div className="field-group">
        <label>Designs</label>
        {(item.designs || []).map((d, i) => (
          <div key={i} className="design-row">
            <span>{d.designNum}. {d.file}</span>
            <button
              className={d.placement === 'Front' ? 'active' : ''}
              onClick={() => {
                const designs = [...item.designs];
                designs[i] = { ...d, placement: 'Front' };
                update('designs', designs);
              }}
            >Front</button>
            <button
              className={d.placement === 'Back' ? 'active' : ''}
              onClick={() => {
                const designs = [...item.designs];
                designs[i] = { ...d, placement: 'Back' };
                update('designs', designs);
              }}
            >Back</button>
            <button onClick={() => {
              const designs = item.designs.filter((_, idx) => idx !== i);
              update('designs', designs);
            }}>×</button>
          </div>
        ))}
        <button onClick={onAddDesign}>+ Add Design</button>
      </div>

      <div className="field-group">
        <label>Notes</label>
        <textarea
          value={item.notes || ''}
          onChange={e => update('notes', e.target.value)}
          placeholder="Layout instructions, special notes..."
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
