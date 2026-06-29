import { useState, useRef } from 'react';
import { useItems } from '../hooks/useItems';
import ColorPicker from './ColorPicker';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

function ColorColumn({ label, colors, onMove, onSwatchChange, onOpenPicker, moveLabel, moveSymbol }) {
  return (
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">{label}</div>
      {colors.map(c => (
        <div key={c.name} className="ai-row">
          <span
            className={`color-swatch${c.hex ? '' : ' no-color'}`}
            style={c.hex ? { background: c.hex } : {}}
            onClick={() => onOpenPicker(c.name, c.hex)}
            title="Edit swatch"
          />
          <span className="ai-row-name">{c.name}</span>
          <button className="ai-move-btn" title={moveLabel} onClick={() => onMove(c.name)}>
            {moveSymbol}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ItemsTab() {
  const { catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive } = useItems();
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);
  const [expandedColor, setExpandedColor] = useState(null); // { name, hex }
  const [scrapeResult, setScrapeResult] = useState(null);
  const dragSizeIdx = useRef(null);

  const selectedItem = catalog.items.find(i => i.id === selectedId) || null;

  async function handleCreate() {
    try {
      const item = await createItem();
      setSelectedId(item.id);
    } catch (err) {
      setToast(`Failed to create item: ${err.message}`);
    }
  }

  async function handleDelete() {
    if (!selectedItem) return;
    await deleteItem(selectedItem.id);
    setSelectedId(null);
  }

  async function handlePush() {
    try {
      await pushToDrive();
      setToast('Pushed to Drive!');
    } catch (err) {
      setToast(`Push failed: ${err.message}`);
    }
  }

  async function handlePull() {
    try {
      const result = await pullFromDrive();
      if (result.error) { setToast(`Pull failed: ${result.error}`); return; }
      setToast('Pulled from Drive!');
      setSelectedId(null);
    } catch (err) {
      setToast(`Pull failed: ${err.message}`);
    }
  }

  function updateField(field, value) {
    if (!selectedItem) return;
    updateItem({ ...selectedItem, [field]: value });
  }

  function moveColor(name, makeActive) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      colors: selectedItem.colors.map(c => c.name === name ? { ...c, active: makeActive } : c),
    });
  }

  function changeColorSwatch(name, hex) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      colors: selectedItem.colors.map(c => c.name === name ? { ...c, hex } : c),
    });
  }

  function moveSize(label, makeActive) {
    if (!selectedItem) return;
    const activeSizes = selectedItem.sizes.filter(s => s.active && s.label !== label).sort((a, b) => a.order - b.order);
    const maxOrder = activeSizes.length > 0 ? Math.max(...activeSizes.map(s => s.order)) : -1;
    updateItem({
      ...selectedItem,
      sizes: selectedItem.sizes.map(s => s.label === label
        ? { ...s, active: makeActive, order: makeActive ? maxOrder + 1 : s.order }
        : s
      ),
    });
  }

  function reorderSize(dropIdx) {
    if (!selectedItem || dragSizeIdx.current === null) return;
    const fromIdx = dragSizeIdx.current;
    dragSizeIdx.current = null;
    if (fromIdx === dropIdx) return;
    const active = [...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order);
    const [moved] = active.splice(fromIdx, 1);
    active.splice(dropIdx, 0, moved);
    const reordered = active.map((s, i) => ({ ...s, order: i }));
    updateItem({
      ...selectedItem,
      sizes: selectedItem.sizes.map(s => {
        const found = reordered.find(r => r.label === s.label);
        return found || s;
      }),
    });
  }

  function moveMethod(name, makeActive) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      decorationMethods: selectedItem.decorationMethods.map(m =>
        m.name === name ? { ...m, active: makeActive } : m
      ),
    });
  }

  async function handleScrapeColors(id) {
    setScrapeResult('Scraping...');
    try {
      const result = await scrapeColors(id);
      if (result.error) { setScrapeResult(`Error: ${result.error}`); return; }
      setScrapeResult(`Added ${result.added}, skipped ${result.skipped}`);
    } catch (err) {
      setScrapeResult(`Error: ${err.message}`);
    }
  }

  if (loading) return <div className="loading">Loading catalog...</div>;

  return (
    <div className="items-tab">
      <div className="items-sync-bar">
        <button className="btn-secondary" onClick={handlePush}>Push to Drive</button>
        <button className="btn-secondary" onClick={() => setConfirmPull(true)}>Pull from Drive</button>
      </div>

      <div className="items-layout">
        <div className="items-list-panel">
          {catalog.items.map(item => (
            <div
              key={item.id}
              className={`items-list-row${selectedId === item.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              {item.name}
            </div>
          ))}
          <button className="btn-secondary items-new-btn" onClick={handleCreate}>+ New Item</button>
        </div>

        <div className="items-editor-panel">
          {!selectedItem ? (
            <p className="items-empty">Select an item to edit, or create a new one.</p>
          ) : (
            <>
              <div className="field-group">
                <label>Name</label>
                <input
                  value={selectedItem.name}
                  onChange={e => updateField('name', e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Supplier URL</label>
                <input
                  value={selectedItem.supplierUrl || ''}
                  onChange={e => updateField('supplierUrl', e.target.value)}
                  placeholder="https://supplier.com/product/..."
                />
              </div>
              {/* Colors section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Colors</div>
                <div className="active-inactive-cols">
                  <ColorColumn
                    label="Active"
                    colors={selectedItem.colors.filter(c => c.active)}
                    onMove={(name) => moveColor(name, false)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    onOpenPicker={(name, hex) => setExpandedColor({ name, hex })}
                    moveLabel="Move to inactive"
                    moveSymbol="→"
                  />
                  <ColorColumn
                    label="Inactive"
                    colors={selectedItem.colors.filter(c => !c.active)}
                    onMove={(name) => moveColor(name, true)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    onOpenPicker={(name, hex) => setExpandedColor({ name, hex })}
                    moveLabel="Move to active"
                    moveSymbol="←"
                  />
                </div>
                <div className="ai-add-row">
                  <input
                    className="ai-add-input"
                    placeholder="Color name..."
                    id={`add-color-${selectedItem.id}`}
                  />
                  <button className="btn-secondary ai-add-btn" onClick={() => {
                    const inp = document.getElementById(`add-color-${selectedItem.id}`);
                    const name = inp.value.trim();
                    if (!name || selectedItem.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
                    inp.value = '';
                    updateItem({ ...selectedItem, colors: [...selectedItem.colors, { name, hex: null, active: true }] });
                  }}>Add</button>
                </div>
                {/* Scrape from URL */}
                <div className="scrape-row">
                  <button className="btn-secondary" onClick={() => handleScrapeColors(selectedItem.id)}>
                    Scrape Colors from URL
                  </button>
                  {scrapeResult && <span className="scrape-result">{scrapeResult}</span>}
                </div>
              </div>
              {/* Color picker open state managed per-color via expandedColor state */}
              {expandedColor && (
                <div className="color-picker-popover">
                  <ColorPicker
                    hex={expandedColor.hex}
                    onChange={(hex) => {
                      changeColorSwatch(expandedColor.name, hex);
                      setExpandedColor(prev => ({ ...prev, hex }));
                    }}
                  />
                  <button onClick={() => setExpandedColor(null)}>Done</button>
                </div>
              )}
              {/* Sizes section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Sizes</div>
                <div className="active-inactive-cols">
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Active (drag to reorder)</div>
                    {[...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order).map((s, idx, arr) => (
                      <div
                        key={s.label}
                        className="ai-row"
                        draggable
                        onDragStart={() => { dragSizeIdx.current = idx; }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => reorderSize(idx)}
                      >
                        <span className="drag-handle">⠿</span>
                        <span className="ai-row-name">{s.label}</span>
                        <button className="ai-move-btn" title="Move size to inactive" onClick={() => moveSize(s.label, false)}>→</button>
                      </div>
                    ))}
                    <div className="ai-add-row">
                      <input className="ai-add-input" placeholder="Label..." id={`add-size-${selectedItem.id}`} />
                      <button className="btn-secondary ai-add-btn" onClick={() => {
                        const inp = document.getElementById(`add-size-${selectedItem.id}`);
                        const label = inp.value.trim();
                        if (!label || selectedItem.sizes.find(s => s.label === label)) return;
                        inp.value = '';
                        const maxOrder = Math.max(-1, ...selectedItem.sizes.filter(s => s.active).map(s => s.order));
                        updateItem({ ...selectedItem, sizes: [...selectedItem.sizes, { label, active: true, order: maxOrder + 1 }] });
                      }}>Add</button>
                    </div>
                  </div>
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Inactive</div>
                    {selectedItem.sizes.filter(s => !s.active).map(s => (
                      <div key={s.label} className="ai-row">
                        <span className="ai-row-name">{s.label}</span>
                        <button className="ai-move-btn" title="Move size to active" onClick={() => moveSize(s.label, true)}>←</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Decoration Methods section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Decoration Methods</div>
                <div className="active-inactive-cols">
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Active</div>
                    {selectedItem.decorationMethods.filter(m => m.active).map(m => (
                      <div key={m.name} className="ai-row">
                        <span className="ai-row-name">{m.name}</span>
                        <button className="ai-move-btn" title="Move to inactive" onClick={() => moveMethod(m.name, false)}>→</button>
                      </div>
                    ))}
                    <div className="ai-add-row">
                      <input className="ai-add-input" placeholder="Method name..." id={`add-method-${selectedItem.id}`} />
                      <button className="btn-secondary ai-add-btn" onClick={() => {
                        const inp = document.getElementById(`add-method-${selectedItem.id}`);
                        const name = inp.value.trim();
                        if (!name || selectedItem.decorationMethods.find(m => m.name === name)) return;
                        inp.value = '';
                        updateItem({ ...selectedItem, decorationMethods: [...selectedItem.decorationMethods, { name, active: true }] });
                      }}>Add</button>
                    </div>
                  </div>
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Inactive</div>
                    {selectedItem.decorationMethods.filter(m => !m.active).map(m => (
                      <div key={m.name} className="ai-row">
                        <span className="ai-row-name">{m.name}</span>
                        <button className="ai-move-btn" title="Move to active" onClick={() => moveMethod(m.name, true)}>←</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button className="btn-danger" onClick={handleDelete}>Delete Item</button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        message={confirmPull ? 'This will overwrite your local catalog with the Drive version. Continue?' : null}
        onConfirm={() => { setConfirmPull(false); handlePull(); }}
        onCancel={() => setConfirmPull(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
