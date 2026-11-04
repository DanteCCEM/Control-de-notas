// @vitest-environment jsdom
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  db,
  NotesDB,
  initialize,
  newCourse,
  saveCourse,
  exportBackup,
  importBackup,
} from "./services/db";
import {
  saveSessions,
  deleteSession,
  deleteCourseWithSessions,
} from "./services/schedule";
import { parseBackup } from "./utils/grades";
import {
  timeToMinute,
  overlaps,
  nextClass,
  layoutSessions,
  validateSession,
  sessionOccurrence,
} from "./utils/schedule";
import type { SessionDraft, ScheduleSession } from "./types/schedule";
const draft = (
  courseId: string,
  patch: Partial<SessionDraft> = {},
): SessionDraft => ({
  courseId,
  days: [0],
  startMinute: 480,
  endMinute: 540,
  location: "B-302",
  teacher: "Docente",
  modality: "presencial",
  meetingUrl: "",
  notes: "",
  ...patch,
});
const session = (patch: Partial<ScheduleSession> = {}): ScheduleSession => ({
  id: "session",
  courseId: "course",
  day: 0,
  startMinute: 480,
  endMinute: 540,
  location: "",
  teacher: "",
  modality: "presencial",
  meetingUrl: "",
  notes: "",
  ...patch,
});
beforeEach(async () => {
  await db.delete();
  await db.open();
  await initialize();
});
afterEach(() => db.close());
describe("Horas, conflictos y calendario local", () => {
  it("valida horas, días y enlaces sin aceptar intervalos invertidos", () => {
    expect(timeToMinute("08:15")).toBe(495);
    for (const value of ["24:00", "8:00", "12:75", ""])
      expect(timeToMinute(value)).toBeNaN();
    for (const patch of [
      { endMinute: 480 },
      { startMinute: -1 },
      { day: 7 },
      { startMinute: 500.5 },
      { endMinute: 1440 },
      { meetingUrl: "javascript:alert(1)" },
    ])
      expect(() => validateSession(session(patch))).toThrow();
    expect(() =>
      validateSession(
        session({
          startMinute: 0,
          endMinute: 1439,
          meetingUrl: "https://example.test/room",
        }),
      ),
    ).not.toThrow();
  });
  it("distingue solapamiento, extremos adyacentes y días distintos", () => {
    expect(
      overlaps(
        session(),
        session({ id: "b", startMinute: 539, endMinute: 600 }),
      ),
    ).toBe(true);
    expect(
      overlaps(session(), session({ startMinute: 540, endMinute: 600 })),
    ).toBe(false);
    expect(overlaps(session(), session({ day: 1 }))).toBe(false);
  });
  it("no inventa próxima clase y resuelve siguiente día o semana", () => {
    expect(nextClass([], new Date(2026, 9, 26, 7))).toBeNull();
    const monday = session();
    const before = new Date(2026, 9, 26, 7, 30);
    expect(nextClass([monday], before)?.start).toEqual(
      new Date(2026, 9, 26, 8),
    );
    expect(nextClass([monday], new Date(2026, 9, 26, 10))?.start).toEqual(
      new Date(2026, 10, 2, 8),
    );
    expect(
      nextClass([session({ day: 6 })], new Date(2026, 9, 31, 23, 59))?.start,
    ).toEqual(new Date(2026, 10, 1, 8));
  });
  it("identifica clase actual e incluye el inicio pero no el final", () => {
    const start = new Date(2026, 9, 26, 8);
    expect(nextClass([session()], start)?.isCurrent).toBe(true);
    expect(nextClass([session()], new Date(2026, 9, 26, 9))?.isCurrent).toBe(
      false,
    );
    expect(sessionOccurrence(session(), start).end).toEqual(
      new Date(2026, 9, 26, 9),
    );
  });
  it("calcula posiciones precisas, recortes y carriles para conflictos", () => {
    const a = session({ id: "a", startMinute: 495, endMinute: 555 }),
      b = session({ id: "b", startMinute: 510, endMinute: 570 }),
      c = session({ id: "c", startMinute: 570, endMinute: 600 });
    const result = layoutSessions([a, b, c], 480, 585);
    expect(result[0]).toMatchObject({
      start: 495,
      end: 555,
      column: 0,
      columns: 2,
    });
    expect(result[1]).toMatchObject({ column: 1, columns: 2 });
    expect(result[2]).toMatchObject({
      start: 570,
      end: 585,
      column: 0,
      columns: 1,
    });
    expect(layoutSessions([a], 600, 900)).toEqual([]);
  });
});
describe("Sesiones y relaciones persistentes", () => {
  it("crea varios días con IDs propios sin modificar cursos, notas o candados", async () => {
    const course = (await db.courses.toArray())[0];
    const before = await db.courses.toArray();
    const saved = await saveSessions(draft(course.id, { days: [0, 2, 4] }));
    expect(saved.map((s) => s.day)).toEqual([0, 2, 4]);
    expect(new Set(saved.map((s) => s.id)).size).toBe(3);
    expect(await db.courses.toArray()).toEqual(before);
    db.close();
    await db.open();
    expect(await db.scheduleEntries.count()).toBe(3);
  });
  it("edita y elimina una sesión sin cambiar el resto", async () => {
    const c = (await db.courses.toArray())[0];
    const [a, b] = await saveSessions(draft(c.id, { days: [0, 1] }));
    await saveSessions(
      draft(c.id, {
        id: a.id,
        days: [2],
        location: "Aula nueva",
        startMinute: 600,
        endMinute: 650,
      }),
    );
    expect((await db.scheduleEntries.get(a.id))?.location).toBe("Aula nueva");
    expect(await db.scheduleEntries.get(b.id)).toEqual(b);
    await deleteSession(a.id);
    expect(await db.scheduleEntries.count()).toBe(1);
  });
  it("bloquea duplicados, incluso si se cambia solo la descripción", async () => {
    const c = (await db.courses.toArray())[0];
    await saveSessions(draft(c.id));
    await expect(
      saveSessions(draft(c.id, { teacher: "Otro docente" }), true),
    ).rejects.toThrow("Ya existe");
    expect(await db.scheduleEntries.count()).toBe(1);
  });
  it("requiere confirmación explícita para superponer clases", async () => {
    const courses = await db.courses.toArray();
    await saveSessions(draft(courses[0].id));
    await expect(
      saveSessions(draft(courses[1].id, { startMinute: 510, endMinute: 560 })),
    ).rejects.toThrow("conflicto");
    await saveSessions(
      draft(courses[1].id, { startMinute: 510, endMinute: 560 }),
      true,
    );
    expect(await db.scheduleEntries.count()).toBe(2);
  });
  it("el alta multidiaria es atómica si uno de los días tiene duplicado", async () => {
    const c = (await db.courses.toArray())[0];
    await saveSessions(draft(c.id));
    await expect(
      saveSessions(draft(c.id, { days: [0, 2] }), true),
    ).rejects.toThrow();
    expect(await db.scheduleEntries.count()).toBe(1);
  });
  it("evita duplicados con altas concurrentes", async () => {
    const c = (await db.courses.toArray())[0];
    const results = await Promise.allSettled([
      saveSessions(draft(c.id)),
      saveSessions(draft(c.id)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.scheduleEntries.count()).toBe(1);
  });
  it("rechaza cursos inexistentes y conserva relaciones al renombrarlos", async () => {
    await expect(saveSessions(draft("no-existe"))).rejects.toThrow("curso");
    const c = (await db.courses.toArray())[0];
    const [s] = await saveSessions(draft(c.id));
    await saveCourse({ ...c, name: "Curso renombrado" });
    expect((await db.scheduleEntries.get(s.id))?.courseId).toBe(c.id);
  });
  it("impide eliminar un curso con sesiones sin confirmación y realiza el borrado conjunto", async () => {
    const c = (await db.courses.toArray())[0];
    await saveSessions(draft(c.id));
    await expect(deleteCourseWithSessions(c.id)).rejects.toThrow("confirmar");
    expect(await db.courses.get(c.id)).toBeDefined();
    await deleteCourseWithSessions(c.id, true);
    expect(await db.courses.get(c.id)).toBeUndefined();
    expect(await db.scheduleEntries.count()).toBe(0);
  });
});
describe("Migración y respaldos", () => {
  it("migra v2 a v4 sin alterar cursos, configuración ni candados", async () => {
    const name = "ScheduleMigration-" + crypto.randomUUID();
    const legacy = new Dexie(name);
    legacy.version(2).stores({ courses: "id,order", settings: "id" });
    const c = newCourse("Existente");
    c.grades[0] = { value: 0, locked: true };
    await legacy.table("courses").put(c);
    const settings = { id: "main", threshold: 12, dark: true };
    await legacy.table("settings").put(settings);
    legacy.close();
    const upgraded = new NotesDB(name);
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(4);
      expect(await upgraded.courses.get(c.id)).toEqual(c);
      expect(await upgraded.settings.get("main")).toEqual(settings);
      expect(await upgraded.scheduleEntries.count()).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
  it("exporta y restaura v3 con todos los horarios", async () => {
    const c = (await db.courses.toArray())[0];
    await saveSessions(draft(c.id, { days: [0, 3] }));
    const before = await exportBackup();
    expect(before.version).toBe(3);
    await db.scheduleEntries.clear();
    await importBackup(parseBackup(JSON.stringify(before)));
    expect(await exportBackup()).toEqual(before);
  });
  it("un respaldo v1 mantiene sesiones compatibles y pide confirmar la eliminación de huérfanas", async () => {
    const courses = await db.courses.toArray();
    const [keep] = await saveSessions(draft(courses[0].id));
    await saveSessions(draft(courses[1].id, { days: [1] }));
    const current = await exportBackup();
    const old = {
      version: 1 as const,
      courses: [courses[0]],
      settings: current.settings,
    };
    await expect(importBackup(old)).rejects.toThrow("sin curso");
    expect(await db.courses.count()).toBe(courses.length);
    expect(await db.scheduleEntries.count()).toBe(2);
    await importBackup(old, true);
    expect(await db.scheduleEntries.toArray()).toEqual([keep]);
  });
  it("rechaza respaldos con sesiones inválidas, IDs repetidos, duplicados o cursos ausentes", async () => {
    const b = await exportBackup();
    if (b.version !== 3) throw Error("Formato");
    const c = b.courses[0];
    const s = session({ courseId: c.id });
    for (const entries of [
      [{ ...s, courseId: "missing" }],
      [s, { ...s, id: "other" }],
      [s, { ...s, day: 2 }],
      [{ ...s, endMinute: 450 }],
    ])
      expect(() =>
        parseBackup(JSON.stringify({ ...b, scheduleEntries: entries })),
      ).toThrow();
  });
});
