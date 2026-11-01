import { db, type NotesDB } from "./db";
import type { SessionDraft, ScheduleSession } from "../types/schedule";
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
  const proposed: ScheduleSession[] = draft.days.map((day) => {
    const { days, id, ...fields } = draft;
    return { ...fields, id: id ?? crypto.randomUUID(), day };
  });
  proposed.forEach(validateSession);
  await database.transaction(
    "rw",
    database.courses,
    database.scheduleEntries,
    async () => {
      if (!(await database.courses.get(draft.courseId)))
        throw new Error("El curso ya no existe. Selecciona otro curso.");
      if (draft.id && !(await database.scheduleEntries.get(draft.id)))
        throw new Error("Esta sesión ya no existe.");
      const others = (await database.scheduleEntries.toArray()).filter(
        (s) => s.id !== draft.id,
      );
      for (const s of proposed) {
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
export async function deleteSession(id: string, database: NotesDB = db) {
  await database.scheduleEntries.delete(id);
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
