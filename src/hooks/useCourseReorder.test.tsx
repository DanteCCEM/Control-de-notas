// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCourseReorder } from "./useCourseReorder";
import { newCourse } from "../services/db";
const courses = [newCourse("A"), newCourse("B"), newCourse("C")];
function Harness({ save }: { save: (id: string, target: string) => Promise<void> }) {
  const reorder = useCourseReorder(courses, save);
  return <><table><tbody>{courses.map((c, index) => <tr key={c.id} data-course-id={c.id} className={reorder.rowClass(c.id)}><td><button {...reorder.handleProps(c.id)}>{c.name}</button><button disabled={reorder.saving || index === 0} aria-label={"Subir " + c.name} onClick={() => void reorder.move(c.id, courses[index - 1].id)}>↑</button><input aria-label={"Nota " + c.name} /></td></tr>)}</tbody></table><p role="status">{reorder.announcement}</p></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(save = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number; isPrimary: boolean; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true; this.pointerType = init.pointerType ?? "mouse"; }
  });
  render(<Harness save={save} />);
  const handle = screen.getByRole("button", { name: "A" });
  handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = () => false;
  screen.getAllByRole("row").forEach((row, index) => vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: index * 100, height: 100 } as DOMRect));
  return { handle, save };
}
for (const pointerType of ["mouse", "touch"]) it("arrastra con " + pointerType + " sin escribir notas", async () => {
  const { handle, save } = setup();
  const event = { pointerId: 1, isPrimary: true, pointerType, button: 0 };
  fireEvent.pointerDown(handle, { ...event, clientY: 50 });
  fireEvent.pointerMove(handle, { ...event, clientY: 250 });
  expect(screen.getAllByRole("row")[2].className).toBe("course-drop-after");
  fireEvent.pointerUp(handle, { ...event, clientY: 250 });
  await waitFor(() => expect(save).toHaveBeenCalledWith(courses[0].id, courses[2].id));
  expect((screen.getByLabelText("Nota A") as HTMLInputElement).value).toBe("");
});
it("cancela con Escape sin persistir y no inicia el arrastre desde una nota", () => {
  const { handle, save } = setup();
  fireEvent.pointerDown(screen.getByLabelText("Nota A"), { clientY: 50 });
  fireEvent.pointerMove(handle, { clientY: 250 });
  expect(screen.getAllByRole("row").every(row => !row.className)).toBe(true);
  fireEvent.pointerDown(handle, { clientY: 50 });
  fireEvent.pointerMove(handle, { clientY: 250 });
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.pointerUp(handle, { clientY: 250 });
  expect(save).not.toHaveBeenCalled();
});
it("la alternativa por botón persiste y anuncia fallos sin dejar controles bloqueados", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error("Sin espacio")).mockResolvedValue(undefined);
  setup(save);
  expect((screen.getByRole("button", { name: "Subir A" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Subir B" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Sin espacio"));
  fireEvent.click(screen.getByRole("button", { name: "Subir B" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Orden guardado."));
  expect(save).toHaveBeenLastCalledWith(courses[1].id, courses[0].id);
});
