import type { Course } from "../types";
export type CourseWithoutOrder = Omit<Course, "order"> & { order?: number };
export function validOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
// Missing positions are appended in input order. No name/ID/grade is rewritten.
export function withCourseOrder(
  courses: readonly CourseWithoutOrder[],
): Course[] {
  let next =
    courses.reduce(
      (max, c) => (validOrder(c.order) ? Math.max(max, c.order) : max),
      -1,
    ) + 1;
  return courses.map((c) => {
    const order = validOrder(c.order) ? c.order : next++;
    if (!validOrder(order))
      throw new Error("No se puede asignar una posición válida al curso.");
    return { ...c, order };
  });
}
export function compareCourseOrder(a: Course, b: Course): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
