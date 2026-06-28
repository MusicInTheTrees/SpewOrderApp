const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export default function SizeButtons({ sizes = {}, onChange }) {
  function getVal(size, key) {
    return sizes[size]?.[key] ?? 0;
  }

  function updateSize(size, key, delta) {
    const current = getVal(size, key);
    const next = Math.max(0, current + delta);
    const total = key === 'total' ? next : getVal(size, 'total');
    const inventory = key === 'inventory' ? Math.min(next, total) : getVal(size, 'inventory');
    onChange({ ...sizes, [size]: { total: key === 'total' ? next : total, inventory } });
  }

  return (
    <div className="size-buttons">
      {SIZES.map(size => {
        const total = getVal(size, 'total');
        const inv = getVal(size, 'inventory');
        return (
          <div key={size} className={`size-btn-group ${total > 0 ? 'active' : ''}`}>
            <button onClick={() => updateSize(size, 'total', 1)}>{size}: {total}</button>
            {total > 0 && (
              <>
                <button className="size-decrement" onClick={() => updateSize(size, 'total', -1)}>−</button>
                <div className="inv-row">
                  <span>inv:</span>
                  <button onClick={() => updateSize(size, 'inventory', -1)} disabled={inv === 0}>−</button>
                  <span>{inv}</span>
                  <button onClick={() => updateSize(size, 'inventory', 1)} disabled={inv >= total}>+</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
