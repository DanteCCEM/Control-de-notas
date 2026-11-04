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
import { proposedSessions, saveSessions } from "../services/schedule";
import { dateDay, expandSession, localDate, MAX_WEEKS, recurrenceLabel, sessionFields } from "../utils/recurrence";
import {
  minuteToTime,
  timeToMinute,
  overlaps,
  sameSlot,
} from "../utils/schedule";

export function SessionEditor({
  session,
  master,
  courses,
  sessions,
  onClose,
  onSaved,
}: {
  session: ScheduleSession | null;
  master?: ScheduleSession;
  courses: readonly Course[];
  sessions: readonly ScheduleSession[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SessionDraft>(() => ({
    id: session?.id,
    courseId: session?.courseId ?? courses[0]?.id ?? "",
    days: session ? [session.day] : [dateDay(localDate(new Date()))],
    date: session ? session.date : localDate(new Date()),
    recurrence: session?.recurrence,
    seriesId: session?.seriesId,
    occurrenceIndex: session?.occurrenceIndex,
    startMinute: session?.startMinute ?? 480,
    endMinute: session?.endMinute ?? 540,
    location: session?.location ?? "",
    teacher: session?.teacher ?? "",
    modality: session?.modality ?? "presencial",
    meetingUrl: session?.meetingUrl ?? "",
    notes: session?.notes ?? "",
  }));
  const [scope, setScope] = useState<"occurrence" | "series">("occurrence");
  const mode = draft.recurrence ? "weekly" : draft.date ? "once" : "legacy";
  const effectiveRecurrence = draft.recurrence && Number.isInteger(draft.recurrence.weeks) && draft.recurrence.weeks >= 1 && draft.recurrence.weeks <= MAX_WEEKS
    ? { ...draft.recurrence, exceptions: Object.fromEntries(Object.entries(draft.recurrence.exceptions).filter(([index]) => Number(index) < draft.recurrence!.weeks)) }
    : draft.recurrence;
  function selectScope(value: "occurrence" | "series") {
    const source = value === "series" ? master : session;
    if (!source) return;
    setScope(value);
    setDraft({ ...sessionFields(source), id: source.id, days: [source.day], date: source.date, recurrence: source.recurrence, seriesId: source.seriesId, occurrenceIndex: source.occurrenceIndex });
    setStart(minuteToTime(source.startMinute)); setEnd(minuteToTime(source.endMinute));
    setAllow(false); setError("");
  }
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
  let proposed: ScheduleSession[] = [];
  try { proposed = proposedSessions({ ...draft, recurrence: effectiveRecurrence, startMinute: timeToMinute(start), endMinute: timeToMinute(end) }); } catch { /* Service reports invalid inputs on submit. */ }
  const others = sessions.flatMap(s => {
    if (s.id === draft.seriesId) return expandSession(s).filter(o => o.occurrenceIndex !== draft.occurrenceIndex);
    return s.id === draft.id ? [] : [s];
  });
  const expanded = proposed.flatMap(expandSession);
  const internal = expanded.filter((s, i) => expanded.some((other, j) => i !== j && overlaps(s, other)));
  const conflicts = [...others.filter(s => proposed.some(p => overlaps(p, s))), ...internal];
  const duplicate = others.some(s => proposed.some(p => sameSlot(p, s))) || expanded.some((s, i) => expanded.some((other, j) => i !== j && sameSlot(s, other)));
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
      <h2 id="session-title">{session?.recurrence ? "Editar serie" : session ? "Editar sesión" : "Agregar sesión"}</h2>
      {session?.recurrence && !master && <p>Los cambios se aplican a toda la serie. Las excepciones existentes se conservan.</p>}
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
                recurrence: effectiveRecurrence,
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
        {master && <fieldset><legend>Aplicar cambios a</legend>
          <label><input type="radio" name="edit-scope" checked={scope === "occurrence"} onChange={() => selectScope("occurrence")} />Solo esta clase</label>
          <label><input type="radio" name="edit-scope" checked={scope === "series"} onChange={() => selectScope("series")} />Toda la serie</label>
          <p>{recurrenceLabel(master)}. Los cambios de una clase se guardan como excepción. Al editar toda la serie se conservan las excepciones existentes.</p>
        </fieldset>}
        <label>
          Curso *
          <select
            required
            disabled={!!master && scope === "occurrence"}
            value={draft.courseId}
            onChange={(e) => {
              const courseId = e.target.value;
              const recurrence = draft.recurrence ? { ...draft.recurrence, exceptions: Object.fromEntries(Object.entries(draft.recurrence.exceptions).map(([index, exception]) => [index, "override" in exception ? { override: { ...exception.override, courseId } } : exception])) } : undefined;
              change({ courseId, recurrence });
            }}
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
        <fieldset><legend>Repetición</legend>
          <label>Frecuencia<select value={mode} disabled={!!master && scope === "occurrence"} onChange={e => {
            const date = draft.date ?? localDate(new Date());
            change({ date: e.target.value === "legacy" ? undefined : date, days: [dateDay(date)], recurrence: e.target.value === "weekly" ? { weeks: 16, exceptions: {} } : undefined });
          }}>
            <option value="once">No repetir</option><option value="weekly">Repetir semanalmente</option>
            {!session?.date && session && <option value="legacy">Semanal sin límite (horario anterior)</option>}
          </select></label>
          {mode !== "legacy" && <label>{mode === "weekly" ? "Fecha de inicio de la recurrencia" : "Fecha de la clase"}<input type="date" required min="1900-01-01" max="9998-12-31" value={draft.date ?? ""} onChange={e => {
            const date = e.target.value;
            try { change({ date, days: date ? [dateDay(date)] : [] }); }
            catch { change({ date, days: [] }); setError("Selecciona una fecha válida entre 1900 y 9998."); }
          }} /></label>}
          {mode === "weekly" && <label>Cantidad de semanas<input type="number" min="1" max={MAX_WEEKS} required step="1" value={draft.recurrence!.weeks} onChange={e => {
            const weeks = Number(e.target.value);
            change({ recurrence: { ...draft.recurrence!, weeks } });
          }} /></label>}
          {mode === "weekly" && session && <p>Al reducir las semanas se eliminan las clases posteriores y sus excepciones al guardar.</p>}
          {mode === "weekly" && proposed[0] && <p>{recurrenceLabel(proposed[0])}. Incluye la primera clase.</p>}
          {master && scope === "occurrence" && <p>Esta fecha y sus cambios se aplican solo a la clase seleccionada.</p>}
        </fieldset>
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
                  disabled={mode !== "legacy"}
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
