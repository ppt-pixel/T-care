const MINIMUM_LEAD_TIME_MS = 60 * 60 * 1000;
const DEFAULT_START_MINUTES = 9 * 60;
const DEFAULT_END_MINUTES = 17 * 60;
const DEFAULT_INTERVAL_MINUTES = 30;

function safeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid reference date is required.');
  return date;
}

function dateKeyForLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatMinutes(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const date = new Date(2000, 0, 1, hour, minute, 0, 0);
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function getPreferredTimeSlots(dateKey, {
  now = new Date(),
  durationMinutes = 60,
  startMinutes = DEFAULT_START_MINUTES,
  endMinutes = DEFAULT_END_MINUTES,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES
} = {}) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return [];

  const reference = safeDate(now);
  const duration = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
    ? Math.ceil(Number(durationMinutes))
    : 60;
  const start = Number.isInteger(startMinutes) ? startMinutes : DEFAULT_START_MINUTES;
  const end = Number.isInteger(endMinutes) ? endMinutes : DEFAULT_END_MINUTES;
  const interval = Number.isInteger(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_INTERVAL_MINUTES;
  const earliestAllowed = reference.getTime() + MINIMUM_LEAD_TIME_MS;
  const slots = [];

  for (let minutes = start; minutes + duration <= end; minutes += interval) {
    const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (slotDate.getTime() < earliestAllowed) continue;
    slots.push({
      value: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      label: formatMinutes(minutes),
      timestamp: slotDate.getTime()
    });
  }

  return slots;
}

export function getPreferredVisitDates({
  now = new Date(),
  days = 30,
  durationMinutes = 60,
  startMinutes = DEFAULT_START_MINUTES,
  endMinutes = DEFAULT_END_MINUTES,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES
} = {}) {
  const reference = safeDate(now);
  const count = Number.isInteger(days) ? Math.max(1, Math.min(90, days)) : 30;
  const firstDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 0, 0, 0, 0);
  const dates = [];

  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + offset);
    const value = dateKeyForLocalDate(date);
    const slots = getPreferredTimeSlots(value, { now: reference, durationMinutes, startMinutes, endMinutes, intervalMinutes });
    if (!slots.length) continue;

    const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
    const month = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date);
    dates.push({
      value,
      offset,
      dayLabel: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekday,
      weekday,
      dayNumber: date.getDate(),
      month,
      slots
    });
  }

  return dates;
}
