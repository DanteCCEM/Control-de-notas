import { validGrade } from "../utils/grades";
import Dexie, { type Table } from "dexie";
import type { Course, Settings, Backup } from "../types";
import {
  compareCourseOrder,
  withCourseOrder,
  validOrder,
} from "../utils/courseOrder";
export class NotesDB extends Dexie {
  courses!: Table<Course, string>;
  settings!: Table<Settings, string>;
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
    await database.courses.put({ ...course, order });
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
export async function exportBackup(): Promise<Backup> {
  return db.transaction("r", db.courses, db.settings, async () => ({
    version: 1,
    courses: await getOrderedCourses(),
    settings: (await db.settings.get("main"))!,
  }));
}
export async function importBackup(b: Backup) {
  await db.transaction("rw", db.courses, db.settings, async () => {
    await db.courses.clear();
    await db.courses.bulkAdd(withCourseOrder(b.courses));
    await db.settings.put(b.settings);
  });
}
