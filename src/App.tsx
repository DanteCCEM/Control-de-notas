import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Plus,
  Moon,
  Sun,
  Download,
  Upload,
  Calculator,
  GraduationCap,
  CheckCheck,
  CircleX,
  Clock3,
  Pencil,
  X,
  RotateCcw,
  Trash2,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { HomePage } from "./components/HomePage";
import { useData } from "./hooks/useData";
import { useCourseReorder } from "./hooks/useCourseReorder";
import { CourseColorPicker } from "./components/CourseColorPicker";
import { CourseBadge } from "./components/CourseBadge";
import {
  db,
  newCourse,
  saveCourse,
  moveCourse,
  updateGrade,
  lockGrade,
  exportBackup,
  importBackup,
} from "./services/db";
import {
  calculate,
  csv,
  needed,
  parseBackup,
  validGrade,
  validWeights,
} from "./utils/grades";
import { labels, type Course } from "./types";
import { GradeCell } from "./components/GradeCell";
import { Modal } from "./components/Modal";
import { SchedulePage } from "./components/SchedulePage";
import { useModuleNavigation } from "./hooks/useModuleNavigation";
import { deleteCourseWithSessions } from "./services/schedule";
import { AppNavigation } from "./components/AppNavigation";
import { SplashScreen } from "./components/SplashScreen";
import { useStartup } from "./hooks/useStartup";
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2));
export default function App() {
  const activeModule = useModuleNavigation();
  const startup = useStartup();
  const { courses, settings } = useData(startup.initialized);
  const reorder = useCourseReorder(courses ?? [], moveCourse);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(0);
  const [editor, setEditor] = useState<Course | null>(null);
  const [calc, setCalc] = useState(false);
  const [selected, setSelected] = useState("");
  const [evaluation, setEvaluation] = useState(-1);
  const [target, setTarget] = useState("11");
  const [sim, setSim] = useState<Record<number, number>>({});
  const file = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    startup.setDataReady(courses !== undefined && settings !== undefined);
  }, [courses, settings, startup.setDataReady]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings?.dark ?? false);
  }, [settings?.dark]);
  async function run(fn: () => Promise<unknown>) {
    setBusy((n) => n + 1);
    try {
      await fn();
      setNotice("Cambios guardados en este dispositivo");
    } catch (e) {
      setNotice("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy((n) => n - 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(""), 4500);
    }
  }
  if (!startup.finished || !courses || !settings)
    return (
      <SplashScreen
        initialized={startup.initialized}
        dataReady={startup.dataReady}
        leaving={startup.leaving}
        error={startup.error}
        onRetry={startup.retry}
      />
    );
  const results = courses.map(calculate),
    registered = results.reduce((s, r) => s + r.count, 0),
    complete = results.filter((r) => r.complete),
    passed = complete.filter(
      (r) => r.average !== null && r.average >= settings.threshold,
    ).length;
  const averages = results.filter((r) => r.average !== null);
  const general = averages.length
    ? averages.reduce((s, r) => s + r.average!, 0) / averages.length
    : null;
  const chosen = courses.find((c) => c.id === selected) ?? courses[0];
  const required = chosen ? needed(chosen, Number(target), sim) : null;
  const unfinished =
    chosen?.grades
      .map((g, i) => (g.value === null ? i : -1))
      .filter((i) => i >= 0) ?? [];
  const backupControls = (
    <div className="tools">
      <button
        onClick={() =>
          void run(async () =>
            download(
              "respaldo-notas.json",
              JSON.stringify(await exportBackup(), null, 2),
              "application/json",
            ),
          )
        }
      >
        <Download size={15} /> JSON
      </button>
      <button
        onClick={() =>
          download("mis-notas.csv", csv(courses), "text/csv;charset=utf-8")
        }
      >
        <Download size={15} /> CSV
      </button>
      <button disabled={busy > 0} onClick={() => file.current?.click()}>
        <Upload size={15} /> Importar
      </button>
      <input
        hidden
        ref={file}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              if (f.size > 5_000_000)
                throw new Error("El archivo supera 5 MB.");
              const b = parseBackup(await f.text());
              const orphanCount =
                b.version === 1
                  ? (await db.scheduleEntries.toArray()).filter(
                      (s) => !b.courses.some((c) => c.id === s.courseId),
                    ).length
                  : 0;
              if (
                confirm(
                  `¿Reemplazar todos los datos por ${b.courses.length} cursos del respaldo? ${b.version !== 1 ? "También se reemplazará todo el horario con el del respaldo." : "Se conservarán las sesiones cuyos cursos estén en el respaldo."} Se restaurarán los candados. ${orphanCount ? `Se eliminarán ${orphanCount} sesiones que quedarían sin curso. ¿Confirmas también su eliminación?` : ""}`,
                )
              )
                await importBackup(b, orphanCount > 0);
            });
        }}
      />
    </div>
  );
  return (
    <div className="shell dashboard-enter">
      <aside>
        <a className="brand" href="#">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          <span>
            Mi Control<span className="brand-sub">DE NOTAS</span>
          </span>
        </a>
        <AppNavigation
          activeModule={activeModule}
          onOpenCalculator={() => {
            setTarget(String(settings.threshold));
            setCalc(true);
          }}
        />
        <div className="sidebar-bottom">
          <ShieldCheck size={23} />
          <strong>Tus notas, contigo.</strong>
          <p>
            Datos guardados localmente.
            <br />
            Sin cuentas, sin conexión.
          </p>
          <span className="local-dot">Almacenamiento local</span>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Mi espacio <span className="slash">/</span>{" "}
            <strong>
              {activeModule === "home" ? "Inicio" : activeModule === "settings" ? "Configuración" : activeModule === "schedule" ? "Mi Horario" : "Resumen académico"}
            </strong>
          </span>
          <div className="header-right">
            <span className="saved">
              <span className="dot" />
              {busy ? "Guardando…" : "Guardado local"}
            </span>
            <button
              className="icon"
              aria-label="Alternar modo claro y oscuro"
              onClick={() =>
                void run(() =>
                  db.settings.update("main", { dark: !settings.dark }),
                )
              }
            >
              {settings.dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <main>
          {activeModule !== "home" && <a className="home-back" href="#">← Volver al inicio</a>}
          {activeModule === "home" ? (
            <HomePage courses={courses} />
          ) : activeModule === "settings" ? (
            <section className="panel home-settings">
              <h1>Configuración</h1>
              <p>Personaliza tu espacio y administra tus respaldos.</p>
              <label>Nota mínima aprobatoria
                <input aria-label="Nota mínima aprobatoria" type="number" min="0" max="20" step="0.01" value={settings.threshold}
                  onChange={e => { const n = Number(e.target.value); if (e.target.value !== "" && validGrade(n)) void run(() => db.settings.update("main", { threshold: n })); }} />
              </label>
              <button onClick={() => void run(() => db.settings.update("main", { dark: !settings.dark }))}>Usar tema {settings.dark ? "claro" : "oscuro"}</button>
              <h2>Copias de seguridad</h2>
              {backupControls}
            </section>
          ) : activeModule === "schedule" ? (
            <SchedulePage courses={courses} backupActions={backupControls} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CADA EVALUACIÓN CUENTA</div>
                  <h1>
                    Tu esfuerzo, en perspectiva<span>.</span>
                  </h1>
                  <p>Organiza tus notas y ten claro tu próximo objetivo.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => setEditor(newCourse(""))}
                >
                  <Plus size={17} /> Agregar curso
                </button>
              </div>
              <section className="stats" aria-label="Estadísticas">
                <article className="stat featured">
                  <div>
                    Promedio general <GraduationCap size={20} />
                  </div>
                  <strong>
                    {fmt(general)}
                    <small> / 20</small>
                  </strong>
                  <p>
                    {averages.length === 0
                      ? "Aún no hay notas"
                      : complete.length === averages.length
                        ? "Definitivo · cursos con notas"
                        : "Provisional · cursos con notas"}
                  </p>
                  <small>
                    Definitivos:{" "}
                    {complete.length
                      ? fmt(
                          complete.reduce((s, r) => s + r.average!, 0) /
                            complete.length,
                        )
                      : "—"}{" "}
                    · media simple
                  </small>
                </article>
                <article className="stat stat-approved">
                  <div>
                    Cursos aprobados <CheckCheck size={20} />
                  </div>
                  <strong>{passed.toString().padStart(2, "0")}</strong>
                  <p>
                    de {courses.length} cursos · mínimo {settings.threshold}
                  </p>
                  <div className="mini">
                    <i
                      style={{
                        width: `${courses.length ? (passed / courses.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </article>
                <article className="stat stat-failed">
                  <div>
                    Cursos desaprobados <CircleX size={20} />
                  </div>
                  <strong>{complete.length - passed}</strong>
                  <p>Resultados definitivos</p>
                </article>
                <article className="stat stat-pending">
                  <div>
                    Cursos pendientes <Clock3 size={20} />
                  </div>
                  <strong>
                    {courses.length - complete.length}
                    <small> cursos</small>
                  </strong>
                  <p>Con evaluaciones por registrar</p>
                </article>
                <article className="stat stat-registered">
                  <div>
                    Notas registradas <BookOpen size={20} />
                  </div>
                  <strong>
                    {registered}
                    <small> / {courses.length * 4}</small>
                  </strong>
                  <p>Tu progreso, paso a paso</p>
                  <div className="mini">
                    <i
                      style={{
                        width: `${courses.length ? (registered / (courses.length * 4)) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </article>
                <article className="stat stat-remaining">
                  <div>
                    Notas pendientes <Pencil size={20} />
                  </div>
                  <strong>{courses.length * 4 - registered}</strong>
                  <p>Próximas oportunidades</p>
                </article>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Mis cursos <span className="count">{courses.length}</span>
                    </h2>
                    <p>Tu avance académico, evaluación por evaluación.</p>
                    <p id="course-reorder-help">Arrastra el asa para ordenar o usa las flechas. Escape cancela el arrastre.</p>
                  </div>
                  {backupControls}
                </div>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Notas por curso: tabla con desplazamiento horizontal"
                  tabIndex={0}
                >
                  <table
                    className="grades-table"
                    aria-label="Notas y ponderaciones por curso"
                  >
                    <colgroup>
                      <col className="col-course" />
                      {labels.map((label) => (
                        <col key={label} className="col-grade" />
                      ))}
                      <col className="col-average" />
                      <col className="col-state" />
                      <col className="col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>CURSO</th>
                        {labels.map((l) => (
                          <th key={l}>{l.toUpperCase()}</th>
                        ))}
                        <th>PROMEDIO</th>
                        <th>ESTADO</th>
                        <th>
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c, k) => {
                        const r = results[k];
                        const state = !r.count
                          ? "Sin notas"
                          : !r.complete
                            ? "Pendiente"
                            : r.average !== null &&
                                r.average >= settings.threshold
                              ? "Aprobado"
                              : "Desaprobado";
                        return (
                          <tr key={c.id} data-course-id={c.id} className={reorder.rowClass(c.id)}>
                            <td>
                              <div className="course-name">
                                <span className="course-order-controls">
                                  <button type="button" className="course-drag-handle" aria-label={"Arrastrar " + c.name} aria-describedby="course-reorder-help" title="Arrastrar para reordenar" disabled={reorder.saving || courses.length < 2} {...reorder.handleProps(c.id)}><GripVertical size={18} /></button>
                                  <span className="course-order-arrows">
                                    <button type="button" aria-label={"Subir " + c.name} disabled={reorder.saving || k === 0} onClick={() => void reorder.move(c.id, courses[k - 1].id)}><ChevronUp size={14} /></button>
                                    <button type="button" aria-label={"Bajar " + c.name} disabled={reorder.saving || k === courses.length - 1} onClick={() => void reorder.move(c.id, courses[k + 1].id)}><ChevronDown size={14} /></button>
                                  </span>
                                </span>
                                <CourseBadge course={c} />
                                <div>
                                  <strong>{c.name}</strong>
                                  <div className="course-progress">
                                    <div>
                                      <i
                                        style={{ width: `${r.count * 25}%` }}
                                      />
                                    </div>
                                    <span>{r.count}/4 evaluaciones</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            {c.grades.map((g, i) => (
                              <td key={i}>
                                <div className="weight">{c.weights[i]}%</div>
                                <GradeCell
                                  grade={g}
                                  label={`${c.name}, ${labels[i]}`}
                                  onValue={(n) =>
                                    run(() => updateGrade(c.id, i, n))
                                  }
                                  onLock={(locked) =>
                                    run(() => lockGrade(c.id, i, locked))
                                  }
                                />
                              </td>
                            ))}
                            <td>
                              <strong className="average">
                                {fmt(r.average)}
                              </strong>
                              <small className="average-label">
                                {r.complete
                                  ? "Definitivo"
                                  : r.count
                                    ? "Provisional"
                                    : "Sin registrar"}
                              </small>
                              {r.count > 0 && !r.complete && (
                                <small className="average-label">
                                  Acum. {fmt(r.accumulated)}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (state === "Aprobado"
                                    ? "green"
                                    : state === "Desaprobado"
                                      ? "red"
                                      : state === "Pendiente"
                                        ? "yellow"
                                        : "gray")
                                }
                              >
                                <span className="dot" />
                                {state}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon"
                                aria-label={"Editar " + c.name}
                                onClick={() => setEditor(structuredClone(c))}
                              >
                                <Pencil size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!courses.length && (
                    <div className="empty">
                      Tu siguiente etapa empieza aquí. Agrega tu primer curso.
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    <LockKeyholeHint /> Un clic para bloquear · doble clic para
                    desbloquear
                  </span>
                  <span>Escala 0–20 · hasta 2 decimales</span>
                </div>
              </section>
              <div className="bottom-grid">
                <section className="calculator-card">
                  <div className="calc-icon">
                    <Calculator size={25} />
                  </div>
                  <div>
                    <div className="eyebrow">PLANIFICA TU SIGUIENTE PASO</div>
                    <h2>¿Cuánto necesitas para aprobar?</h2>
                    <p>Explora escenarios sin cambiar tus notas registradas.</p>
                    <button
                      onClick={() => {
                        setTarget(String(settings.threshold));
                        setCalc(true);
                      }}
                    >
                      Abrir calculadora <ArrowUpRight size={16} />
                    </button>
                  </div>
                </section>
                <section className="settings-card">
                  <h3>Tu meta de aprobación</h3>
                  <p>Se aplica a los resultados definitivos.</p>
                  <label>
                    Nota mínima{" "}
                    <input
                      aria-label="Nota mínima aprobatoria"
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      value={settings.threshold}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (e.target.value !== "" && validGrade(n))
                          void run(() =>
                            db.settings.update("main", { threshold: n }),
                          );
                      }}
                    />
                  </label>
                </section>
              </div>
            </>
          )}
          <footer>
            Mi Control de Notas{" "}
            <span>Hecho para enfocarte en lo que viene.</span>
          </footer>
        </main>
      </div>
      {reorder.announcement && <div className="reorder-status" role="status">{reorder.announcement}</div>}
      {notice && (
        <div
          className={"toast " + (notice.startsWith("Error") ? "error" : "")}
          role="status"
        >
          {notice}
        </div>
      )}
      {editor && (
        <Modal titleId="edit-title" onClose={() => setEditor(null)}>
          <button
            className="close icon"
            aria-label="Cerrar"
            onClick={() => setEditor(null)}
          >
            <X />
          </button>
          <h2 id="edit-title">
            {courses.some((c) => c.id === editor.id)
              ? "Editar curso"
              : "Nuevo curso"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editor.name.trim() || !validWeights(editor.weights)) return;
              void run(async () => {
                await saveCourse({ ...editor, name: editor.name.trim() });
                setEditor(null);
              });
            }}
          >
            <label>
              Nombre del curso
              <input
                autoFocus
                required
                maxLength={120}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <CourseColorPicker id={editor.id} color={editor.color} onChange={color => setEditor({ ...editor, color })} />
            <p>Ponderaciones · deben sumar exactamente 100%</p>
            <div className="weights">
              {labels.map((l, i) => (
                <label key={l}>
                  {l}
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editor.weights[i]}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        weights: editor.weights.map((w, j) =>
                          i === j ? Number(e.target.value) : w,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className={validWeights(editor.weights) ? "" : "error"}>
              Total: {editor.weights.reduce((a, b) => a + b, 0).toFixed(2)}%
            </p>
            <button
              className="primary"
              disabled={!validWeights(editor.weights)}
            >
              Aplicar cambios
            </button>
          </form>
          {courses.some((c) => c.id === editor.id) && (
            <div className="danger-actions">
              <button
                onClick={() => {
                  if (
                    confirm(
                      "¿Restablecer todas las notas? Los candados se conservarán.",
                    )
                  )
                    void run(async () => {
                      await db.courses.update(editor.id, {
                        grades: editor.grades.map((g) => ({
                          ...g,
                          value: null,
                        })),
                      });
                      setEditor(null);
                    });
                }}
              >
                <RotateCcw size={15} /> Restablecer notas
              </button>
              <button
                className="error"
                onClick={() =>
                  void run(async () => {
                    const count = await db.scheduleEntries
                      .where("courseId")
                      .equals(editor.id)
                      .count();
                    if (
                      !confirm(
                        `¿Eliminar este curso y sus notas permanentemente?${count ? ` También se eliminarán sus ${count} sesiones de horario. No se pueden deshacer estos cambios.` : ""}`,
                      )
                    )
                      return;
                    await deleteCourseWithSessions(editor.id, count > 0);
                    setEditor(null);
                  })
                }
              >
                <Trash2 size={15} /> Eliminar curso
              </button>
            </div>
          )}
        </Modal>
      )}
      {calc && (
        <Modal titleId="calc-title" onClose={() => setCalc(false)}>
          <button
            className="close icon"
            aria-label="Cerrar calculadora"
            onClick={() => setCalc(false)}
          >
            <X />
          </button>
          <h2 id="calc-title">Calcula tu próxima meta</h2>
          <p>Simulaciones temporales. Tus notas guardadas no cambian.</p>
          {chosen ? (
            <>
              <label>
                Curso
                <select
                  value={chosen.id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setSim({});
                    setEvaluation(-1);
                  }}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Evaluación pendiente
                <select
                  value={evaluation}
                  onChange={(e) => {
                    setEvaluation(Number(e.target.value));
                    setSim({});
                  }}
                >
                  <option value={-1}>
                    Todas las pendientes · nota uniforme
                  </option>
                  {unfinished.map((i) => (
                    <option key={i} value={i}>
                      {labels[i]} ({chosen.weights[i]}%)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Promedio objetivo
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              {evaluation >= 0 &&
                unfinished
                  .filter((i) => i !== evaluation)
                  .map((i) => (
                    <label key={i}>
                      Simular {labels[i]} ({chosen.weights[i]}%)
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="0.01"
                        placeholder="Dejar pendiente"
                        value={sim[i] ?? ""}
                        onChange={(e) => {
                          const s = { ...sim };
                          if (e.target.value === "") delete s[i];
                          else if (validGrade(Number(e.target.value)))
                            s[i] = Number(e.target.value);
                          setSim(s);
                        }}
                      />
                    </label>
                  ))}
              <div className="calc-result">
                {target === "" || !validGrade(Number(target)) ? (
                  "Introduce un objetivo entre 0 y 20."
                ) : !unfinished.length ? (
                  `Promedio definitivo: ${fmt(calculate(chosen).average)}`
                ) : required === null ? (
                  ""
                ) : required > 20 ? (
                  "No es posible alcanzar la meta con estas condiciones."
                ) : required <= 0 ? (
                  "Ya tienes el acumulado necesario para alcanzar esta meta."
                ) : (
                  <>
                    <span>Necesitas al menos</span>
                    <strong>
                      {(Math.ceil((required - 1e-10) * 100) / 100).toFixed(2)}{" "}
                      <small>/ 20</small>
                    </strong>
                    <p>
                      {evaluation >= 0 &&
                      unfinished.every(
                        (i) => i === evaluation || sim[i] !== undefined,
                      )
                        ? `en ${labels[evaluation]}`
                        : "como nota uniforme en las evaluaciones aún pendientes"}
                      . Es matemáticamente posible.
                    </p>
                    <small>
                      Nota mínima expresada a dos decimales, redondeada hacia
                      arriba.
                    </small>
                  </>
                )}
              </div>
            </>
          ) : (
            <p>Agrega un curso para comenzar.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
function LockKeyholeHint() {
  return <ShieldCheck size={14} />;
}
