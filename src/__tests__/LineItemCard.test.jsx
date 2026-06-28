import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemCard from '../components/LineItemCard';

const BASE_ITEM = { num: '01', apparelType: '', color: '', sizes: {}, notes: '', designs: [] };

test('calls onChange when apparel type selected', async () => {
  const onChange = vi.fn();
  render(<LineItemCard item={BASE_ITEM} onChange={onChange} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Youth'));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apparelType: 'Youth' }));
});

test('shows confirm dialog before removing', async () => {
  render(<LineItemCard item={BASE_ITEM} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Remove'));
  expect(screen.getByText('Remove this line item?')).toBeInTheDocument();
});
