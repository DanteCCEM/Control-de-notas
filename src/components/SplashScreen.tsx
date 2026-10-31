import { BookOpen, RefreshCw, ShieldCheck, CircleAlert } from "lucide-react";
import "./SplashScreen.css";

export function SplashScreen({
  initialized,
  dataReady,
  leaving,
  error,
  onRetry,
}: {
  initialized: boolean;
  dataReady: boolean;
  leaving: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const message = !initialized
    ? "Preparando tu espacio académico…"
    : !dataReady
      ? "Recuperando tus cursos y notas…"
      : "¡Todo listo! Abriendo tu espacio académico…";
  return (
    <main
      className={"splash-screen" + (leaving ? " splash-leaving" : "")}
      aria-busy={!error}
    >
      <div className="splash-scenery" aria-hidden="true" />
      <div className="splash-bubbles" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={"splash-bubble bubble-" + i} />
        ))}
      </div>
      <section className="splash-panel" aria-labelledby="splash-title">
        <div className="splash-emblem" aria-hidden="true">
          <BookOpen size={48} strokeWidth={1.4} />
        </div>
        <div className="splash-kicker">BIENVENIDO A TU ESPACIO ACADÉMICO</div>
        <h1 id="splash-title">Mi Control de Notas</h1>
        <p className="splash-subtitle">
          Tu rendimiento académico, en un solo lugar
        </p>
        {error ? (
          <div className="splash-error" role="alert">
            <CircleAlert size={22} />
            <strong>No pudimos cargar tus datos</strong>
            <p>{error}</p>
            <p>
              Tus notas no se han restablecido. Puedes volver a intentar la
              conexión al almacenamiento local.
            </p>
            <button className="primary" onClick={onRetry}>
              <RefreshCw size={16} /> Reintentar
            </button>
          </div>
        ) : (
          <div className="splash-loading">
            <div
              className={"splash-progress" + (dataReady ? " is-ready" : "")}
              role="progressbar"
              aria-label={
                dataReady
                  ? "Preparando la apertura del dashboard"
                  : "Cargando datos locales"
              }
              aria-valuetext={
                dataReady
                  ? "Datos listos; terminando la bienvenida"
                  : "Inicialización en curso, progreso indeterminado"
              }
            >
              <span />
            </div>
            <p className="splash-message" role="status" aria-live="polite">
              {message}
            </p>
          </div>
        )}
        <div className="splash-local">
          <ShieldCheck size={15} />
          <span>Tu espacio personal · Almacenamiento local</span>
        </div>
      </section>
      <p className="splash-signature">
        Un nuevo día. Una nueva oportunidad de aprender.
      </p>
    </main>
  );
}
