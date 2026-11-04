import { useEffect, useState } from "react";
import type { Course } from "../types";
import { updateCourseColor } from "../services/db";
import { CourseColorPicker } from "./CourseColorPicker";
export function ScheduleCourseColor({ course }: { course: Course }) {
  const [color, setColor] = useState(course.color);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { setColor(course.color); }, [course.color]);
  async function save(value: string | undefined) {
    setSaving(true); setColor(value); setNotice("");
    try { await updateCourseColor(course.id, value); setNotice("Color guardado para todas las clases de este curso."); }
    catch (error) { setColor(course.color); setNotice(error instanceof Error ? error.message : "No se pudo guardar el color."); }
    finally { setSaving(false); }
  }
  return <div>
    <CourseColorPicker id={course.id} color={color} disabled={saving} onChange={value => void save(value)} />
    <p>El color se guarda automáticamente y se aplica al curso completo, incluidas sus otras clases.</p>
    <p role="status">{saving ? "Guardando color…" : notice}</p>
  </div>;
}
