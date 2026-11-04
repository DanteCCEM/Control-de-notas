import { addDays, dateDay, expandSession, parseLocalDate } from "./recurrence";
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
  if (s?.date !== undefined) {
    parseLocalDate(s.date);
    if (dateDay(s.date) !== s.day) throw new Error("El día no coincide con la fecha inicial.");
  }
  if (s?.recurrence !== undefined) {
    const rule = s.recurrence;
    if (!s.date || !rule || !Number.isInteger(rule.weeks) || rule.weeks < 1 || rule.weeks > 104 || !rule.exceptions || typeof rule.exceptions !== "object" || Array.isArray(rule.exceptions)) throw new Error("La repetición debe contener entre 1 y 104 semanas.");
    addDays(s.date, (rule.weeks - 1) * 7);
    for (const [key, exception] of Object.entries(rule.exceptions)) {
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= rule.weeks || !exception || typeof exception !== "object") throw new Error("Excepción de recurrencia inválida.");
      if ("cancelled" in exception) {
        if (exception.cancelled !== true || "override" in exception) throw new Error("Excepción inválida.");
      } else if ("override" in exception && exception.override && exception.override.courseId === s.courseId) {
        const fields = exception.override;
        if ((fields as ScheduleSession).recurrence || !fields.date) throw new Error("Excepción inválida.");
        validateSession({ ...fields, id: `${s.id}:${key}` });
      } else throw new Error("Excepción inválida.");
    }
  }
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
  if (s.recurrence) {
    const expanded = expandSession(s);
    if (expanded.some((entry, i) => expanded.some((other, j) => i !== j && sameSlot(entry, other)))) throw new Error("La serie contiene ocurrencias duplicadas.");
  }
}
function slotOverlaps(a: ScheduleSession, b: ScheduleSession) {
  return (
    a.day === b.day &&
    (!a.date || !b.date || a.date === b.date) &&
    a.startMinute < b.endMinute &&
    b.startMinute < a.endMinute
  );
}
export function overlaps(a: ScheduleSession, b: ScheduleSession) {
  return expandSession(a).some(x => expandSession(b).some(y => slotOverlaps(x, y)));
}
export function sameSlot(a: ScheduleSession, b: ScheduleSession) {
  return expandSession(a).some(x => expandSession(b).some(y => x.courseId === y.courseId && x.day === y.day && (!x.date || !y.date || x.date === y.date) && x.startMinute === y.startMinute && x.endMinute === y.endMinute));
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
  const start = s.date ? parseLocalDate(s.date) : mondayOfWeek(week);
  if (!s.date) start.setDate(start.getDate() + s.day);
  start.setHours(Math.floor(s.startMinute / 60), s.startMinute % 60, 0, 0);
  const end = new Date(start);
  end.setHours(Math.floor(s.endMinute / 60), s.endMinute % 60, 0, 0);
  return { start, end };
}
export function nextClass(sessions: readonly ScheduleSession[], now: Date) {
  const list = sessions.flatMap(expandSession).map((session) => {
    let { start, end } = sessionOccurrence(session, now);
    if (end.getTime() <= now.getTime()) {
      if (session.date) return null;
      const week = new Date(now);
      week.setDate(week.getDate() + 7);
      ({ start, end } = sessionOccurrence(session, week));
    }
    return { session, start, end, isCurrent: start <= now && now < end };
  });
  const upcoming = list.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  upcoming.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      a.start.getTime() - b.start.getTime() ||
      a.session.id.localeCompare(b.session.id),
  );
  return upcoming[0] ?? null;
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
