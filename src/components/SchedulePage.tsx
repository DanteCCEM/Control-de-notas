import { useState, type CSSProperties, type ReactNode } from "react";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Video,
  Pencil,
  Trash2,
  UserRound,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import type { Course } from "../types";
import { weekDays, type ScheduleSession } from "../types/schedule";
import { useLocalClock, useSchedule, useScheduleRange } from "../hooks/useSchedule";
import {
  nextClass,
  remainingTime,
  minuteToTime,
  mondayOfWeek,
  sessionOccurrence,
  courseColors,
  layoutSessions,
  sessionConflicts,
} from "../utils/schedule";
import { deleteSession } from "../services/schedule";
import { SessionEditor } from "./SessionEditor";
import { CourseBadge } from "./CourseBadge";
import { courseDarkColors } from "../utils/courseColors";
import { Modal } from "./Modal";
import { weekSessions, recurrenceLabel, parseLocalDate } from "../utils/recurrence";
import "./SchedulePage.css";
const dateLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
export function SchedulePage({
  courses,
  backupActions,
}: {
  courses: readonly Course[];
  backupActions: ReactNode;
}) {
  const storedSessions = useSchedule();
  const now = useLocalClock();
  const { range, save: saveRange } = useScheduleRange();
  const [weekOffset, setWeekOffset] = useState(0),
    [day, setDay] = useState((now.getDay() + 6) % 7);
  const [editor, setEditor] = useState<ScheduleSession | null | undefined>(
      undefined,
    ),
    [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ScheduleSession | null>(null);
  const week = mondayOfWeek(now);
  week.setDate(week.getDate() + weekOffset * 7);
  const last = new Date(week);
  last.setDate(last.getDate() + 6);
  const sessions = storedSessions ? weekSessions(storedSessions, week) : undefined;
  if (!sessions || !range)
    return (
      <section className="panel schedule-loading" role="status">
        Cargando tu horario…
      </section>
    );
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const { start: rangeStart, end: rangeEnd } = range;
  async function changeRange(start: number, end: number) {
    try { await saveRange({ start, end }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el rango horario."); }
  }
  const next = nextClass(storedSessions!, now);
  const hours = Array.from(
    { length: rangeEnd - rangeStart + 1 },
    (_, i) => rangeStart + i,
  );
  const start = rangeStart * 60,
    end = rangeEnd * 60;
  const outside = sessions.filter(
    (s) => s.startMinute < start || s.endMinute > end,
  ).length;
  const conflictCount = sessions.filter(
    (s) => sessionConflicts(s, sessions).length > 0,
  ).length;
  const current = (s: ScheduleSession) => {
    const occurrence = sessionOccurrence(s, week);
    return occurrence.start <= now && now < occurrence.end;
  };
  const style = (s: ScheduleSession): CSSProperties => {
    const [accent, tint] = courseColors(s.courseId, courseById.get(s.courseId)?.color);
    const [darkAccent, darkTint] = courseDarkColors(s.courseId, courseById.get(s.courseId)?.color);
    return {
      "--session-accent": accent,
      "--session-tint": tint,
      "--session-dark-accent": darkAccent,
      "--session-dark-tint": darkTint,
    } as CSSProperties;
  };
  async function remove(s: ScheduleSession) {
    if (s.seriesId) { setDeleteTarget(s); return; }
    if (
      !confirm(
        s.recurrence ? "¿Eliminar toda la serie, incluidas sus excepciones?" : `¿Eliminar la sesión de ${courseById.get(s.courseId)?.name ?? "este curso"} del ${weekDays[s.day]}, ${minuteToTime(s.startMinute)}–${minuteToTime(s.endMinute)}?`,
      )
    )
      return;
    try {
      await deleteSession(s.id);
      setMessage("Sesión eliminada.");
    } catch {
      setMessage("Error: no se pudo eliminar la sesión.");
    }
  }
  async function removeRecurring(all: boolean) {
    if (!deleteTarget?.seriesId) return;
    if (!confirm(all ? "¿Eliminar toda la serie, incluidas sus excepciones?" : "¿Eliminar solo esta clase? Las demás se conservarán.")) return;
    try {
      await deleteSession(deleteTarget.seriesId, undefined, all ? undefined : deleteTarget.occurrenceIndex);
      setDeleteTarget(null);
      setMessage(all ? "Serie eliminada." : "Clase eliminada. Las demás se conservaron.");
    } catch { setMessage("No se pudo eliminar la clase."); }
  }
  function details(s: ScheduleSession) {
    return (
      <>
        <div className="session-title">
          {courseById.get(s.courseId)?.name ?? "Curso no disponible"}
        </div>
        <div className="session-time">
          <Clock3 size={12} />
          {minuteToTime(s.startMinute)}–{minuteToTime(s.endMinute)}
        </div>
        <div className="session-location">
          <MapPin size={12} />
          {s.location || "Ubicación sin indicar"}
        </div>
        <div className="session-teacher">
          <UserRound size={12} />
          {s.teacher || "Docente sin indicar"}
        </div>
        <div className="session-mode">
          {s.modality}
          {current(s) && <strong> · En curso</strong>}
        </div>
      </>
    );
  }
  return (
    <section className="schedule-page" aria-label="Mi Horario">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU SEMANA, EN EQUILIBRIO</div>
          <h1>
            Mi Horario<span>.</span>
          </h1>
          <p>
            Clases semanales, unidas a tus cursos. Todo se guarda en este
            navegador.
          </p>
        </div>
        <button
          className="primary"
          disabled={!courses.length}
          onClick={() => setEditor(null)}
        >
          <Plus size={17} />
          Agregar sesión
        </button>
      </div>
      <div className="schedule-overview">
        <article
          className={"panel next-class" + (next?.isCurrent ? " class-now" : "")}
        >
          <div className="next-icon">
            <CalendarDays size={27} />
          </div>
          <div>
            <div className="eyebrow">
              {next?.isCurrent ? "CLASE EN CURSO" : "PRÓXIMA CLASE"}
            </div>
            {next ? (
              <>
                <h2>
                  {courseById.get(next.session.courseId) && <CourseBadge course={courseById.get(next.session.courseId)!} />}
                  {courseById.get(next.session.courseId)?.name ??
                    "Curso no disponible"}
                </h2>
                <p>
                  {weekDays[next.session.day]} {dateLabel(next.start)} ·{" "}
                  {minuteToTime(next.session.startMinute)}–
                  {minuteToTime(next.session.endMinute)}
                </p>
                <p>
                  {next.session.location || next.session.modality} ·{" "}
                  {next.isCurrent ? "Termina" : "Comienza"} en{" "}
                  <strong>
                    {remainingTime(
                      (next.isCurrent ? next.end : next.start).getTime() -
                        now.getTime(),
                    )}
                  </strong>
                </p>
                {next.session.meetingUrl && (
                  <a
                    className="meeting-link"
                    href={next.session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Video size={14} />
                    Abrir videoconferencia <ExternalLink size={12} />
                  </a>
                )}
              </>
            ) : (
              <>
                <h2>Aún no hay clases registradas</h2>
                <p>
                  Agrega tu primera sesión para ver aquí tu próximo encuentro.
                </p>
              </>
            )}
          </div>
        </article>
        <article className="panel schedule-info">
          <h3>Tu semana académica</h3>
          <p>
            <strong>{sessions.length}</strong> sesiones ·{" "}
            <strong>{new Set(sessions.map((s) => s.courseId)).size}</strong>{" "}
            cursos
          </p>
          <p>
            Hora local del dispositivo:{" "}
            {now.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {conflictCount > 0 && (
            <p className="schedule-conflict">
              <TriangleAlert size={14} />
              {conflictCount} sesiones con solapamientos
            </p>
          )}
        </article>
      </div>
      {!courses.length && (
        <p className="schedule-warning">
          Agrega un curso en Resumen de notas antes de crear sesiones.
        </p>
      )}
      <section className="panel schedule-calendar">
        <div className="schedule-toolbar">
          <div className="week-controls">
            <button
              className="icon"
              aria-label="Semana anterior"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>
              {dateLabel(week)} — {dateLabel(last)} · {week.getFullYear()}
            </strong>
            <button
              className="icon"
              aria-label="Semana siguiente"
              onClick={() => setWeekOffset((w) => w + 1)}
            >
              <ChevronRight size={17} />
            </button>
            <button
              onClick={() => {
                setWeekOffset(0);
                setDay((now.getDay() + 6) % 7);
              }}
            >
              Hoy
            </button>
          </div>
          <div className="range-controls">
            <label>Ir a semana<input type="date" min="1900-01-01" max="9998-01-01" onChange={e => {
              if (!e.target.value) return;
              try { setWeekOffset(Math.round((mondayOfWeek(parseLocalDate(e.target.value)).getTime() - mondayOfWeek(now).getTime()) / 604800000)); } catch { setMessage("Selecciona una fecha válida."); }
            }} /></label>
            <label>
              Desde
              <select
                aria-label="Hora inicial visible"
                value={rangeStart}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  void changeRange(h, h >= rangeEnd ? h + 1 : rangeEnd);
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {minuteToTime(i * 60)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hasta
              <select
                aria-label="Hora final visible"
                value={rangeEnd}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  void changeRange(h <= rangeStart ? h - 1 : rangeStart, h);
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {minuteToTime((i + 1) * 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {outside > 0 && (
          <p className="range-warning">
            {outside} sesiones están parcial o totalmente fuera del rango
            visible.{" "}
            <button
              onClick={() => {
                void changeRange(0, 24);
              }}
            >
              Ver día completo
            </button>
          </p>
        )}
        <div
          className="weekly-scroll"
          tabIndex={0}
          role="region"
          aria-label="Calendario semanal con desplazamiento"
        >
          <div className="weekly-calendar">
            <div className="week-headers">
              <div>Hora</div>
              {weekDays.map((d, i) => {
                const date = new Date(week);
                date.setDate(date.getDate() + i);
                return (
                  <div
                    key={d}
                    className={
                      date.toDateString() === now.toDateString() ? "today" : ""
                    }
                  >
                    {d}
                    <small>{dateLabel(date)}</small>
                  </div>
                );
              })}
            </div>
            <div
              className="week-body"
              style={{ height: (rangeEnd - rangeStart) * 72 }}
            >
              <div className="time-axis">
                {hours.slice(0, -1).map((h) => (
                  <span key={h} style={{ top: (h - rangeStart) * 72 }}>
                    {minuteToTime(h * 60)}
                  </span>
                ))}
              </div>
              {weekDays.map((d, i) => (
                <div className="day-column" key={d}>
                  {layoutSessions(
                    sessions.filter((s) => s.day === i),
                    start,
                    end,
                  ).map((item) => {
                    const s = item.session;
                    const full = `${courseById.get(s.courseId)?.name}, ${d}, ${minuteToTime(s.startMinute)} a ${minuteToTime(s.endMinute)}, ${s.location || s.modality}. Editar sesión`;
                    return (
                      <button
                        key={s.id}
                        className={
                          "class-block" + (current(s) ? " is-current" : "")
                        }
                        aria-label={full}
                        title={`${full}\nDocente: ${s.teacher || "sin indicar"}\n${s.modality}`}
                        style={{
                          ...style(s),
                          top: ((item.start - start) / 60) * 72,
                          height: ((item.end - item.start) / 60) * 72,
                          left: `calc(${(item.column / item.columns) * 100}% + 2px)`,
                          width: `calc(${100 / item.columns}% - 4px)`,
                        }}
                        onClick={() => setEditor(s)}
                      >
                        {details(s)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="daily-view">
          <div className="day-tabs" role="group" aria-label="Seleccionar día">
            {weekDays.map((d, i) => (
              <button
                key={d}
                aria-pressed={day === i}
                className={day === i ? "selected" : ""}
                onClick={() => setDay(i)}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <h2>
            {weekDays[day]} ·{" "}
            {dateLabel(
              new Date(
                week.getFullYear(),
                week.getMonth(),
                week.getDate() + day,
              ),
            )}
          </h2>
          {sessions
            .filter(
              (s) =>
                s.day === day && s.startMinute < end && s.endMinute > start,
            )
            .sort((a, b) => a.startMinute - b.startMinute)
            .map((s) => (
              <article
                className={"daily-session" + (current(s) ? " is-current" : "")}
                style={style(s)}
                key={s.id}
              >
                <div>{details(s)}</div>
                <div className="session-actions">
                  <button
                    aria-label={
                      "Editar sesión de " + courseById.get(s.courseId)?.name
                    }
                    onClick={() => setEditor(s)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={
                      "Eliminar sesión de " + courseById.get(s.courseId)?.name
                    }
                    onClick={() => void remove(s)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          {!sessions.some(
            (s) => s.day === day && s.startMinute < end && s.endMinute > start,
          ) && (
            <p className="empty">
              No hay clases para este día en el rango visible.
            </p>
          )}
        </div>
        {!sessions.length && (
          <div className="schedule-empty">
            <CalendarDays size={30} />
            <h2>Un horario a tu medida</h2>
            <p>Registra tus clases para verlas distribuidas en la semana.</p>
          </div>
        )}
      </section>
      <section className="panel sessions-list">
        <div className="panel-heading">
          <div>
            <h2>Clases de esta semana</h2>
            <p>
              Abre un bloque para editarlo o administra todas las sesiones aquí.
            </p>
          </div>
          {backupActions}
        </div>
        {[...sessions]
          .sort((a, b) => a.day - b.day || a.startMinute - b.startMinute)
          .map((s) => (
            <article className="session-row" key={s.id} style={style(s)}>
              <span className="course-dot" />
              <div>
                <strong>
                  {courseById.get(s.courseId)?.name ?? "Curso no disponible"}
                </strong>
                <p>
                  {weekDays[s.day]} · {minuteToTime(s.startMinute)}–
                  {minuteToTime(s.endMinute)} · {s.location || s.modality}
                  {s.teacher ? " · " + s.teacher : ""}
                </p>
                <p>{s.seriesId ? `${s.date} · clase ${(s.occurrenceIndex ?? 0) + 1} de la serie` : recurrenceLabel(s)}</p>
              </div>
              <div className="session-actions">
                <button
                  aria-label={`Editar ${weekDays[s.day]} ${minuteToTime(s.startMinute)} ${courseById.get(s.courseId)?.name}`}
                  onClick={() => setEditor(s)}
                >
                  <Pencil size={15} />
                  Editar
                </button>
                <button
                  aria-label={`Eliminar ${weekDays[s.day]} ${minuteToTime(s.startMinute)} ${courseById.get(s.courseId)?.name}`}
                  onClick={() => void remove(s)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        {!sessions.length && (
          <p className="empty">
            Las sesiones se guardarán aquí automáticamente.
          </p>
        )}
      </section>
      <details className="panel stored-series">
        <summary>Administrar series y sesiones guardadas ({storedSessions!.length})</summary>
        <p>Incluye series terminadas o sin clases visibles. Aquí los cambios y la eliminación se aplican a toda la serie.</p>
        {storedSessions!.map(s => <article className="session-row" key={s.id} style={style(s)}>
          <span className="course-dot" /><div><strong>{courseById.get(s.courseId)?.name}</strong><p>{recurrenceLabel(s)}</p></div>
          <div className="session-actions"><button onClick={() => setEditor(s)}>{s.recurrence ? "Editar serie" : "Editar sesión"}</button><button className="error" onClick={() => void remove(s)}>{s.recurrence ? "Eliminar serie" : "Eliminar sesión"}</button></div>
        </article>)}
      </details>
      {message && (
        <p className="schedule-status" role="status">
          {message}
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </p>
      )}
      {editor !== undefined && (
        <SessionEditor
          key={editor?.id ?? "new"}
          session={editor}
          courses={courses}
          sessions={storedSessions!}
          master={editor?.seriesId ? storedSessions!.find(s => s.id === editor.seriesId) : undefined}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            setMessage("Horario guardado en este dispositivo.");
          }}
        />
      )}
      {deleteTarget && <Modal titleId="delete-series-title" onClose={() => setDeleteTarget(null)}>
        <h2 id="delete-series-title">Eliminar clase recurrente</h2>
        <p>{deleteTarget.date} · {courseById.get(deleteTarget.courseId)?.name}</p>
        <div className="editor-actions">
          <button onClick={() => void removeRecurring(false)}>Solo esta clase</button>
          <button className="error" onClick={() => void removeRecurring(true)}>Toda la serie</button>
          <button onClick={() => setDeleteTarget(null)}>Cancelar</button>
        </div>
      </Modal>}
    </section>
  );
}
