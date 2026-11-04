import { useEffect, useState } from "react";
import type { AppPageId } from "../types/modules";
import { getAvailableAcademicModules } from "../modules/registry";
export function useModuleNavigation(): AppPageId {
  const read = (): AppPageId => getAvailableAcademicModules().find(module => module.href === location.hash)?.id ?? "home";
  const [active, setActive] = useState(read);
  useEffect(() => {
    const update = () => setActive(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return active;
}
