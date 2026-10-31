export const labels = ["Consolidado 1", "Parcial", "Consolidado 2", "Final"];
export interface Grade {
  value: number | null;
  locked: boolean;
}
export interface Course {
  id: string;
  order: number;
  name: string;
  weights: number[];
  grades: Grade[];
}
export interface Settings {
  id: "main";
  threshold: number;
  dark: boolean;
}
export interface Backup {
  version: 1;
  courses: Course[];
  settings: Settings;
}
