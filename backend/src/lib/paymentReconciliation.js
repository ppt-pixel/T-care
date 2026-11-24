import { providerAmountMatches, providerCurrencyMatches } from './paymentValidation.js';

const STATUS_PRIORITY = new Map([
  ['captured', 3],
  ['authorized', 2],
  ['failed', 1]
]);

export function selectReconciliationPayment(localPayment, providerPayments) {
  if (!localPayment?.providerOrderId || !Array.isArray(providerPayments)) return null;
  const expectedPaise = Math.round(Number(localPayment.amount) * 100);
  if (!Number.isSafeInteger(expectedPaise) || expectedPaise <= 0) return null;

  return providerPayments
    .filter(item => item
      && item.order_id === localPayment.providerOrderId
      && typeof item.id === 'string'
      && STATUS_PRIORITY.has(item.status)
      && providerAmountMatches(expectedPaise, item.amount)
      && providerCurrencyMatches(localPayment.currency, item.currency))
    .sort((a, b) => {
      const priority = STATUS_PRIORITY.get(b.status) - STATUS_PRIORITY.get(a.status);
      if (priority) return priority;
      return Number(b.created_at || 0) - Number(a.created_at || 0);
    })[0] ?? null;
}
