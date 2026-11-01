import {
  BookOpen,
  Calculator,
  GraduationCap,
  CalendarDays,
} from "lucide-react";
import { getAvailableAcademicModules } from "../modules/registry";
import type { AcademicModuleId } from "../types/modules";
import "./AppNavigation.css";

interface AppNavigationProps {
  activeModule?: AcademicModuleId;
  onOpenCalculator: () => void;
}

export function AppNavigation({
  activeModule = "grades",
  onOpenCalculator,
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Navegación académica">
      <div className="nav-label">MI ESPACIO ACADÉMICO</div>
      {getAvailableAcademicModules().map((module) => {
        const Icon =
          module.id === "grades"
            ? GraduationCap
            : module.id === "schedule"
              ? CalendarDays
              : BookOpen;
        const active = module.id === activeModule;
        return (
          <a
            key={module.id}
            className={"nav" + (active ? " active" : "")}
            href={module.href}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} />
            {module.label}
          </a>
        );
      })}
      <button type="button" className="nav" onClick={onOpenCalculator}>
        <Calculator size={19} /> Calculadora
      </button>
    </nav>
  );
}
