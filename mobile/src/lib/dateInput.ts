/**
 * Date and time entry for the catch form, in UK format.
 *
 * DD/MM/YYYY, because that is what an angler in Sheffield writes without
 * thinking. The previous ISO field was unambiguous to a machine and ambiguous
 * to a person: 05/08 is the 5th of August here and the 8th of May in half the
 * formats a phone might autofill, and a date typed one way and read the other
 * lands a catch in the wrong month — or, if it crosses a season boundary,
 * scores it nothing.
 *
 * Local time throughout, not UTC. The old helpers formatted with
 * `toISOString()`, so during BST the form prefilled an hour behind the
 * angler's own clock, and between midnight and 1am it prefilled *yesterday*.
 * These read and write the clock on the wall; the instant sent to Postgres is
 * still an absolute timestamptz, so nothing about storage changes.
 */

export const DATE_PLACEHOLDER = 'DD/MM/YYYY';
export const TIME_PLACEHOLDER = 'HH:MM';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateInput(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Insert the separators as they are earned, so the format is something the
 * field does rather than something the angler has to get right. Typing
 * `05082026` becomes `05/08/2026`; deleting works backwards through it
 * because the mask is recomputed from the digits alone rather than by
 * appending to what is already there.
 */
export function maskDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((part) => part.length > 0)
    .join('/');
}

export function maskTimeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** True once enough digits are present to judge the entry — before that a
 * complaint is just nagging someone mid-keystroke. */
export function isDateComplete(text: string): boolean {
  return text.replace(/\D/g, '').length === 8;
}

export function isTimeComplete(text: string): boolean {
  return text.replace(/\D/g, '').length === 4;
}

/**
 * Strict parse. Returns null rather than a best guess: a catch date that is
 * wrong is worse than one the angler is asked to retype, because catches
 * cannot be edited after submission.
 */
export function parseDateTimeInput(dateStr: string, timeStr: string): Date | null {
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim());
  const time = /^(\d{2}):(\d{2})$/.exec(timeStr.trim());
  if (!date || !time) return null;

  const day = Number(date[1]);
  const month = Number(date[2]);
  const year = Number(date[3]);
  const hour = Number(time[1]);
  const minute = Number(time[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  // The Date constructor rolls 31/02 forward into March rather than refusing
  // it, so the only way to reject a day that never existed is to check it
  // survived the round trip.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;

  return d;
}

/**
 * Why the entry can't be used, or null if it can.
 *
 * `now` is injectable so the future check is testable without waiting.
 */
export function describeDateTimeError(
  dateStr: string,
  timeStr: string,
  now: Date = new Date()
): string | null {
  if (dateStr.trim() === '') return `Enter the date you caught it, as ${DATE_PLACEHOLDER}.`;
  if (timeStr.trim() === '') return `Enter the time you caught it, as ${TIME_PLACEHOLDER}.`;

  const parsed = parseDateTimeInput(dateStr, timeStr);
  if (!parsed) {
    if (!isDateComplete(dateStr)) return `Use ${DATE_PLACEHOLDER}.`;
    if (!isTimeComplete(timeStr)) return `Use ${TIME_PLACEHOLDER}, on a 24-hour clock.`;
    return "That date doesn't exist — check the day and month.";
  }

  // Compared by calendar day, not by instant: a fish logged at the bank
  // minutes after netting it can read a little ahead of a phone whose clock
  // has drifted, and refusing that would be refusing the honest case.
  const caughtDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (caughtDay.getTime() > today.getTime()) return "That's in the future — check the date.";

  return null;
}
