import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders, createOrder } from '../api/orders';
import StateBadge from './StateBadge';

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listOrders().then(setOrders).catch(console.error);
  }, []);

  async function handleNewOrder() {
    setLoading(true);
    try {
      const { orderId } = await createOrder();
      navigate(`/orders/${orderId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="orders-list">
      <header>
        <h1>SpewOrderApp</h1>
        <div>
          <button onClick={() => navigate('/settings')}>⚙ Settings</button>
          <button className="btn-primary" onClick={handleNewOrder} disabled={loading}>
            {loading ? 'Creating...' : '+ New Order'}
          </button>
        </div>
      </header>
      <div className="order-cards">
        {orders.length === 0 && <p>No orders yet. Create one to get started.</p>}
        {orders.map(o => (
          <div key={o.orderId} className="order-card" onClick={() => navigate(`/orders/${o.orderId}`)}>
            <strong>{o.orderId}</strong>
            <StateBadge state={o.state || 'building'} />
          </div>
        ))}
      </div>
    </div>
  );
}
