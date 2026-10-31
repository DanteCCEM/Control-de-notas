// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";
afterEach(cleanup);
it("monta la ventana fuera del panel con filtro de cristal", () => {
  const { container } = render(
    <div className="shell">
      <Modal titleId="test-title" onClose={() => {}}>
        <h2 id="test-title">Calculadora</h2>
        <button>Cerrar</button>
      </Modal>
    </div>,
  );
  const dialog = screen.getByRole("dialog");
  expect(container.contains(dialog)).toBe(false);
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(dialog.closest(".shell")).toBeNull();
});
it("conserva el foco, el cierre por Escape y restaura el desplazamiento al cerrar", () => {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "auto";
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const { unmount } = render(
    <Modal titleId="test-title" onClose={onClose}>
      <h2 id="test-title">Calculadora</h2>
      <button>Primero</button>
      <input aria-label="Objetivo" />
      <button>Último</button>
    </Modal>,
  );
  const first = screen.getByRole("button", { name: "Primero" }),
    last = screen.getByRole("button", { name: "Último" });
  expect(document.activeElement).toBe(first);
  expect(document.body.style.overflow).toBe("hidden");
  first.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
  expect(document.body.style.overflow).toBe("auto");
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
  document.body.style.overflow = previousOverflow;
});
