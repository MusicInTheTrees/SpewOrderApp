import { useDesigns } from '../hooks/useDesigns';
import Toast from './Toast';

export default function DesignBrowser({ onSelect, selectionMode = false }) {
  const { designs, loading, toast, clearToast, refresh } = useDesigns();

  return (
    <div className="design-browser">
      <div className="design-browser-header">
        <span>Designs</span>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Designs'}
        </button>
      </div>
      <div className="design-grid">
        {designs.map(d => (
          <div
            key={d.name}
            className={`design-thumb ${selectionMode ? 'selectable' : ''}`}
            onClick={() => selectionMode && onSelect && onSelect(d.name)}
          >
            <img src={d.url} alt={d.name} />
            <span>{d.name}</span>
          </div>
        ))}
      </div>
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  );
}
