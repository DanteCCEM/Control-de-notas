import type { Backup, Course } from "../types";
import { withCourseOrder, validOrder } from "./courseOrder";
import { validCourseColor } from "./courseColors";
import { validScheduleRange } from "./scheduleRange";
import { validateSession, sameSlot } from "./schedule";

export function validGrade(n: number) {
  return (
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 20 &&
    Math.abs(n * 100 - Math.round(n * 100)) < 1e-8
  );
}
export function validWeights(w: number[]) {
  return (
    w.length === 4 &&
    w.every(
      (n) =>
        Number.isFinite(n) &&
        n >= 0 &&
        n <= 100 &&
        Math.abs(n * 100 - Math.round(n * 100)) < 1e-8,
    ) &&
    Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 1e-8
  );
}
export function calculate(c: Course) {
  const count = c.grades.filter((g) => g.value !== null).length;
  const accumulated = c.grades.reduce(
    (s, g, i) => s + ((g.value ?? 0) * c.weights[i]) / 100,
    0,
  );
  const weight = c.grades.reduce(
    (s, g, i) => s + (g.value !== null ? c.weights[i] : 0),
    0,
  );
  return {
    count,
    accumulated,
    average:
      count === 4
        ? accumulated
        : weight > 0
          ? accumulated / (weight / 100)
          : null,
    complete: count === 4,
  };
}
export function needed(
  c: Course,
  target: number,
  simulations: Record<number, number> = {},
) {
  let accumulated = 0,
    remaining = 0;
  c.grades.forEach((g, i) => {
    const v = g.value ?? simulations[i];
    if (v === undefined || v === null) remaining += c.weights[i] / 100;
    else accumulated += (v * c.weights[i]) / 100;
  });
  return remaining > 0
    ? (target - accumulated) / remaining
    : accumulated >= target
      ? 0
      : Infinity;
}
export function parseBackup(raw: string): Backup {
  const b = JSON.parse(raw);
  if (
    (b?.version !== 1 && b?.version !== 2 && b?.version !== 3) ||
    !Array.isArray(b.courses) ||
    !b.settings ||
    b.settings.id !== "main" ||
    !validGrade(b.settings.threshold) ||
    typeof b.settings.dark !== "boolean" ||
    (b.settings.scheduleRange !== undefined && !validScheduleRange(b.settings.scheduleRange))
  )
    throw new Error("El respaldo o su configuración no son válidos.");
  const ids = new Set();
  for (const c of b.courses) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id ||
      (c.order !== undefined && !validOrder(c.order)) ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      (c.color !== undefined && !validCourseColor(c.color)) ||
      !c.name.trim() ||
      c.name.length > 120 ||
      !Array.isArray(c.weights) ||
      !validWeights(c.weights) ||
      !Array.isArray(c.grades) ||
      c.grades.length !== 4 ||
      c.grades.some(
        (g: any) =>
          !g ||
          typeof g.locked !== "boolean" ||
          (g.value !== null && !validGrade(g.value)),
      )
    )
      throw new Error(
        "El respaldo contiene cursos, notas o ponderaciones inválidos.",
      );
    ids.add(c.id);
  }
  if (b.version !== 1) {
    if (!Array.isArray(b.scheduleEntries))
      throw new Error("El respaldo no contiene un horario válido.");
    const sessionIds = new Set<string>();
    const checked: import("../types/schedule").ScheduleSession[] = [];
    for (const session of b.scheduleEntries) {
      validateSession(session);
      if (session.seriesId !== undefined || session.occurrenceIndex !== undefined) throw new Error("El respaldo debe contener series, no ocurrencias derivadas.");
      if (
        !ids.has(session.courseId) ||
        sessionIds.has(session.id) ||
        checked.some(other => sameSlot(session, other))
      )
        throw new Error(
          "El horario contiene duplicados o referencias a cursos inexistentes.",
        );
      sessionIds.add(session.id);
      checked.push(session);
    }
  }
  return { ...b, courses: withCourseOrder(b.courses) } as Backup;
}
export function csv(courses: Course[]) {
  const rows = [
    [
      "Curso",
      "Consolidado 1",
      "Peso C1 (%)",
      "Parcial",
      "Peso parcial (%)",
      "Consolidado 2",
      "Peso C2 (%)",
      "Final",
      "Peso final (%)",
      "Promedio",
      "Tipo",
      "Acumulado",
    ],
  ];
  courses.forEach((c) => {
    const r = calculate(c);
    rows.push([
      c.name,
      ...c.grades.flatMap((g, i) => [
        g.value === null ? "" : String(g.value),
        String(c.weights[i]),
      ]),
      r.average === null ? "" : r.average.toFixed(2),
      r.complete ? "Definitivo" : "Provisional",
      r.accumulated.toFixed(2),
    ]);
  });
  return (
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              (/^[=+@\-\t\r]/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
