import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrder } from '../hooks/useOrder';
import { createDraft } from '../api/gmail';
import OrderTopBar from './OrderTopBar';
import LineItemCard from './LineItemCard';
import DesignBrowser from './DesignBrowser';
import OfflineBanner from './OfflineBanner';
import Toast from './Toast';

function nextLineItemNum(lineItems) {
  const max = lineItems.reduce((m, li) => Math.max(m, parseInt(li.num, 10) || 0), 0);
  return String(max + 1).padStart(2, '0');
}

function nextDesignNum(designs) {
  const max = designs.reduce((m, d) => Math.max(m, parseInt(d.designNum, 10) || 0), 0);
  return String(max + 1);
}

export default function OrderBuilder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const sheetId = searchParams.get('sheetId');
  const navigate = useNavigate();
  const { order, setOrder, saving, offline, syncPending } = useOrder(sheetId);
  const [selectingDesignFor, setSelectingDesignFor] = useState(null);
  const [toast, setToast] = useState(null);

  if (!order) return <div className="loading">Loading order...</div>;

  function addLineItem() {
    const num = nextLineItemNum(order.lineItems);
    setOrder(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { num, apparelType: '', color: '', sizes: {}, notes: '', designs: [] }],
    }));
  }

  function updateLineItem(num, updated) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => li.num === num ? updated : li),
    }));
  }

  function removeLineItem(num) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(li => li.num !== num),
    }));
  }

  function handleDesignSelected(designName) {
    if (!selectingDesignFor) return;
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => {
        if (li.num !== selectingDesignFor) return li;
        const designNum = nextDesignNum(li.designs);
        return { ...li, designs: [...li.designs, { designNum, file: designName, placement: 'Front' }] };
      }),
    }));
    setSelectingDesignFor(null);
  }

  async function handleGenerateDraft() {
    try {
      await createDraft(sheetId);
      setToast('Gmail draft created successfully!');
    } catch (err) {
      setToast(`Failed to create draft: ${err.message}`);
    }
  }

  function handleAdvanceState(nextState) {
    setOrder(prev => ({ ...prev, state: nextState }));
  }

  return (
    <div className="order-builder">
      <OfflineBanner offline={offline} syncPending={syncPending} />
      <button className="back-btn" onClick={() => navigate('/orders')}>← Orders</button>

      <OrderTopBar
        order={order}
        saving={saving}
        onAdvanceState={handleAdvanceState}
        onGenerateDraft={handleGenerateDraft}
      />

      <div className="builder-body">
        <div className="line-items">
          {order.lineItems.map(item => (
            <LineItemCard
              key={item.num}
              item={item}
              onChange={updated => updateLineItem(item.num, updated)}
              onRemove={() => removeLineItem(item.num)}
              onAddDesign={() => setSelectingDesignFor(item.num)}
            />
          ))}
          <button className="btn-secondary add-line-item" onClick={addLineItem}>
            + Add Line Item
          </button>
        </div>

        <DesignBrowser
          selectionMode={!!selectingDesignFor}
          onSelect={handleDesignSelected}
        />
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
