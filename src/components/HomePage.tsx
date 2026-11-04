import { BookOpen, CalendarDays, Timer, NotebookPen, UserRound, Settings, ArrowUpRight } from "lucide-react";
import type { Course } from "../types";
import { academicModules } from "../modules/registry";
import { calculate } from "../utils/grades";
import { nextClass, minuteToTime } from "../utils/schedule";
import { weekDays } from "../types/schedule";
import { useSchedule, useLocalClock } from "../hooks/useSchedule";
import "./HomePage.css";
import { CourseBadge } from "./CourseBadge";
const presentation = {
  grades: { title: "Mis Notas", description: "Tus evaluaciones, promedios y próximas metas.", Icon: BookOpen },
  schedule: { title: "Horario Universitario", description: "Organiza tus clases y encuentra tu próximo encuentro.", Icon: CalendarDays },
  pomodoro: { title: "Temporizador Pomodoro", description: "Un espacio para estudiar a tu ritmo.", Icon: Timer },
  notes: { title: "Apuntes por Curso", description: "Tus ideas y materiales en un solo lugar.", Icon: NotebookPen },
  account: { title: "Mi Cuenta", description: "Tu espacio personal para una futura etapa.", Icon: UserRound },
  settings: { title: "Configuración", description: "Ajusta tu meta, el tema y tus copias de seguridad.", Icon: Settings },
};
export function HomePage({ courses }: { courses: readonly Course[] }) {
  const sessions = useSchedule();
  const now = useLocalClock();
  const averages = courses.map(calculate).filter(result => result.average !== null);
  const average = averages.length ? averages.reduce((sum, result) => sum + result.average!, 0) / averages.length : null;
  const next = sessions ? nextClass(sessions, now) : null;
  return <section className="home-page" aria-label="Inicio">
    <div className="page-heading"><div><div className="eyebrow">TU ESPACIO ACADÉMICO</div><h1>Todo listo para avanzar<span>.</span></h1><p>Elige por dónde quieres empezar hoy.</p></div></div>
    <div className="home-summary" aria-label="Resumen académico">
      <article className="panel"><h2>Promedio general</h2><strong>{average === null ? "—" : average.toFixed(2)}<small> / 20</small></strong><p>{!averages.length ? "Aún no hay notas registradas" : averages.some(result => !result.complete) ? "Provisional · media simple entre cursos con notas" : "Definitivo · media simple entre cursos con notas"}</p></article>
      <article className="panel"><h2>Cursos registrados</h2><strong>{courses.length}</strong><p>Tu recorrido, curso a curso.</p></article>
      <article className="panel"><h2>{next?.isCurrent ? "Clase en curso" : "Próxima clase"}</h2>{!sessions ? <p role="status">Cargando horario…</p> : next ? <><h3>{courses.find(course => course.id === next.session.courseId) && <CourseBadge course={courses.find(course => course.id === next.session.courseId)!} />}{courses.find(course => course.id === next.session.courseId)?.name ?? "Curso no disponible"}</h3><p>{weekDays[next.session.day]} · {next.start.toLocaleDateString("es", { day: "numeric", month: "short" })} · {minuteToTime(next.session.startMinute)}–{minuteToTime(next.session.endMinute)}</p><p>{next.session.location || next.session.modality}</p></> : <p>Aún no hay clases programadas.</p>}</article>
    </div>
    <div className="home-modules" aria-label="Módulos">
      {academicModules.map(module => {
        const { title, description, Icon } = presentation[module.id];
        const content = <><span className="home-module-icon"><Icon size={27} /></span><h2>{title}</h2><p>{description}</p><span className="home-module-status">{module.status === "available" ? <>Abrir módulo <ArrowUpRight size={16} /></> : "Próximamente"}</span></>;
        return module.status === "available" ? <a key={module.id} className="panel home-module" href={module.href}>{content}</a> : <article key={module.id} className="panel home-module planned">{content}</article>;
      })}
    </div>
  </section>;
}
