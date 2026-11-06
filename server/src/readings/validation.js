export const slotLabels = {
  morning: 'Morning (fasting)',
  after_breakfast: 'After breakfast',
  after_lunch: 'After lunch',
  after_dinner: 'After dinner',
};

const dateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayInKolkata(now = new Date()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isValidDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateReading(body, today) {
  const value = body?.value;
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return { field: 'value', error: 'Please enter a glucose value.' };
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 40 || value > 600) {
    return { field: 'value', error: 'Value must be between 40 and 600 mg/dl.' };
  }
  if (!isValidDate(body.date)) {
    return { field: 'date', error: 'Please enter a valid date in YYYY-MM-DD format.' };
  }
  if (body.date > today) {
    return { field: 'date', error: 'Date cannot be in the future.' };
  }
  if (typeof body.slot !== 'string' || !Object.hasOwn(slotLabels, body.slot)) {
    return { field: 'slot', error: 'Please choose a valid time slot.' };
  }
  return null;
}

export function duplicateSlotError(slot) {
  const article = slot === 'morning' ? 'a' : 'an';
  return { field: 'slot', error: `You already have ${article} ${slotLabels[slot]} reading for this date.` };
}
