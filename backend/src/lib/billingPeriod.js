const CYCLE_ALIASES = new Map([
  ['daily', { unit: 'day', count: 1 }],
  ['weekly', { unit: 'week', count: 1 }],
  ['monthly', { unit: 'month', count: 1 }],
  ['yearly', { unit: 'year', count: 1 }],
  ['annually', { unit: 'year', count: 1 }]
]);

export function parseBillingCycle(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (CYCLE_ALIASES.has(normalized)) return CYCLE_ALIASES.get(normalized);
  const match = normalized.match(/^(\d{1,3})\s*(day|days|week|weeks|month|months|year|years)$/);
  if (!match) return null;
  const count = Number(match[1]);
  const rawUnit = match[2];
  const unit = rawUnit.startsWith('day') ? 'day'
    : rawUnit.startsWith('week') ? 'week'
    : rawUnit.startsWith('month') ? 'month' : 'year';
  if (!Number.isInteger(count) || count < 1) return null;
  if (unit === 'day' && count > 3660) return null;
  if (unit === 'week' && count > 520) return null;
  if (unit === 'month' && count > 120) return null;
  if (unit === 'year' && count > 20) return null;
  return { unit, count };
}

export function isSupportedBillingCycle(value) {
  return parseBillingCycle(value) !== null;
}

function addMonthsClamped(date, months) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + months,
    1,
    result.getUTCHours(),
    result.getUTCMinutes(),
    result.getUTCSeconds(),
    result.getUTCMilliseconds()
  ));
  const lastDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(originalDay, lastDay));
  return targetMonthStart;
}

export function addBillingPeriod(date, billingCycle) {
  const start = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(start.getTime())) throw new TypeError('A valid billing start date is required.');
  const parsed = parseBillingCycle(billingCycle);
  if (!parsed) return null;
  if (parsed.unit === 'day') start.setUTCDate(start.getUTCDate() + parsed.count);
  else if (parsed.unit === 'week') start.setUTCDate(start.getUTCDate() + parsed.count * 7);
  else if (parsed.unit === 'month') return addMonthsClamped(start, parsed.count);
  else return addMonthsClamped(start, parsed.count * 12);
  return start;
}
