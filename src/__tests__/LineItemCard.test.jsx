import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemCard from '../components/LineItemCard';

const CATALOG_ITEMS = [{
  id: 'item1',
  name: 'Unisex Tee',
  colors: [
    { name: 'White', hex: '#ffffff', active: true },
    { name: 'Black', hex: '#000000', active: true },
  ],
  sizes: [
    { label: 'M', active: true, order: 0 },
    { label: 'L', active: true, order: 1 },
  ],
  decorationMethods: [{ name: 'DTF', active: true }, { name: 'Screen Print', active: true }],
}];

const BASE_ITEM = {
  num: '01', itemTypeId: '', itemTypeName: '', color: '', sizes: {},
  frontDesigns: [], frontNotes: '', frontMethod: '',
  backDesigns: [], backNotes: '', backMethod: '',
};

test('selecting item type stores itemTypeId and itemTypeName', async () => {
  const onChange = vi.fn();
  render(<LineItemCard item={BASE_ITEM} items={CATALOG_ITEMS} onChange={onChange} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Unisex Tee' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    itemTypeId: 'item1',
    itemTypeName: 'Unisex Tee',
  }));
});

test('active colors render as buttons after item type selected', async () => {
  const item = { ...BASE_ITEM, itemTypeId: 'item1', itemTypeName: 'Unisex Tee' };
  render(<LineItemCard item={item} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  expect(screen.getByText('White')).toBeInTheDocument();
  expect(screen.getByText('Black')).toBeInTheDocument();
});

test('shows confirm dialog before removing', async () => {
  render(<LineItemCard item={BASE_ITEM} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Remove'));
  expect(screen.getByText('Remove this line item?')).toBeInTheDocument();
});

test('legacy item with apparelType shows read-only type name', () => {
  const legacyItem = { ...BASE_ITEM, apparelType: 'Youth', itemTypeId: undefined };
  render(<LineItemCard item={legacyItem} items={CATALOG_ITEMS} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  expect(screen.getByText(/Youth/)).toBeInTheDocument();
  expect(screen.getByText(/Select an item type/i)).toBeInTheDocument();
});
