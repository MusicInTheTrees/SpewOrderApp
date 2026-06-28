import { useState } from 'react';
import StateBadge from './StateBadge';
import ConfirmDialog from './ConfirmDialog';

const STATE_ORDER = ['building', 'sent', 'pending', 'paid', 'fulfilled', 'received'];

export default function OrderTopBar({ order, onAdvanceState, onGenerateDraft, saving }) {
  const [confirmState, setConfirmState] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const nextState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) + 1];

  return (
    <div className="order-top-bar">
      <h2>{order?.orderId}</h2>
      <StateBadge state={order?.state} />
      {nextState && (
        <button onClick={() => setConfirmState(true)}>
          Mark as {nextState}
        </button>
      )}
      <button className="btn-primary" onClick={() => setConfirmDraft(true)}>
        Generate Email Draft
      </button>
      {saving && <span className="saving-indicator">Saving...</span>}

      <ConfirmDialog
        message={confirmState ? `Mark order as "${nextState}"?` : null}
        onConfirm={() => { setConfirmState(false); onAdvanceState(nextState); }}
        onCancel={() => setConfirmState(false)}
      />
      <ConfirmDialog
        message={confirmDraft ? 'Create Gmail draft for this order?' : null}
        onConfirm={() => { setConfirmDraft(false); onGenerateDraft(); }}
        onCancel={() => setConfirmDraft(false)}
      />
    </div>
  );
}
