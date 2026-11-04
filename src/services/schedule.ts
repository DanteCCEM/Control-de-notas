import { db, type NotesDB } from "./db";
import type { SessionDraft, ScheduleSession } from "../types/schedule";
import { expandSession, sessionFields } from "../utils/recurrence";
import { overlaps, sameSlot, validateSession } from "../utils/schedule";
export async function saveSessions(
  draft: SessionDraft,
  allowConflicts = false,
  database: NotesDB = db,
) {
  if (
    !draft.days.length ||
    new Set(draft.days).size !== draft.days.length ||
    (draft.id && draft.days.length !== 1)
  )
    throw new Error(
      "Selecciona al menos un día sin repetir. Al editar, selecciona un solo día.",
    );
  const proposed = proposedSessions(draft);
  proposed.forEach(validateSession);
  await database.transaction(
    "rw",
    database.courses,
    database.scheduleEntries,
    async () => {
      if (!(await database.courses.get(draft.courseId)))
        throw new Error("El curso ya no existe. Selecciona otro curso.");
      if ((draft.seriesId || draft.id) && !(await database.scheduleEntries.get(draft.seriesId ?? draft.id!)))
        throw new Error("Esta sesión ya no existe.");
      if (draft.seriesId) {
        const master = (await database.scheduleEntries.get(draft.seriesId))!;
        const index = draft.occurrenceIndex;
        if (!master.recurrence || index === undefined || !Number.isInteger(index) || index < 0 || index >= master.recurrence.weeks || !draft.date || draft.courseId !== master.courseId) throw new Error("Ocurrencia inválida.");
        if (master.recurrence.exceptions[String(index)] && "cancelled" in master.recurrence.exceptions[String(index)]) throw new Error("Esta clase ya fue eliminada.");
        const updated: ScheduleSession = { ...master, recurrence: { ...master.recurrence, exceptions: { ...master.recurrence.exceptions, [index]: { override: { ...sessionFields(proposed[0]), date: draft.date } } } } };
        proposed.splice(0, proposed.length, updated);
      }
      proposed.forEach(validateSession);
      // When editing one class, do not require reconfirming unchanged conflicts
      // elsewhere in an already approved series.
      const checking = draft.seriesId ? expandSession(proposed[0]).filter(s => s.occurrenceIndex === draft.occurrenceIndex) : proposed;
      const others = (await database.scheduleEntries.toArray()).filter(
        (s) => s.id !== (draft.seriesId ?? draft.id),
      );
      if (draft.seriesId) others.push(...expandSession(proposed[0]).filter(s => s.occurrenceIndex !== draft.occurrenceIndex));
      const expanded = checking.flatMap(expandSession);
      for (let i = 0; i < expanded.length; i++) for (let j = i + 1; j < expanded.length; j++) {
        if (sameSlot(expanded[i], expanded[j])) throw new Error("La serie contiene clases duplicadas.");
        if (!allowConflicts && overlaps(expanded[i], expanded[j])) throw new Error("Hay cruces entre ocurrencias. Confirma el solapamiento.");
      }
      for (const s of checking) {
        if (others.some((o) => sameSlot(s, o)))
          throw new Error(
            "Ya existe una sesión de este curso con el mismo día y horario.",
          );
        if (!allowConflicts && others.some((o) => overlaps(s, o)))
          throw new Error(
            "Hay un conflicto de horario. Revisa la advertencia y confirma el solapamiento si deseas guardarlo.",
          );
      }
      await database.scheduleEntries.bulkPut(proposed);
    },
  );
  return proposed;
}
export async function deleteSession(id: string, database: NotesDB = db, occurrenceIndex?: number) {
  if (occurrenceIndex === undefined) { await database.scheduleEntries.delete(id); return; }
  await database.transaction("rw", database.scheduleEntries, async () => {
    const master = await database.scheduleEntries.get(id);
    if (!master?.recurrence || !Number.isInteger(occurrenceIndex) || occurrenceIndex < 0 || occurrenceIndex >= master.recurrence.weeks) throw new Error("Ocurrencia inválida.");
    await database.scheduleEntries.update(id, { recurrence: { ...master.recurrence, exceptions: { ...master.recurrence.exceptions, [occurrenceIndex]: { cancelled: true } } } });
  });
}
export function proposedSessions(draft: SessionDraft): ScheduleSession[] {
  return draft.days.map(day => {
    const { days, id, seriesId, occurrenceIndex, ...fields } = draft;
    const record = { ...fields, id: id ?? crypto.randomUUID(), day };
    validateSession(record);
    return record;
  });
}
export async function deleteCourseWithSessions(
  id: string,
  confirmedSessionDeletion = false,
  database: NotesDB = db,
) {
  await database.transaction(
    "rw",
    database.courses,
    database.scheduleEntries,
    async () => {
      const entries = database.scheduleEntries.where("courseId").equals(id);
      if ((await entries.count()) && !confirmedSessionDeletion)
        throw new Error(
          "El curso tiene sesiones. Debes confirmar también su eliminación.",
        );
      await entries.delete();
      await database.courses.delete(id);
    },
  );
}
