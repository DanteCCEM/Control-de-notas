// @vitest-environment jsdom
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  NotesDB,
  db,
  defaults,
  initialize,
  newCourse,
  getOrderedCourses,
  saveCourse,
  exportBackup,
  importBackup,
  updateGrade,
  lockGrade,
  moveCourse,
} from "./services/db";
import { parseBackup } from "./utils/grades";
import { compareCourseOrder, withCourseOrder } from "./utils/courseOrder";
const databases: Dexie[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
function databaseName() {
  return "CourseOrderTest-" + crypto.randomUUID();
}
function withoutOrder<T extends { order?: number }>(c: T) {
  const { order, ...payload } = c;
  return payload;
}
describe("Orden explícito y migración de IndexedDB", () => {
  it("reordena varias veces, persiste al reabrir y solo modifica order", async () => {
    const database = new NotesDB(databaseName());
    databases.push(database);
    const courses = ["A", "B", "C", "D"].map((name, order) => ({ ...newCourse(name), order }));
    courses[0].grades[0] = { value: 17.25, locked: true };
    await database.courses.bulkAdd(courses);
    await database.settings.put(defaults);
    await moveCourse(courses[0].id, courses[2].id, database);
    expect((await getOrderedCourses(database)).map(c => c.name)).toEqual(["B", "C", "A", "D"]);
    await moveCourse(courses[3].id, courses[1].id, database);
    const after = await getOrderedCourses(database);
    expect(after.map(c => c.name)).toEqual(["D", "B", "C", "A"]);
    for (const original of courses) expect(withoutOrder((await database.courses.get(original.id))!)).toEqual(withoutOrder(original));
    expect(await database.settings.get("main")).toEqual(defaults);
    database.close();
    await database.open();
    expect(await getOrderedCourses(database)).toEqual(after);
    await expect(moveCourse("missing", courses[0].id, database)).rejects.toThrow();
    expect(await getOrderedCourses(database)).toEqual(after);
  });
  it("migra v1 conservando su orden visible y todos los datos salvo el nuevo campo", async () => {
    const name = databaseName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ courses: "id", settings: "id" });
    await legacy.open();
    const records = ["z", "a", "m"].map((id, i) => ({
      ...withoutOrder({ ...newCourse("Curso " + id, [20, 25, 20, 35]) }),
      id,
      grades: [
        { value: 0, locked: true },
        { value: 12.75 + i, locked: false },
        { value: null, locked: true },
        { value: 20, locked: false },
      ],
      extra: "Campo existente " + id,
    }));
    const settings = { ...defaults, dark: true, threshold: 12.25 };
    await legacy.table("courses").bulkAdd(records);
    await legacy.table("settings").put(settings);
    const before = await legacy.table("courses").toArray();
    legacy.close();
    const upgraded = new NotesDB(name);
    databases.push(upgraded);
    await upgraded.open();
    const after = await getOrderedCourses(upgraded);
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(after.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(after.map((c) => withoutOrder({ ...c }))).toEqual(before);
    expect(await upgraded.settings.get("main")).toEqual(settings);
    expect(upgraded.verno).toBe(3);
    upgraded.close();
    await upgraded.open();
    expect(await getOrderedCourses(upgraded)).toEqual(after);
  });
  it("aborta una migración fallida sin aplicar cambios parciales", async () => {
    const name = databaseName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ courses: "id", settings: "id" });
    await legacy.open();
    const records = [
      { ...newCourse("Extremo"), id: "a", order: Number.MAX_SAFE_INTEGER },
      withoutOrder({ ...newCourse("Sin orden"), id: "b" }),
    ];
    await legacy.table("courses").bulkAdd(records);
    legacy.close();
    const upgraded = new NotesDB(name);
    await expect(upgraded.open()).rejects.toThrow();
    upgraded.close();
    const original = new Dexie(name);
    original.version(1).stores({ courses: "id", settings: "id" });
    await original.open();
    databases.push(original);
    expect(original.verno).toBe(1);
    expect(await original.table("courses").toArray()).toEqual(records);
  });
  it("mantiene el mismo orden inicial en instalaciones con UUID distintos", async () => {
    await db.delete();
    await db.open();
    await initialize();
    const first = await getOrderedCourses();
    await db.delete();
    await db.open();
    await initialize();
    const second = await getOrderedCourses();
    expect(second.map((c) => c.name)).toEqual(first.map((c) => c.name));
    expect(second.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(second.map((c) => c.id)).not.toEqual(first.map((c) => c.id));
    expect(second[0].name).toBe("Ecuaciones Diferenciales");
    expect(second[5].name).toBe("Planeamiento Estratégico");
  });
  it("agrega al final incluso con altas concurrentes y conserva la posición al editar", async () => {
    const database = new NotesDB(databaseName());
    databases.push(database);
    await database.open();
    const a = { ...newCourse("Primero"), id: "z" };
    const b = { ...newCourse("Segundo"), id: "a" };
    await Promise.all([saveCourse(a, database), saveCourse(b, database)]);
    const first = await getOrderedCourses(database);
    expect(first.map((c) => c.name)).toEqual(["Primero", "Segundo"]);
    expect(first.map((c) => c.order)).toEqual([0, 1]);
    await saveCourse({ ...first[0], name: "Renombrado", order: 999 }, database);
    await database.courses.delete(b.id);
    await saveCourse({ ...newCourse("Nuevo"), id: "0" }, database);
    expect((await getOrderedCourses(database)).map((c) => c.name)).toEqual([
      "Renombrado",
      "Nuevo",
    ]);
    expect((await database.courses.get(a.id))?.order).toBe(0);
  });
  it("cambiar notas y candados nunca mueve un curso ni cambia su identificador", async () => {
    await db.courses.clear();
    const courses = [
      { ...newCourse("Primero"), id: "z", order: 0 },
      { ...newCourse("Segundo"), id: "a", order: 1 },
    ];
    await db.courses.bulkAdd(courses);
    await Promise.all([updateGrade("z", 0, 17.25), lockGrade("a", 2, true)]);
    const after = await getOrderedCourses();
    expect(after.map((c) => c.id)).toEqual(["z", "a"]);
    expect(after[0].grades[0].value).toBe(17.25);
    expect(after[1].grades[2].locked).toBe(true);
    expect(after.map((c) => c.order)).toEqual([0, 1]);
  });
});
describe("Orden en respaldos", () => {
  it("exporta, importa y reabre conservando posiciones aunque los UUID ordenen diferente", async () => {
    await db.courses.clear();
    const courses = [
      { ...newCourse("Último"), id: "a", order: 9 },
      { ...newCourse("Primero"), id: "z", order: 0 },
    ];
    courses[1].grades[0] = { value: 0, locked: true };
    await db.courses.bulkAdd(courses);
    const b = await exportBackup();
    expect(b.courses.map((c) => c.id)).toEqual(["z", "a"]);
    await importBackup(parseBackup(JSON.stringify(b)));
    db.close();
    await db.open();
    expect(await exportBackup()).toEqual(b);
  });
  it("admite JSON antiguo sin orden y congela el orden de su arreglo sin mutarlo", async () => {
    const old = {
      version: 1,
      courses: [
        withoutOrder({ ...newCourse("Primero"), id: "z" }),
        withoutOrder({ ...newCourse("Segundo"), id: "a" }),
      ],
      settings: defaults,
    };
    const raw = JSON.stringify(old);
    const parsed = parseBackup(raw);
    await importBackup(parsed);
    expect((await getOrderedCourses()).map((c) => c.id)).toEqual(["z", "a"]);
    expect(parsed.courses.map((c) => c.order)).toEqual([0, 1]);
    expect(JSON.stringify(old)).toBe(raw);
  });
  it("valida posiciones y desempata de forma determinista sin depender del idioma", () => {
    for (const order of [-1, 1.5, null, "1", Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        parseBackup(
          JSON.stringify({
            version: 1,
            courses: [{ ...newCourse("Inválido"), order }],
            settings: defaults,
          }),
        ),
      ).toThrow();
    const normalized = withCourseOrder([
      { ...newCourse("Con orden"), order: 5 },
      withoutOrder({ ...newCourse("Pendiente") }),
    ]);
    expect(normalized.map((c) => c.order)).toEqual([5, 6]);
    const a = { ...newCourse("A"), id: "z" },
      b = { ...newCourse("B"), id: "a" };
    expect([a, b].sort(compareCourseOrder).map((c) => c.id)).toEqual([
      "a",
      "z",
    ]);
  });
});
