import { validGrade, parseBackup } from "../utils/grades";
import Dexie, { type Table } from "dexie";
import { validCourseColor } from "../utils/courseColors";
import type { ScheduleSession } from "../types/schedule";
import type { Course, Settings, Backup } from "../types";
import {
  compareCourseOrder,
  withCourseOrder,
  validOrder,
} from "../utils/courseOrder";
export class NotesDB extends Dexie {
  courses!: Table<Course, string>;
  settings!: Table<Settings, string>;
  scheduleEntries!: Table<ScheduleSession, string>;
  constructor(name = "MiControlDeNotas") {
    super(name);
    this.version(1).stores({ courses: "id", settings: "id" });
    this.version(2)
      .stores({ courses: "id,order", settings: "id" })
      .upgrade(async (tx) => {
        // Version 1 displayed primary-key order. Freeze it without touching payloads.
        const courses = await tx.table<Course>("courses").toArray();
        for (const course of withCourseOrder(courses)) {
          await tx.table("courses").update(course.id, { order: course.order });
        }
      });
    this.version(3).stores({
      courses: "id,order",
      settings: "id",
      scheduleEntries: "id,courseId,day,&[courseId+day+startMinute+endMinute]",
    });
    // Dated series can share a weekly slot when their dates do not overlap.
    this.version(4).stores({
      courses: "id,order", settings: "id",
      scheduleEntries: "id,courseId,day",
    });
  }
}
export const db = new NotesDB();
export const defaults: Settings = { id: "main", threshold: 11, dark: false };
export function newCourse(
  name: string,
  weights = [20, 20, 20, 40],
  order = 0,
): Course {
  return {
    id: crypto.randomUUID(),
    order,
    name,
    weights,
    grades: Array.from({ length: 4 }, () => ({ value: null, locked: false })),
  };
}
export async function initialize() {
  await db.transaction("rw", db.courses, db.settings, async () => {
    if (await db.settings.get("main")) return;
    if ((await db.courses.count()) === 0)
      await db.courses.bulkAdd(
        [
          newCourse("Ecuaciones Diferenciales", [20, 25, 20, 35]),
          newCourse("Conmutación y Enrutamiento"),
          newCourse("Taller de Proyectos 2"),
          newCourse("Taller de Investigación 2", [20, 20, 25, 35]),
          newCourse("Metodologías Ágiles de Desarrollo"),
          newCourse("Planeamiento Estratégico", [20, 25, 20, 35]),
        ].map((course, order) => ({ ...course, order })),
      );
    await db.settings.add(defaults);
  });
}
export async function getOrderedCourses(
  database: NotesDB = db,
): Promise<Course[]> {
  return (await database.courses.toArray()).sort(compareCourseOrder);
}
export async function saveCourse(course: Course, database: NotesDB = db) {
  if (course.color !== undefined && !validCourseColor(course.color))
    throw new Error("El color debe tener formato hexadecimal #RRGGBB.");
  await database.transaction("rw", database.courses, async () => {
    const existing = await database.courses.get(course.id);
    const order =
      existing?.order ??
      (await database.courses.toArray()).reduce(
        (max, c) => Math.max(max, c.order),
        -1,
      ) + 1;
    if (!validOrder(order))
      throw new Error("No se puede asignar una posición válida al curso.");
    await database.courses.put({ ...course, grades: existing?.grades ?? course.grades, order });
  });
}
export async function updateGrade(
  id: string,
  index: number,
  value: number | null,
) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 3 ||
    (value !== null && !validGrade(value))
  )
    throw new Error("Nota inválida.");
  await db.transaction("rw", db.courses, async () => {
    const c = await db.courses.get(id);
    if (!c) throw new Error("Curso no encontrado.");
    if (c.grades[index].locked) throw new Error("La nota está bloqueada.");
    c.grades[index].value = value;
    await db.courses.put(c);
  });
}
export async function lockGrade(id: string, index: number, locked: boolean) {
  await db.transaction("rw", db.courses, async () => {
    const c = await db.courses.get(id);
    if (!c) throw new Error("Curso no encontrado.");
    c.grades[index].locked = locked;
    await db.courses.put(c);
  });
}
export async function exportBackup(database: NotesDB = db): Promise<Backup> {
  return database.transaction(
    "r",
    database.courses,
    database.settings,
    database.scheduleEntries,
    async () => ({
      version: 3,
      courses: await getOrderedCourses(database),
      settings: (await database.settings.get("main"))!,
      scheduleEntries: await database.scheduleEntries.toArray(),
    }),
  );
}
export async function importBackup(b: Backup, allowOrphanRemoval = false, database: NotesDB = db) {
  b = parseBackup(JSON.stringify(b));
  await database.transaction(
    "rw",
    database.courses,
    database.settings,
    database.scheduleEntries,
    async () => {
      if (b.version !== 1) {
        await database.scheduleEntries.clear();
        await database.scheduleEntries.bulkAdd(b.scheduleEntries);
      } else {
        const ids = new Set(b.courses.map((c) => c.id));
        const orphanIds = (await database.scheduleEntries.toArray())
          .filter((s) => !ids.has(s.courseId))
          .map((s) => s.id);
        if (orphanIds.length && !allowOrphanRemoval)
          throw new Error(
            "El respaldo deja sesiones sin curso. Confirma su eliminación antes de importar.",
          );
        await database.scheduleEntries.bulkDelete(orphanIds);
      }
      await database.courses.clear();
      await database.courses.bulkAdd(withCourseOrder(b.courses));
      await database.settings.put(b.settings);
    },
  );
}

// Read current records inside the transaction; never overwrite grade payloads.
export async function moveCourse(id: string, targetId: string, database: NotesDB = db) {
  await database.transaction("rw", database.courses, async () => {
    const courses = await getOrderedCourses(database);
    const from = courses.findIndex(course => course.id === id);
    const to = courses.findIndex(course => course.id === targetId);
    if (from < 0 || to < 0) throw new Error("El curso ya no existe. Actualiza la lista e inténtalo de nuevo.");
    if (from === to) return;
    const [course] = courses.splice(from, 1);
    courses.splice(to, 0, course);
    for (const [order, current] of courses.entries()) {
      if (current.order !== order) await database.courses.update(current.id, { order });
    }
  });
}
