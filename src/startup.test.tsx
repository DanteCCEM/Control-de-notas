// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useStartup,
  SPLASH_MINIMUM_MS,
  SPLASH_FADE_MS,
} from "./hooks/useStartup";
import { SplashScreen } from "./components/SplashScreen";
const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  courses: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("./services/db", () => ({
  initialize: mocks.initialize,
  db: {
    open: async () => undefined,
    courses: { toArray: mocks.courses },
    settings: { get: mocks.settings },
    transaction: async (...args: unknown[]) =>
      await (args.at(-1) as () => Promise<unknown>)(),
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  mocks.courses.mockReset().mockResolvedValue([]);
  mocks.settings.mockReset().mockResolvedValue({ id: "main" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
describe("Bienvenida e inicialización", () => {
  it("respeta 2500 ms y termina únicamente después del fade", async () => {
    const prepare = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStartup(prepare));
    await advance(0);
    act(() => result.current.setDataReady(true));
    await advance(SPLASH_MINIMUM_MS - 1);
    expect(result.current.leaving).toBe(false);
    await advance(1);
    expect(result.current.leaving).toBe(true);
    expect(result.current.finished).toBe(false);
    await advance(SPLASH_FADE_MS);
    expect(result.current.finished).toBe(true);
  });
  it("espera la inicialización lenta y después las consultas reactivas", async () => {
    let resolve!: () => void;
    const prepare = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const { result } = renderHook(() => useStartup(prepare));
    await advance(6000);
    expect(result.current.initialized).toBe(false);
    expect(result.current.leaving).toBe(false);
    await act(async () => resolve());
    expect(result.current.initialized).toBe(true);
    expect(result.current.leaving).toBe(false);
    act(() => result.current.setDataReady(true));
    expect(result.current.leaving).toBe(true);
    await advance(SPLASH_FADE_MS);
    expect(result.current.finished).toBe(true);
  });
  it("permite reintentar tras un error sin completar la bienvenida", async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disco no disponible"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useStartup(prepare));
    await advance(3000);
    expect(result.current.error).toBe("Disco no disponible");
    expect(result.current.finished).toBe(false);
    act(() => result.current.retry());
    await advance(0);
    expect(result.current.error).toBeNull();
    expect(result.current.initialized).toBe(true);
    act(() => result.current.setDataReady(true));
    await advance(SPLASH_MINIMUM_MS);
    await advance(SPLASH_FADE_MS);
    expect(result.current.finished).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it("no vuelve a mostrar la bienvenida al renderizar o cambiar la disponibilidad de datos", async () => {
    const prepare = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(() => useStartup(prepare));
    await advance(0);
    act(() => result.current.setDataReady(true));
    await advance(SPLASH_MINIMUM_MS);
    await advance(SPLASH_FADE_MS);
    rerender();
    expect(result.current.finished).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("cancela temporizadores al desmontar", async () => {
    const prepare = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useStartup(prepare));
    await advance(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("StrictMode comparte una sola inicialización y limpia el temporizador de salida", async () => {
    const { prepareApplication } = await import("./services/startup");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result, unmount } = renderHook(
      () => useStartup(prepareApplication),
      { wrapper },
    );
    await advance(0);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.courses).toHaveBeenCalledTimes(1);
    act(() => result.current.setDataReady(true));
    await advance(SPLASH_MINIMUM_MS);
    expect(result.current.leaving).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("un error de apertura permite una nueva transacción al reintentar", async () => {
    mocks.initialize
      .mockRejectedValueOnce(new Error("Acceso denegado"))
      .mockResolvedValue(undefined);
    const { prepareApplication } = await import("./services/startup");
    await expect(prepareApplication()).rejects.toThrow("Acceso denegado");
    await prepareApplication();
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
  });
  it("un error al recuperar los datos también permite reintentar", async () => {
    mocks.courses
      .mockRejectedValueOnce(new Error("Lectura interrumpida"))
      .mockResolvedValue([]);
    const { prepareApplication } = await import("./services/startup");
    await expect(prepareApplication()).rejects.toThrow("Lectura interrumpida");
    await prepareApplication();
    expect(mocks.courses).toHaveBeenCalledTimes(2);
  });
  it("muestra un progreso indeterminado y reintento accesible", () => {
    const onRetry = vi.fn();
    const props = {
      initialized: false,
      dataReady: false,
      leaving: false,
      error: null,
      onRetry,
    };
    const { rerender } = render(<SplashScreen {...props} />);
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Preparando");
    rerender(
      <SplashScreen {...props} error="No se puede abrir el almacenamiento" />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "No se puede abrir",
    );
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
