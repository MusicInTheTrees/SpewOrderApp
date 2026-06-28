import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrdersList from '../components/OrdersList';
import * as ordersApi from '../api/orders';

vi.mock('../api/orders');

test('shows no orders message when list is empty', async () => {
  ordersApi.listOrders.mockResolvedValue([]);
  render(<MemoryRouter><OrdersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/No orders yet/i)).toBeInTheDocument());
});

test('renders order cards', async () => {
  ordersApi.listOrders.mockResolvedValue([
    { orderId: 'RMC-001-2026-06-28', state: 'building' },
  ]);
  render(<MemoryRouter><OrdersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('RMC-001-2026-06-28')).toBeInTheDocument());
});
