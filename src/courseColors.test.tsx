// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { courseColors, coursePalette } from "./utils/courseColors";
import { db, defaults, exportBackup, importBackup, newCourse, saveCourse, updateGrade, lockGrade } from "./services/db";
import { parseBackup } from "./utils/grades";
import { saveSessions } from "./services/schedule";
import { CourseColorPicker } from "./components/CourseColorPicker";
import { SchedulePage } from "./components/SchedulePage";
import { useData } from "./hooks/useData";
afterEach(() => { cleanup(); db.close(); });
it("selecciona paleta, color personalizado y vuelve al automático", () => {
  function Picker() { const [color, setColor] = useState<string>(); return <CourseColorPicker id="a" color={color} onChange={setColor} />; }
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "Lavanda" }));
  expect(screen.getByRole("button", { name: "Lavanda" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.change(screen.getByLabelText("Color personalizado"), { target: { value: "#123456" } });
  expect(screen.getByText(/#123456/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Automático" }));
  expect(screen.getByRole("button", { name: "Automático" }).getAttribute("aria-pressed")).toBe("true");
});
it("persiste colores, refleja cambios en horario y restaura respaldos nuevos y antiguos", async () => {
  await db.delete(); await db.open(); await db.settings.put(defaults);
  const a = newCourse("Curso A"), b = newCourse("Curso B");
  await saveCourse(a); await saveCourse(b);
  await saveSessions({ courseId: a.id, days: [0], startMinute: 480, endMinute: 540, location: "Aula", teacher: "", modality: "presencial", meetingUrl: "", notes: "" });
  const sessions = await db.scheduleEntries.toArray();
  // A stale editor must not overwrite a more recent grade or lock.
  await updateGrade(a.id, 0, 18); await lockGrade(a.id, 0, true);
  const original = (await db.courses.get(a.id))!;
  await saveCourse({ ...a, color: "#123456" });
  await saveCourse({ ...b, color: "#ff8800" });
  expect(await db.courses.get(a.id)).toEqual({ ...original, color: "#123456" });
  function Schedule() { const { courses } = useData(); return courses ? <SchedulePage courses={courses} backupActions={null} /> : null; }
  const view = render(<Schedule />);
  await waitFor(() => expect(document.querySelector('.class-block')?.getAttribute('style')).toContain('#123456'));
  await saveCourse({ ...(await db.courses.get(a.id))!, color: "#abcdef" });
  await waitFor(() => expect(document.querySelector('.class-block')?.getAttribute('style')).toContain('#abcdef'));
  view.unmount(); db.close(); await db.open();
  expect((await db.courses.get(a.id))?.color).toBe("#abcdef");
  const backup = parseBackup(JSON.stringify(await exportBackup()));
  await importBackup(backup);
  expect((await db.courses.get(a.id))?.color).toBe("#abcdef");
  expect((await db.courses.get(b.id))?.color).toBe("#ff8800");
  expect(await db.scheduleEntries.toArray()).toEqual(sessions);
  const legacy = { ...backup, version: 1, courses: backup.courses.map(({ color, ...course }) => course) };
  await importBackup(parseBackup(JSON.stringify(legacy)));
  expect((await db.courses.get(a.id))?.color).toBeUndefined();
  expect((await db.courses.get(a.id))?.grades).toEqual(original.grades);
  expect(await db.scheduleEntries.toArray()).toEqual(sessions);
  expect(courseColors(a.id)).toEqual(courseColors(a.id, undefined));
  expect(() => parseBackup(JSON.stringify({ ...backup, courses: [{ ...backup.courses[0], color: "red" }] }))).toThrow();
});
it("mantiene contraste mínimo 4.5:1 con texto fijo en todas las superficies de curso", () => {
  function luminance(hex: string) {
    return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
  }
  for (const color of [undefined, "#000000", "#ffffff", "#ffff00", "#0000ff", ...coursePalette.map(option => option.color)]) {
    const [, tint] = courseColors("a", color);
    for (const text of ["#153c57", "#36576d", "#154d75"]) expect((luminance(tint) + .05) / (luminance(text) + .05)).toBeGreaterThanOrEqual(4.5);
  }
});
