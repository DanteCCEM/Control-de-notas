export const labels = ["Consolidado 1", "Parcial", "Consolidado 2", "Final"];
export interface Grade {
  value: number | null;
  locked: boolean;
}
export interface Course {
  id: string;
  order: number;
  name: string;
  color?: string;
  weights: number[];
  grades: Grade[];
}
export interface Settings {
  id: "main";
  threshold: number;
  dark: boolean;
  scheduleRange?: { start: number; end: number };
}
interface BackupBase {
  courses: Course[];
  settings: Settings;
}
export type Backup = BackupBase &
  (
    | { version: 1 }
    | { version: 2 | 3; scheduleEntries: import("./schedule").ScheduleSession[] }
  );
