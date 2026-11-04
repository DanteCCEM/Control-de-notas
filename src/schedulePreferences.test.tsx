// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db, NotesDB, defaults, initialize, newCourse, saveCourse, exportBackup, importBackup, saveScheduleRange, updateCourseColor } from "./services/db";
import { saveSessions } from "./services/schedule";
import { useData } from "./hooks/useData";
import { SchedulePage } from "./components/SchedulePage";
import { parseBackup } from "./utils/grades";
afterEach(() => { cleanup(); db.close(); });
it("restaura el rango al volver a entrar y permite cambiar el color desde una sesión", async () => {
  await initialize();
  const course = newCourse("Curso de prueba"); course.grades[0] = { value: 18, locked: true };
  await saveCourse(course);
  const draft = { courseId: course.id, days: [0], startMinute: 480, endMinute: 540, location: "Aula 1", teacher: "Docente", modality: "presencial" as const, meetingUrl: "", notes: "" };
  await saveSessions(draft); await saveSessions({ ...draft, startMinute: 540, endMinute: 600 });
  const sessionsBefore = await db.scheduleEntries.toArray();
  function Schedule() { const { courses } = useData(); return courses ? <SchedulePage courses={courses} backupActions={null} /> : null; }
  let view = render(<Schedule />);
  await screen.findByLabelText("Hora inicial visible");
  fireEvent.change(screen.getByLabelText("Hora inicial visible"), { target: { value: "14" } });
  fireEvent.change(screen.getByLabelText("Hora final visible"), { target: { value: "23" } });
  await waitFor(async () => expect((await db.settings.get("main"))?.scheduleRange).toEqual({ start: 14, end: 23 }));
  view.unmount(); db.close(); await db.open();
  view = render(<Schedule />);
  await waitFor(() => expect((screen.getByLabelText("Hora inicial visible") as HTMLSelectElement).value).toBe("14"));
  expect((screen.getByLabelText("Hora final visible") as HTMLSelectElement).value).toBe("23");
  fireEvent.click(document.querySelector(".stored-series summary")!);
  fireEvent.click(document.querySelector(".stored-series button")!);
  await screen.findByText("Color del curso");
  fireEvent.click(screen.getByRole("button", { name: "Lavanda" }));
  await waitFor(async () => expect((await db.courses.get(course.id))?.color).toBe("#8d5ca3"));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver día completo" }));
  await waitFor(() => expect(document.querySelectorAll(".class-block")).toHaveLength(2));
  for (const block of document.querySelectorAll<HTMLElement>(".class-block")) expect(block.style.getPropertyValue("--session-accent")).toBe("#8d5ca3");
  expect(await db.scheduleEntries.toArray()).toEqual(sessionsBefore);
  const saved = (await db.courses.get(course.id))!;
  expect(saved.grades).toEqual(course.grades); expect(saved.weights).toEqual(course.weights);
  expect(saved.id).toBe(course.id);
  view.unmount();
});
it("incluye el rango en respaldos, admite respaldos antiguos y rechaza valores inválidos", async () => {
  const temporary = new NotesDB("SchedulePreferencesQA-" + crypto.randomUUID());
  try {
    await temporary.settings.put(defaults);
    const course = newCourse("QA"); await temporary.courses.add(course);
    await saveScheduleRange({ start: 14, end: 24 }, temporary);
    await updateCourseColor(course.id, "#123456", temporary);
    const backup = await exportBackup(temporary);
    await importBackup(parseBackup(JSON.stringify(backup)), false, temporary);
    temporary.close(); await temporary.open();
    expect((await temporary.settings.get("main"))?.scheduleRange).toEqual({ start: 14, end: 24 });
    expect((await temporary.courses.get(course.id))?.color).toBe("#123456");
    for (const range of [{ start: 14, end: 14 }, { start: -1, end: 22 }, { start: 0, end: 25 }, { start: 1.5, end: 22 }]) {
      await expect(saveScheduleRange(range, temporary)).rejects.toThrow();
      expect(() => parseBackup(JSON.stringify({ ...backup, settings: { ...backup.settings, scheduleRange: range } }))).toThrow();
    }
    await expect(updateCourseColor(course.id, "red", temporary)).rejects.toThrow();
    await importBackup(parseBackup(JSON.stringify({ ...backup, settings: defaults })), false, temporary);
    expect((await temporary.settings.get("main"))?.scheduleRange).toBeUndefined();
  } finally { await temporary.delete(); }
});
