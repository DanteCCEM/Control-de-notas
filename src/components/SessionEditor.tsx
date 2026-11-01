import { useState } from "react";
import { X, Save, TriangleAlert } from "lucide-react";
import type { Course } from "../types";
import {
  weekDays,
  modalities,
  type ScheduleSession,
  type SessionDraft,
} from "../types/schedule";
import { Modal } from "./Modal";
import { saveSessions } from "../services/schedule";
import {
  minuteToTime,
  timeToMinute,
  overlaps,
  sameSlot,
} from "../utils/schedule";

export function SessionEditor({
  session,
  courses,
  sessions,
  onClose,
  onSaved,
}: {
  session: ScheduleSession | null;
  courses: readonly Course[];
  sessions: readonly ScheduleSession[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SessionDraft>(() => ({
    id: session?.id,
    courseId: session?.courseId ?? courses[0]?.id ?? "",
    days: session ? [session.day] : [0],
    startMinute: session?.startMinute ?? 480,
    endMinute: session?.endMinute ?? 540,
    location: session?.location ?? "",
    teacher: session?.teacher ?? "",
    modality: session?.modality ?? "presencial",
    meetingUrl: session?.meetingUrl ?? "",
    notes: session?.notes ?? "",
  }));
  const [start, setStart] = useState(minuteToTime(draft.startMinute)),
    [end, setEnd] = useState(minuteToTime(draft.endMinute));
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [allow, setAllow] = useState(false);
  function change(patch: Partial<SessionDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setAllow(false);
    setError("");
  }
  const proposed = draft.days.map((day) => ({
    ...draft,
    id: draft.id ?? "preview",
    day,
    startMinute: timeToMinute(start),
    endMinute: timeToMinute(end),
  }));
  const conflicts = sessions.filter(
    (s) => s.id !== draft.id && proposed.some((p) => overlaps(p, s)),
  );
  const duplicate = sessions.some(
    (s) => s.id !== draft.id && proposed.some((p) => sameSlot(p, s)),
  );
  return (
    <Modal
      titleId="session-title"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <button
        className="close icon"
        disabled={saving}
        aria-label="Cerrar sesión"
        onClick={onClose}
      >
        <X />
      </button>
      <h2 id="session-title">{session ? "Editar sesión" : "Agregar sesión"}</h2>
      <form
        className="schedule-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await saveSessions(
              {
                ...draft,
                startMinute: timeToMinute(start),
                endMinute: timeToMinute(end),
                location: draft.location.trim(),
                teacher: draft.teacher.trim(),
                meetingUrl: draft.meetingUrl.trim(),
                notes: draft.notes.trim(),
              },
              allow,
            );
            onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "No se pudo guardar la sesión.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Curso *
          <select
            required
            value={draft.courseId}
            onChange={(e) => change({ courseId: e.target.value })}
          >
            {!courses.length && (
              <option value="">Agrega primero un curso</option>
            )}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>
            {session ? "Día de la sesión *" : "Días de la semana *"}
          </legend>
          <div className="day-checks">
            {weekDays.map((day, i) => (
              <label key={day}>
                <input
                  type={session ? "radio" : "checkbox"}
                  name="session-days"
                  checked={draft.days.includes(i)}
                  onChange={(e) =>
                    change({
                      days: session
                        ? [i]
                        : e.target.checked
                          ? [...draft.days, i]
                          : draft.days.filter((d) => d !== i),
                    })
                  }
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-columns">
          <label>
            Hora de inicio *
            <input
              required
              type="time"
              step="60"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setAllow(false);
              }}
            />
          </label>
          <label>
            Hora final *
            <input
              required
              type="time"
              step="60"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setAllow(false);
              }}
            />
          </label>
        </div>
        <p>
          Horas locales del dispositivo. Cada sesión debe empezar y terminar el
          mismo día.
        </p>
        <label>
          Modalidad *
          <select
            required
            value={draft.modality}
            onChange={(e) =>
              change({
                modality: e.target.value as ScheduleSession["modality"],
              })
            }
          >
            {modalities.map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="form-columns">
          <label>
            Aula o ubicación
            <input
              maxLength={120}
              value={draft.location}
              placeholder="Ej. Pabellón B · Aula 302"
              onChange={(e) => change({ location: e.target.value })}
            />
          </label>
          <label>
            Docente
            <input
              maxLength={120}
              value={draft.teacher}
              onChange={(e) => change({ teacher: e.target.value })}
            />
          </label>
        </div>
        <label>
          Enlace de videoconferencia
          <input
            type="url"
            maxLength={2048}
            placeholder="https://…"
            value={draft.meetingUrl}
            onChange={(e) => change({ meetingUrl: e.target.value })}
          />
        </label>
        <label>
          Observaciones
          <textarea
            rows={3}
            maxLength={3000}
            value={draft.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </label>
        {duplicate ? (
          <p className="schedule-warning" role="alert">
            Ya existe una sesión de este curso con el mismo día y horario.
          </p>
        ) : (
          conflicts.length > 0 && (
            <div className="schedule-warning" role="alert">
              <strong>
                <TriangleAlert size={16} /> Hay {conflicts.length}{" "}
                {conflicts.length === 1 ? "solapamiento" : "solapamientos"}
              </strong>
              <ul>
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {courses.find((x) => x.id === c.courseId)?.name ?? "Curso"}{" "}
                    · {weekDays[c.day]} {minuteToTime(c.startMinute)}–
                    {minuteToTime(c.endMinute)}
                  </li>
                ))}
              </ul>
              <label className="confirm-conflict">
                <input
                  type="checkbox"
                  checked={allow}
                  onChange={(e) => setAllow(e.target.checked)}
                />
                Entiendo el conflicto y quiero guardar estas sesiones
                igualmente.
              </label>
            </div>
          )
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={
              saving ||
              !courses.length ||
              duplicate ||
              (conflicts.length > 0 && !allow)
            }
          >
            <Save size={16} />
            {saving ? "Guardando…" : "Guardar sesión"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
