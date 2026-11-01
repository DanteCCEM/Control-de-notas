import { useEffect, useState } from "react";
import type { AcademicModuleId } from "../types/modules";
export function useModuleNavigation(): AcademicModuleId {
  const read = (): AcademicModuleId =>
    location.hash === "#horario" ? "schedule" : "grades";
  const [active, setActive] = useState(read);
  useEffect(() => {
    const update = () => setActive(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return active;
}
