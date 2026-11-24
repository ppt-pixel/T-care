export function decimalToMinorUnits(value) {
  const raw = typeof value === 'string' ? value : value?.toString?.() ?? String(value ?? '');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) throw new TypeError('Money must be a decimal value with at most two fractional digits.');
  const sign = match[1] === '-' ? -1 : 1;
  const fraction = (match[3] || '').padEnd(2, '0');
  const minor = sign * (Number(match[2]) * 100 + Number(fraction || 0));
  if (!Number.isSafeInteger(minor)) throw new RangeError('Money amount exceeds the supported range.');
  return minor;
}

export function minorUnitsToDecimal(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Minor-unit amount must be a non-negative safe integer.');
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

export function calculateStoreTotals({ itemLines, shippingFeeMinor, taxRateBps }) {
  if (!Array.isArray(itemLines) || !itemLines.length) throw new TypeError('At least one item is required.');
  if (!Number.isSafeInteger(shippingFeeMinor) || shippingFeeMinor < 0) throw new RangeError('Shipping fee is invalid.');
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new RangeError('Tax rate must be between 0 and 10000 basis points.');
  const subtotalMinor = itemLines.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError('An order line is invalid.');
    }
    const line = item.unitPriceMinor * item.quantity;
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(sum + line)) throw new RangeError('Order subtotal exceeds the supported range.');
    return sum + line;
  }, 0);
  const taxMinorBig = (BigInt(subtotalMinor) * BigInt(taxRateBps) + 5000n) / 10000n;
  if (taxMinorBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Tax amount exceeds the supported range.');
  const taxAmountMinor = Number(taxMinorBig);
  const totalMinor = subtotalMinor + shippingFeeMinor + taxAmountMinor;
  // Prisma stores these values as DECIMAL(10,2): at most 9,999,999,999 paise.
  const decimalColumnMaxMinor = 9_999_999_999;
  if (itemLines.some(item => item.unitPriceMinor * item.quantity > decimalColumnMaxMinor) || subtotalMinor > decimalColumnMaxMinor || shippingFeeMinor > decimalColumnMaxMinor || taxAmountMinor > decimalColumnMaxMinor || !Number.isSafeInteger(totalMinor) || totalMinor <= 0 || totalMinor > decimalColumnMaxMinor) {
    throw new RangeError('Order total exceeds the supported DECIMAL(10,2) range.');
  }
  return { subtotalMinor, shippingFeeMinor, taxRateBps, taxAmountMinor, totalMinor };
}

const fulfillmentTransitions = {
  PAID: new Set(['PROCESSING']),
  PROCESSING: new Set(['SHIPPED']),
  SHIPPED: new Set(['DELIVERED']),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
  REFUNDED: new Set(),
  PAYMENT_REVIEW: new Set(),
  PENDING_PAYMENT: new Set()
};

export function canTransitionShopOrder(current, next) {
  return fulfillmentTransitions[current]?.has(next) === true;
}

export function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw new RangeError('Choose between 1 and 30 distinct products.');
  const quantities = new Map();
  for (const item of items) {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new TypeError('Each cart item must have a valid product and a quantity from 1 to 20.');
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  if (quantities.size > 30) throw new RangeError('Too many distinct products in this cart.');
  for (const quantity of quantities.values()) if (quantity > 20) throw new RangeError('A product quantity cannot exceed 20.');
  return [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([productId, quantity]) => ({ productId, quantity }));
}
