// @vitest-environment jsdom
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, expect, it } from "vitest";
import { NotesDB, defaults, exportBackup, importBackup, newCourse } from "./services/db";
import { deleteSession, saveSessions } from "./services/schedule";
import { addDays, classReminders, dateDay, expandSession, parseLocalDate, weekSessions } from "./utils/recurrence";
import { nextClass, overlaps, validateSession } from "./utils/schedule";
import { parseBackup } from "./utils/grades";
import type { SessionDraft, ScheduleSession } from "./types/schedule";
let database: NotesDB;
let courseId: string;
const draft = (patch: Partial<SessionDraft> = {}): SessionDraft => ({ courseId, days: [0], date: "2026-12-28", recurrence: { weeks: 16, exceptions: {} }, startMinute: 480, endMinute: 540, location: "Aula A", teacher: "Docente A", modality: "presencial", meetingUrl: "https://example.com/class", notes: "", ...patch });
beforeEach(async () => {
  database = new NotesDB("RecurrenceQA-" + crypto.randomUUID());
  const course = newCourse("Matemática"); course.color = "#123456"; course.grades[0] = { value: 17, locked: true }; courseId = course.id;
  await database.courses.add(course); await database.settings.put(defaults);
});
afterEach(async () => { await database.delete(); });
async function stored() { return (await database.scheduleEntries.toArray())[0]; }
it("guarda una serie de 16 semanas en un registro y cruza meses y años en fechas locales", async () => {
  const courses = await database.courses.toArray();
  await saveSessions(draft(), false, database);
  const series = await stored(); const occurrences = expandSession(series);
  expect(await database.scheduleEntries.count()).toBe(1);
  expect(occurrences).toHaveLength(16);
  expect(occurrences[0].date).toBe("2026-12-28");
  expect(occurrences[15].date).toBe("2027-04-12");
  for (let i = 0; i < occurrences.length; i++) { expect(occurrences[i].date).toBe(addDays(series.date!, i * 7)); expect(dateDay(occurrences[i].date!)).toBe(0); }
  expect(weekSessions([series], parseLocalDate("2027-01-04"))).toHaveLength(1);
  expect(weekSessions([series], parseLocalDate("2027-04-19"))).toHaveLength(0);
  expect(await database.courses.toArray()).toEqual(courses);
});
it("edita y vuelve a editar una excepción sin afectar otras; edita y elimina la serie", async () => {
  await saveSessions(draft(), false, database);
  const master = await stored(); const occurrence = expandSession(master)[3];
  const edit = { ...occurrence, days: [occurrence.day], location: "Aula B", teacher: "Docente B" };
  await saveSessions(edit, false, database);
  let occurrences = expandSession(await stored());
  expect(occurrences[3].location).toBe("Aula B"); expect(occurrences[2].location).toBe("Aula A");
  await saveSessions({ ...edit, location: "Aula C" }, false, database);
  const updated = await stored();
  await saveSessions({ ...updated, days: [updated.day], location: "Aula general" }, false, database);
  occurrences = expandSession(await stored());
  expect(occurrences[3].location).toBe("Aula C"); expect(occurrences[2].location).toBe("Aula general");
  await deleteSession(master.id, database, 3);
  expect(expandSession(await stored())).toHaveLength(15);
  expect(expandSession(await stored()).some(s => s.occurrenceIndex === 3)).toBe(false);
  await deleteSession(master.id, database); expect(await database.scheduleEntries.count()).toBe(0);
});
it("persiste y restaura series, excepciones y cancelaciones sin alterar cursos ni candados", async () => {
  await saveSessions(draft(), false, database);
  const master = await stored(); const occurrence = expandSession(master)[2];
  await saveSessions({ ...occurrence, days: [0], teacher: "Excepción" }, false, database);
  await deleteSession(master.id, database, 4);
  const before = await exportBackup(database);
  database.close(); await database.open();
  expect(await exportBackup(database)).toEqual(before);
  await importBackup(parseBackup(JSON.stringify(before)), false, database);
  expect(await exportBackup(database)).toEqual(before);
  expect(expandSession(await stored())).toHaveLength(15);
  expect(expandSession(await stored())[2].teacher).toBe("Excepción");
});
it("detecta conflictos reales por fecha, pide confirmación y rechaza duplicados", async () => {
  await saveSessions(draft(), false, database);
  await expect(saveSessions(draft(), true, database)).rejects.toThrow(/existe/);
  await expect(saveSessions(draft({ startMinute: 500, endMinute: 560 }), false, database)).rejects.toThrow(/conflicto/);
  await saveSessions(draft({ startMinute: 500, endMinute: 560 }), true, database);
  await saveSessions(draft({ date: "2027-05-03" }), false, database);
  expect(await database.scheduleEntries.count()).toBe(3);
  const master = await stored();
  expect(overlaps(master, { ...master, id: "other", date: "2028-05-01" })).toBe(false);
});
it("valida semanas, fechas, horas y excepciones; una sola clase no se repite", async () => {
  for (const weeks of [0, -1, 1.5, 105, NaN]) await expect(saveSessions(draft({ recurrence: { weeks, exceptions: {} } }), false, database)).rejects.toThrow();
  for (const date of ["2027-02-29", "2026-13-01", "2026-12-29", "bad"]) await expect(saveSessions(draft({ date }), false, database)).rejects.toThrow();
  await expect(saveSessions(draft({ endMinute: 479 }), false, database)).rejects.toThrow();
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  const [once] = await saveSessions(draft({ recurrence: undefined }), false, database);
  expect(expandSession(once)).toHaveLength(1);
  expect(nextClass([once], new Date(2026, 11, 29))).toBeNull();
  expect(() => validateSession({ ...once, recurrence: { weeks: 2, exceptions: { "2": { cancelled: true } } } })).toThrow();
});
it("prepara recordatorios cinco minutos antes y no avisa clases canceladas ni series terminadas", async () => {
  await saveSessions(draft(), false, database);
  const master = await stored();
  await deleteSession(master.id, database, 1);
  const series = await stored();
  const reminders = classReminders([series], new Date(2026, 11, 28), new Date(2027, 3, 13));
  expect(reminders).toHaveLength(15);
  expect(reminders[0].remindAt.getHours()).toBe(7); expect(reminders[0].remindAt.getMinutes()).toBe(55);
  expect(nextClass([series], new Date(2027, 3, 13))).toBeNull();
});
it("migra el esquema v3 conservando íntegramente horarios anteriores", async () => {
  await database.delete();
  const legacy = new Dexie(database.name);
  legacy.version(3).stores({ courses: "id,order", settings: "id", scheduleEntries: "id,courseId,day,&[courseId+day+startMinute+endMinute]" });
  await legacy.open();
  const old: ScheduleSession = { id: "legacy", courseId, day: 0, startMinute: 480, endMinute: 540, location: "Anterior", teacher: "", modality: "virtual", meetingUrl: "", notes: "" };
  await legacy.table("scheduleEntries").add(old); legacy.close();
  await database.open();
  expect(await stored()).toEqual(old); expect(database.verno).toBe(4);
  expect(weekSessions([old], new Date(2030, 0, 7))).toEqual([old]);
});
it("restaura un respaldo v2 sin recurrencia manteniendo su comportamiento anterior", async () => {
  const backup = await exportBackup(database);
  if (backup.version === 1) throw new Error("Formato");
  const { days, date, recurrence, ...fields } = draft();
  const old = { ...fields, id: "old", day: 0 };
  await importBackup(parseBackup(JSON.stringify({ ...backup, version: 2, scheduleEntries: [old] })), false, database);
  expect(await stored()).toEqual(old);
});
it("una excepción no exige reconfirmar cruces aprobados en otras semanas", async () => {
  const [master] = await saveSessions(draft(), false, database);
  await saveSessions(draft({ recurrence: undefined, startMinute: 500, endMinute: 560 }), true, database);
  const occurrence = expandSession(master)[5];
  await saveSessions({ ...occurrence, days: [occurrence.day], teacher: "Cambio aislado" }, false, database);
  const updated = (await database.scheduleEntries.get(master.id))!;
  expect(expandSession(updated)[5].teacher).toBe("Cambio aislado");
  expect(expandSession(updated)[0].teacher).toBe("Docente A");
});
