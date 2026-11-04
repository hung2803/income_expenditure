export function reminderLocalDate(date: Date, timezone: string): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (values.hour !== '21') return null;
  return `${values.year}-${values.month}-${values.day}`;
}
