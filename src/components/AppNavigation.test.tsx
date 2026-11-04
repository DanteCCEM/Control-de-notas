// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { AppNavigation } from "./AppNavigation";
import {
  academicModules,
  getAvailableAcademicModules,
} from "../modules/registry";
import userEvent from "@testing-library/user-event";

afterEach(cleanup);

it("mantiene Resumen y Calculadora sin publicar los módulos previstos", () => {
  render(<AppNavigation activeModule="grades" onOpenCalculator={() => {}} />);
  const navigation = screen.getByRole("navigation", {
    name: "Navegación académica",
  });
  const summary = within(navigation).getByRole("link", {
    name: "Resumen de notas",
  });
  expect(summary.getAttribute("href")).toBe("#notas");
  expect(summary.getAttribute("aria-current")).toBe("page");
  expect(within(navigation).getAllByRole("link")).toHaveLength(4);
  expect(within(navigation).getAllByRole("button")).toHaveLength(1);
  for (const label of ["Temporizador Pomodoro", "Apuntes por curso"])
    expect(within(navigation).queryByText(label)).toBeNull();
});
it("la acción de calculadora conserva su callback y su acceso por teclado", async () => {
  const open = vi.fn();
  const { rerender } = render(<AppNavigation onOpenCalculator={open} />);
  const user = userEvent.setup();
  const calculator = screen.getByRole("button", { name: "Calculadora" });
  await user.tab();
  await user.tab();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(document.activeElement).toBe(calculator);
  await user.keyboard("{Enter}");
  expect(open).toHaveBeenCalledTimes(1);
  const next = vi.fn();
  rerender(<AppNavigation onOpenCalculator={next} />);
  fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));
  expect(next).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
});
it("el registro reserva identificadores únicos y no asigna rutas a módulos pendientes", () => {
  expect(new Set(academicModules.map((m) => m.id)).size).toBe(
    academicModules.length,
  );
  expect(getAvailableAcademicModules().map((m) => m.id)).toEqual([
    "grades",
    "schedule",
    "settings",
  ]);
  expect(
    academicModules.filter((m) => m.status === "planned").map((m) => m.id),
  ).toEqual(["pomodoro", "notes", "account"]);
  for (const module of academicModules.filter((m) => m.status === "planned"))
    expect("href" in module).toBe(false);
});
