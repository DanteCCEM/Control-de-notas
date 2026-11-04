// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, renderHook, act } from "@testing-library/react";
import { HomePage } from "./HomePage";
import { useModuleNavigation } from "../hooks/useModuleNavigation";
import { newCourse } from "../services/db";
import { useSchedule } from "../hooks/useSchedule";
vi.mock("../hooks/useSchedule", () => ({ useSchedule: vi.fn(() => []), useLocalClock: () => new Date(2026, 10, 4, 10) }));
afterEach(() => { cleanup(); vi.mocked(useSchedule).mockReturnValue([]); history.replaceState(null, "", "/"); });
it("muestra datos reales, accesos disponibles y módulos futuros sin enlaces", () => {
 const course = newCourse("Álgebra"); course.grades = course.grades.map(() => ({value: 16, locked: true}));
 const before = JSON.stringify(course);
 render(<HomePage courses={[course]} />);
 expect(screen.getByText("16.00")).toBeTruthy();
 expect(screen.getByText("Aún no hay clases programadas.")).toBeTruthy();
 expect(screen.getAllByText("Próximamente")).toHaveLength(3);
 expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["#notas", "#horario", "#configuracion"]);
 expect(JSON.stringify(course)).toBe(before);
});
it("resuelve inicio, módulos, regreso y rutas desconocidas", () => {
 const { result } = renderHook(() => useModuleNavigation());
 expect(result.current).toBe("home");
 for (const [hash, page] of [["#notas", "grades"], ["#horario", "schedule"], ["#configuracion", "settings"], ["#", "home"], ["#pomodoro", "home"]]) {
   act(() => { history.replaceState(null, "", hash); window.dispatchEvent(new Event("hashchange")); });
   expect(result.current).toBe(page);
 }
});
it("muestra el estado vacío sin inventar promedios", () => {
 render(<HomePage courses={[]} />);
 expect(screen.getByText("Aún no hay notas registradas")).toBeTruthy();
 expect(screen.getByText("—")).toBeTruthy();
});
it("muestra la clase en curso con el color guardado y textos legibles", () => {
 const course = { ...newCourse("Álgebra"), color: "#123456" };
 vi.mocked(useSchedule).mockReturnValue([{ id: "session", courseId: course.id, day: 2, startMinute: 570, endMinute: 660, location: "Aula 201", teacher: "", modality: "presencial", meetingUrl: "", notes: "" }]);
 render(<HomePage courses={[course]} />);
 expect(screen.getByText("Clase en curso")).toBeTruthy();
 expect(screen.getByText("Álgebra")).toBeTruthy();
 expect(screen.getByText("Aula 201")).toBeTruthy();
 expect(document.querySelector(".course-color-badge")?.getAttribute("style")).toContain("rgb(18, 52, 86)");
 expect(screen.getAllByText("Próximamente")).toHaveLength(3);
 expect(screen.getByRole("heading", { name: "Configuración" })).toBeTruthy();
 expect(screen.getByLabelText("Resumen académico")).toBeTruthy();
});
