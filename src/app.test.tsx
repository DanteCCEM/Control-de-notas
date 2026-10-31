// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  calculate,
  csv,
  needed,
  parseBackup,
  validGrade,
  validWeights,
} from "./utils/grades";
import {
  db,
  defaults,
  exportBackup,
  importBackup,
  initialize,
  lockGrade,
  newCourse,
  updateGrade,
} from "./services/db";
import { GradeCell } from "./components/GradeCell";
afterEach(() => cleanup());
describe("Cálculos y validación", () => {
  it("usa las ponderaciones originales", () => {
    const c = newCourse("Ejemplo", [20, 25, 20, 35]);
    [16, 14, 18, 15].forEach((v, i) => (c.grades[i].value = v));
    expect(calculate(c).average).toBeCloseTo(15.55);
    expect(calculate(c).complete).toBe(true);
  });
  it("distingue vacío, cero y provisional", () => {
    const c = newCourse("Curso");
    expect(calculate(c).average).toBeNull();
    c.grades[0].value = 0;
    expect(calculate(c)).toMatchObject({
      count: 1,
      average: 0,
      complete: false,
    });
    c.grades[1].value = 16;
    expect(calculate(c).average).toBe(8);
    expect(calculate(c).accumulated).toBe(3.2);
  });
  it("valida rango y dos decimales", () => {
    expect([0, 20, 10.25].every(validGrade)).toBe(true);
    expect([-1, 21, NaN, Infinity, 12.345].some(validGrade)).toBe(false);
  });
  it("valida pesos", () => {
    expect(validWeights([20, 25, 20, 35])).toBe(true);
    expect(validWeights([20, 20, 20, 20])).toBe(false);
    expect(validWeights([-1, 21, 40, 40])).toBe(false);
    expect(validWeights([50, 50])).toBe(false);
  });
  it("calcula una nota y varias pendientes con distintos pesos", () => {
    const c = newCourse("Curso", [20, 25, 20, 35]);
    [15, 12, 14].forEach((v, i) => (c.grades[i].value = v));
    expect(needed(c, 11)).toBeCloseTo(2.2 / 0.35);
    c.grades[2].value = null;
    expect(needed(c, 11)).toBeCloseTo(5 / 0.55);
    expect(needed(c, 11, { 2: 14 })).toBeCloseTo(2.2 / 0.35);
    expect(c.grades[2].value).toBeNull();
    expect(needed(c, 20)).toBeGreaterThan(20);
    expect(needed(c, 0)).toBeLessThan(0);
  });
  it("exporta CSV con notas cero y celdas pendientes", () => {
    const c = newCourse("=SUM(1)");
    c.grades[0].value = 0;
    const s = csv([c]);
    expect(s.startsWith("\uFEFF")).toBe(true);
    expect(s).toContain('"\'=SUM(1)";"0";"20";""');
    expect(s).toContain("Provisional");
  });
  it("valida y restaura respaldo incluyendo candados", () => {
    const c = newCourse("Curso");
    c.grades[0] = { value: 0, locked: true };
    const b = { version: 1, courses: [c], settings: defaults };
    expect(parseBackup(JSON.stringify(b))).toEqual(b);
    expect(() =>
      parseBackup(JSON.stringify({ ...b, courses: [c, c] })),
    ).toThrow();
    expect(() => parseBackup("{}")).toThrow();
    c.grades[0].value = 21;
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
  });
});
describe("Candados", () => {
  it("bloquea una celda vacía con un clic", () => {
    const onLock = vi.fn().mockResolvedValue(undefined);
    render(
      <GradeCell
        grade={{ value: null, locked: false }}
        label="Nota"
        onValue={vi.fn()}
        onLock={onLock}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onLock).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("un clic no desbloquea; doble clic sí", () => {
    const onLock = vi.fn().mockResolvedValue(undefined);
    render(
      <GradeCell
        grade={{ value: 15, locked: true }}
        label="Nota"
        onValue={vi.fn()}
        onLock={onLock}
      />,
    );
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(onLock).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(onLock).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("no revierte el bloqueo por el segundo clic de un doble clic", () => {
    const onLock = vi.fn().mockResolvedValue(undefined);
    render(
      <GradeCell
        grade={{ value: null, locked: false }}
        label="Nota"
        onValue={vi.fn()}
        onLock={onLock}
      />,
    );
    fireEvent.click(screen.getByRole("button"), { detail: 1 });
    fireEvent.click(screen.getByRole("button"), { detail: 2 });
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(onLock).toHaveBeenCalledExactlyOnceWith(true);
  });
});
describe("IndexedDB", () => {
  it("inicializa solo una vez y conserva una base intencionalmente vacía", async () => {
    await db.delete();
    await db.open();
    await initialize();
    expect(await db.courses.count()).toBe(6);
    await initialize();
    expect(await db.courses.count()).toBe(6);
    await db.courses.clear();
    await initialize();
    expect(await db.courses.count()).toBe(0);
  });
  it("persiste notas y candados al reabrir y protege escrituras", async () => {
    const c = newCourse("Persistente");
    await db.courses.put(c);
    await updateGrade(c.id, 0, 15.25);
    await lockGrade(c.id, 0, true);
    await expect(updateGrade(c.id, 0, 9)).rejects.toThrow("bloqueada");
    db.close();
    await db.open();
    expect((await db.courses.get(c.id))?.grades[0]).toEqual({
      value: 15.25,
      locked: true,
    });
    await lockGrade(c.id, 0, false);
    await updateGrade(c.id, 0, 0);
    expect((await db.courses.get(c.id))?.grades[0].value).toBe(0);
  });
  it("no pierde cambios rápidos en notas independientes", async () => {
    const c = newCourse("Rápido");
    await db.courses.put(c);
    await Promise.all([
      updateGrade(c.id, 0, 12),
      updateGrade(c.id, 1, 14),
      lockGrade(c.id, 2, true),
    ]);
    const saved = await db.courses.get(c.id);
    expect(saved?.grades.map((g) => g.value)).toEqual([12, 14, null, null]);
    expect(saved?.grades[2].locked).toBe(true);
  });
  it("exporta e importa atómicamente datos completos", async () => {
    const b = await exportBackup();
    await db.courses.clear();
    await importBackup(parseBackup(JSON.stringify(b)));
    expect(await exportBackup()).toEqual(b);
    db.close();
  });
});

// These tests rerender after each lock change, matching the real dashboard.
describe("Secuencias reales de candado", () => {
  it("un doble clic inicial bloquea, el siguiente desbloquea", async () => {
    const React = await import("react");
    const userEvent = (await import("@testing-library/user-event")).default;
    const user = userEvent.setup();
    function Harness() {
      const [locked, setLocked] = React.useState(false);
      return (
        <GradeCell
          label="Interacción"
          grade={{ value: 15, locked }}
          onValue={async () => {}}
          onLock={async (v) => setLocked(v)}
        />
      );
    }
    render(<Harness />);
    await user.dblClick(screen.getByRole("button"));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button"));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(
      true,
    );
    await user.dblClick(screen.getByRole("button"));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(
      false,
    );
  });
  it("solo guarda notas válidas y conserva el cero explícito", () => {
    const onValue = vi.fn().mockResolvedValue(undefined);
    render(
      <GradeCell
        label="Validación"
        grade={{ value: null, locked: false }}
        onValue={onValue}
        onLock={async () => {}}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "21" },
    });
    expect(onValue).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0" },
    });
    expect(onValue).toHaveBeenLastCalledWith(0);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    expect(onValue).toHaveBeenLastCalledWith(null);
  });
});
