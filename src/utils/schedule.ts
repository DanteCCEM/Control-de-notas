import { modalities, type ScheduleSession } from "../types/schedule";
export function timeToMinute(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function minuteToTime(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}
export function validMeetingUrl(value: string) {
  if (!value) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function validateSession(s: ScheduleSession): void {
  if (
    !s ||
    typeof s.id !== "string" ||
    !s.id ||
    typeof s.courseId !== "string" ||
    !s.courseId ||
    !Number.isInteger(s.day) ||
    s.day < 0 ||
    s.day > 6 ||
    !Number.isInteger(s.startMinute) ||
    !Number.isInteger(s.endMinute) ||
    s.startMinute < 0 ||
    s.endMinute > 1439 ||
    s.endMinute <= s.startMinute
  )
    throw new Error(
      "Selecciona un curso, un día y horas válidas. La hora final debe ser posterior a la inicial, dentro del mismo día.",
    );
  if (
    !modalities.includes(s.modality) ||
    typeof s.location !== "string" ||
    s.location.length > 120 ||
    typeof s.teacher !== "string" ||
    s.teacher.length > 120 ||
    typeof s.notes !== "string" ||
    s.notes.length > 3000 ||
    typeof s.meetingUrl !== "string" ||
    s.meetingUrl.length > 2048 ||
    !validMeetingUrl(s.meetingUrl)
  )
    throw new Error(
      "Revisa la modalidad, los textos y el enlace (solo http o https).",
    );
}
export function overlaps(a: ScheduleSession, b: ScheduleSession) {
  return (
    a.day === b.day &&
    a.startMinute < b.endMinute &&
    b.startMinute < a.endMinute
  );
}
export function sameSlot(a: ScheduleSession, b: ScheduleSession) {
  return (
    a.courseId === b.courseId &&
    a.day === b.day &&
    a.startMinute === b.startMinute &&
    a.endMinute === b.endMinute
  );
}
export function sessionConflicts(
  s: ScheduleSession,
  others: readonly ScheduleSession[],
) {
  return others.filter((o) => o.id !== s.id && overlaps(s, o));
}
export function mondayOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function sessionOccurrence(s: ScheduleSession, week: Date) {
  const start = mondayOfWeek(week);
  start.setDate(start.getDate() + s.day);
  start.setHours(Math.floor(s.startMinute / 60), s.startMinute % 60, 0, 0);
  const end = new Date(start);
  end.setHours(Math.floor(s.endMinute / 60), s.endMinute % 60, 0, 0);
  return { start, end };
}
export function nextClass(sessions: readonly ScheduleSession[], now: Date) {
  const list = sessions.map((session) => {
    let { start, end } = sessionOccurrence(session, now);
    if (end.getTime() <= now.getTime()) {
      const week = new Date(now);
      week.setDate(week.getDate() + 7);
      ({ start, end } = sessionOccurrence(session, week));
    }
    return { session, start, end, isCurrent: start <= now && now < end };
  });
  list.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      a.start.getTime() - b.start.getTime() ||
      a.session.id.localeCompare(b.session.id),
  );
  return list[0] ?? null;
}
export function remainingTime(ms: number) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(mins / 1440),
    hours = Math.floor((mins % 1440) / 60),
    minutes = mins % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", `${minutes} min`]
    .filter(Boolean)
    .join(" ");
}
export { courseColors } from "./courseColors";
export function layoutSessions(
  sessions: readonly ScheduleSession[],
  start: number,
  end: number,
) {
  const visible = sessions
    .filter((s) => s.startMinute < end && s.endMinute > start)
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute ||
        a.endMinute - b.endMinute ||
        a.id.localeCompare(b.id),
    );
  const output: {
    session: ScheduleSession;
    column: number;
    columns: number;
    start: number;
    end: number;
  }[] = [];
  let group: typeof output = [],
    lanes: number[] = [],
    groupEnd = -1;
  const flush = () => {
    for (const item of group) item.columns = lanes.length;
    output.push(...group);
    group = [];
    lanes = [];
  };
  for (const session of visible) {
    if (session.startMinute >= groupEnd) flush();
    let column = lanes.findIndex((until) => until <= session.startMinute);
    if (column < 0) column = lanes.length;
    lanes[column] = session.endMinute;
    groupEnd = group.length
      ? Math.max(groupEnd, session.endMinute)
      : session.endMinute;
    group.push({
      session,
      column,
      columns: 0,
      start: Math.max(start, session.startMinute),
      end: Math.min(end, session.endMinute),
    });
  }
  flush();
  return output;
}
