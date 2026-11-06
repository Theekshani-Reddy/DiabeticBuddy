export function reportRange(type, date) {
  if (type === 'daily') return { startDate: date, endDate: date };
  const monthStart = `${date.slice(0, 7)}-01`;
  if (type === 'mtd') return { startDate: monthStart, endDate: date };

  // Day zero of this month is the final day of the previous calendar month.
  const previousMonth = new Date(`${monthStart}T00:00:00Z`);
  previousMonth.setUTCDate(0);
  const endDate = previousMonth.toISOString().slice(0, 10);
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}
