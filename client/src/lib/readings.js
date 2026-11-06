export const slots = [
  { value: 'morning', label: 'Morning (fasting)' },
  { value: 'after_breakfast', label: 'After breakfast' },
  { value: 'after_lunch', label: 'After lunch' },
  { value: 'after_dinner', label: 'After dinner' },
];

export function todayInKolkata(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function sortReadings(readings) {
  return [...readings].sort((a, b) => slots.findIndex((slot) => slot.value === a.slot) - slots.findIndex((slot) => slot.value === b.slot));
}

export function formatReadingDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function greetingInKolkata(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function recordedTime(timestamp) {
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(timestamp));
}
