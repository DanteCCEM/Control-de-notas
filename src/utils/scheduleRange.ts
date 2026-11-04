export const defaultScheduleRange = { start: 7, end: 22 };
export function validScheduleRange(value: unknown): value is { start: number; end: number } {
  if (!value || typeof value !== "object") return false;
  const range = value as { start?: number; end?: number };
  return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start! >= 0 && range.start! < range.end! && range.end! <= 24;
}
