import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SizeButtons from '../components/SizeButtons';

test('clicking size button increments total', async () => {
  const onChange = vi.fn();
  render(<SizeButtons sizes={{}} onChange={onChange} />);
  await userEvent.click(screen.getByText(/^M: 0/));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ M: { total: 1, inventory: 0 } }));
});

test('inventory cannot exceed total', async () => {
  const onChange = vi.fn();
  const sizes = { M: { total: 2, inventory: 2 } };
  render(<SizeButtons sizes={sizes} onChange={onChange} />);
  // The + inventory button should be disabled when inv === total
  const invPlusButtons = screen.getAllByText('+');
  // The M row's + button should be disabled
  expect(invPlusButtons[0]).toBeDisabled();
});
