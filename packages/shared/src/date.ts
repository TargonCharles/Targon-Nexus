// Date formatting utilities

export type FlexibleDateInput = string | Date | number;
export interface DateRange { start: Date; end?: Date; }
export interface AcademicYear { year: number; label: string; }

export function toISO(input: FlexibleDateInput): string {
  return new Date(input).toISOString();
}

export function toISODate(input: FlexibleDateInput): string {
  return new Date(input).toISOString().split('T')[0];
}

export function formatRelativeTime(input: FlexibleDateInput, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(input).getTime();
  const abs = Math.abs(diff);
  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function parseFlexibleDate(input: string): Date | null {
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function isDateInRange(date: FlexibleDateInput, range: DateRange): boolean {
  const d = new Date(date).getTime();
  const afterStart = d >= range.start.getTime();
  const beforeEnd = !range.end || d <= range.end.getTime();
  return afterStart && beforeEnd;
}

export function academicYear(date: FlexibleDateInput = new Date()): AcademicYear {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const ay = month < 8 ? year - 1 : year;
  return { year: ay, label: `${ay}-${ay + 1}` };
}

export function academicYearRange(startYear: number, endYear: number): string {
  return `${startYear}-${endYear}`;
}

export function daysBetween(a: FlexibleDateInput, b: FlexibleDateInput): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function formatDateRange(range: DateRange): string {
  const start = toISODate(range.start);
  if (!range.end) return start;
  return `${start} to ${toISODate(range.end)}`;
}

export function parseDateRange(input: string): DateRange | null {
  const parts = input.split(/to|to|-|–|—/).map((s) => s.trim());
  const start = parseFlexibleDate(parts[0]);
  if (!start) return null;
  const end = parts[1] ? parseFlexibleDate(parts[1]) : undefined;
  return { start, end: end ?? undefined };
}
