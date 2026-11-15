export function parseStoredCart(value) {
  try {
    const items = JSON.parse(value || '[]');
    if (!Array.isArray(items)) return [];

    return items.filter(item =>
      item &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      Number.isFinite(Number(item.price)) &&
      Number.isInteger(item.qty) &&
      item.qty > 0
    ).map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      kind: typeof item.kind === 'string' ? item.kind : 'snake',
      pot: typeof item.pot === 'string' ? item.pot : '#e8e1d2',
      qty: item.qty
    }));
  } catch {
    return [];
  }
}
