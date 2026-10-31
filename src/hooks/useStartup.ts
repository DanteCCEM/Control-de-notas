import { useEffect, useState } from "react";
import { prepareApplication } from "../services/startup";
export const SPLASH_MINIMUM_MS = 2500;
export const SPLASH_FADE_MS = 350;

export function useStartup(prepare = prepareApplication) {
  const [dataReady, setDataReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const minimumTimer = setTimeout(() => {
      if (active) setMinimumElapsed(true);
    }, SPLASH_MINIMUM_MS);
    // A microtask also catches synchronous failures of an initializer.
    Promise.resolve()
      .then(prepare)
      .then(() => {
        if (active) setInitialized(true);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "El navegador no pudo acceder al almacenamiento local.",
          );
      });
    return () => {
      active = false;
      clearTimeout(minimumTimer);
    };
  }, [attempt, prepare]);
  const leaving = initialized && dataReady && minimumElapsed && !error;
  useEffect(() => {
    if (!leaving) return;
    const fadeTimer = setTimeout(() => setFinished(true), SPLASH_FADE_MS);
    return () => clearTimeout(fadeTimer);
  }, [leaving]);
  function retry() {
    setDataReady(false);
    setInitialized(false);
    setMinimumElapsed(false);
    setFinished(false);
    setError(null);
    setAttempt((n) => n + 1);
  }
  return {
    initialized,
    dataReady,
    setDataReady,
    leaving,
    finished,
    error,
    retry,
  };
}
