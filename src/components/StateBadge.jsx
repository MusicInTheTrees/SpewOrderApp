const STATE_COLORS = {
  building: '#6366f1',
  sent: '#f59e0b',
  pending: '#3b82f6',
  paid: '#10b981',
  fulfilled: '#8b5cf6',
  received: '#22c55e',
};

export default function StateBadge({ state }) {
  const color = STATE_COLORS[state] || '#6b7280';
  return (
    <span className="state-badge" style={{ backgroundColor: color }}>
      {state}
    </span>
  );
}
