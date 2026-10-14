// A new program's suggested name: today's date, as "Tue Oct 14" (spec §6.1).
export function defaultProgramName(date: Date = new Date()): string {
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', options)
  return `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${part({ day: 'numeric' })}`
}
