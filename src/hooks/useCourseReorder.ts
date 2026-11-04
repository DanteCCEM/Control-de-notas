import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Course } from "../types";
interface Drag { id: string; pointerId: number; startY: number; y: number; active: boolean; target: string; handle: HTMLButtonElement; }
export function useCourseReorder(courses: readonly Course[], onMove: (id: string, target: string) => Promise<void>) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; target: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; drag.current = null; }; }, []);
  function cancel() {
    const current = drag.current;
    drag.current = null;
    if (current?.handle.hasPointerCapture?.(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setPreview(null);
  }
  async function move(id: string, target: string) {
    if (pending.current || id === target) return;
    pending.current = true;
    setAnnouncement("");
    setSaving(true);
    try {
      await onMove(id, target);
      if (mounted.current) setAnnouncement("Orden guardado.");
    } catch (error) {
      if (mounted.current) setAnnouncement("No se pudo guardar el orden: " + (error instanceof Error ? error.message : String(error)));
    } finally { pending.current = false; if (mounted.current) setSaving(false); }
  }
  function updateTarget(current: Drag) {
    const rows = Array.from(current.handle.closest("tbody")?.querySelectorAll<HTMLTableRowElement>("tr[data-course-id]") ?? []);
    const closest = rows.reduce<HTMLTableRowElement | null>((best, row) => {
      const rect = row.getBoundingClientRect();
      if (!best) return row;
      const previous = best.getBoundingClientRect();
      return Math.abs(current.y - (rect.top + rect.height / 2)) < Math.abs(current.y - (previous.top + previous.height / 2)) ? row : best;
    }, null);
    current.target = closest?.dataset.courseId ?? current.id;
    setPreview({ id: current.id, target: current.target });
  }
  useEffect(() => {
    if (!preview) return;
    let frame: number;
    function tick() {
      const current = drag.current;
      if (!current?.active) return;
      const edge = 70;
      const amount = current.y < edge ? -12 : current.y > window.innerHeight - edge ? 12 : 0;
      if (amount) { window.scrollBy(0, amount); updateTarget(current); }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { cancel(); setAnnouncement("Movimiento cancelado."); } };
    window.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape); };
  }, [!!preview]);
  return { preview, saving, announcement, move,
    handleProps(id: string) {
      return {
        onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
          if (pending.current || drag.current || !event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id, target: id, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, active: false, handle: event.currentTarget };
        },
        onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          current.y = event.clientY;
          if (Math.abs(current.y - current.startY) >= 6) current.active = true;
          if (current.active) { event.preventDefault(); updateTarget(current); }
        },
        onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const { active, id: source, target } = current;
          cancel();
          if (active) void move(source, target);
        },
        onPointerCancel: cancel,
        onLostPointerCapture: cancel,
      };
    },
    rowClass(id: string) {
      if (!preview) return "";
      if (preview.id === id) return "course-dragging";
      if (preview.target !== id) return "";
      return courses.findIndex(c => c.id === preview.id) < courses.findIndex(c => c.id === id) ? "course-drop-after" : "course-drop-before";
    },
  };
}
