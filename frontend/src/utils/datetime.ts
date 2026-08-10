import { format } from 'date-fns'

/**
 * Today's date in the viewer's local calendar, as yyyy-MM-dd.
 * `new Date().toISOString()` is UTC and can land on the wrong calendar day
 * near local midnight — this stays in local time throughout.
 */
export function todayLocalDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Format a stored UTC instant (ISO string, e.g. a TimeRecord's startTime)
 * as a local HH:mm clock time for display or for pre-filling an editable
 * time field. Never slice the raw ISO string for this — that reads back
 * the UTC hour, not the local one the user entered.
 */
export function formatTimeOfDay(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

/**
 * Combine a plain calendar date (yyyy-MM-dd, from a date picker) and a local
 * wall-clock time (HH:mm, from a time picker) into the UTC instant the API
 * expects. This is the one place that local -> UTC conversion should happen;
 * anything reading the result back for display must go through
 * formatTimeOfDay to invert it correctly, rather than re-parsing the raw
 * ISO string as if it were local time again.
 */
export function combineLocalDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0).toISOString()
}
