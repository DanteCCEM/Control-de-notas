import type { ScheduleSession, SessionFields } from "../types/schedule";
export const MAX_WEEKS = 104;
export function localDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseLocalDate(value: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Fecha local inválida.");
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day, 12);
  if (year < 1900 || year > 9998 || localDate(result) !== value) throw new Error("Fecha local inválida.");
  return result;
}
export function addDays(date: string, days: number): string {
  const result = parseLocalDate(date);
  result.setDate(result.getDate() + days);
  const value = localDate(result);
  parseLocalDate(value);
  return value;
}
export function dateDay(date: string) { return (parseLocalDate(date).getDay() + 6) % 7; }
export function sessionFields(s: SessionFields): SessionFields {
  return { courseId: s.courseId, day: s.day, startMinute: s.startMinute, endMinute: s.endMinute, location: s.location, teacher: s.teacher, modality: s.modality, meetingUrl: s.meetingUrl, notes: s.notes };
}
export function expandSession(s: ScheduleSession): ScheduleSession[] {
  if (!s.recurrence || !s.date) return [s];
  return Array.from({ length: s.recurrence.weeks }, (_, index) => {
    const exception = s.recurrence!.exceptions[String(index)];
    if (exception && "cancelled" in exception) return null;
    const date = addDays(s.date!, index * 7);
    const fields = exception && "override" in exception ? exception.override : { ...sessionFields(s), date };
    return { ...fields, id: `${s.id}:${index}`, seriesId: s.id, occurrenceIndex: index };
  }).filter((s): s is NonNullable<typeof s> => s !== null);
}
export function weekSessions(sessions: readonly ScheduleSession[], week: Date): ScheduleSession[] {
  const monday = new Date(week); monday.setHours(12, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const start = localDate(monday), end = addDays(start, 6);
  return sessions.flatMap(expandSession).filter(s => !s.date || (s.date >= start && s.date <= end));
}
export function recurrenceLabel(s: ScheduleSession): string {
  if (!s.date) return "Semanal · sin fecha de fin (horario anterior)";
  if (!s.recurrence) return `Solo el ${s.date}`;
  return `Cada semana · ${s.recurrence.weeks} clases · ${s.date} a ${addDays(s.date, (s.recurrence.weeks - 1) * 7)}`;
}
/** Stable dated occurrences for a future notification scheduler (no permissions or timers). */
export function classReminders(sessions: readonly ScheduleSession[], from: Date, until: Date) {
  const output: { id: string; session: ScheduleSession; start: Date; remindAt: Date }[] = [];
  const seen = new Set<string>();
  if (until < from) return output;
  const week = new Date(from); week.setDate(week.getDate() - 7);
  const last = new Date(until); last.setDate(last.getDate() + 7);
  while (week <= last) {
    for (const session of weekSessions(sessions, week)) {
      const date = session.date ?? (() => { const monday = new Date(week); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + session.day); return localDate(monday); })();
      const start = parseLocalDate(date); start.setHours(Math.floor(session.startMinute / 60), session.startMinute % 60, 0, 0);
      const remindAt = new Date(start.getTime() - 5 * 60_000);
      const id = `${session.id}@${date}`;
      if (remindAt >= from && remindAt <= until && !seen.has(id)) { output.push({ id, session, start, remindAt }); seen.add(id); }
    }
    week.setDate(week.getDate() + 7);
  }
  return output.sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
}
