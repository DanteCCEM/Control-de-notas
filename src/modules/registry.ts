import type {
  AcademicModuleDefinition,
  AvailableAcademicModule,
} from "../types/modules";

// Planned entries have no routes or screens and never become visible by default.
export const academicModules: readonly AcademicModuleDefinition[] = [
  {
    id: "grades",
    label: "Resumen de notas",
    status: "available",
    href: "#notas",
    courseLink: "required",
  },
  {
    id: "schedule",
    label: "Mi Horario",
    status: "available",
    href: "#horario",
    courseLink: "required",
  },
  {
    id: "pomodoro",
    label: "Temporizador Pomodoro",
    status: "planned",
    courseLink: "optional",
  },
  {
    id: "notes",
    label: "Apuntes por curso",
    status: "planned",
    courseLink: "required",
  },
  { id: "account", label: "Mi Cuenta", status: "planned", courseLink: "optional" },
  { id: "settings", label: "Configuración", status: "available", href: "#configuracion", courseLink: "optional" },
];

export function getAvailableAcademicModules(): AvailableAcademicModule[] {
  return academicModules.filter(
    (module): module is AvailableAcademicModule =>
      module.status === "available",
  );
}
