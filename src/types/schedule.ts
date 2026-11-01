import type { CourseLinkedEntity } from "./modules";
export const weekDays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
export const modalities = ["presencial", "virtual", "híbrida"] as const;
export interface ScheduleSession extends CourseLinkedEntity {
  day: number;
  startMinute: number;
  endMinute: number;
  location: string;
  teacher: string;
  modality: (typeof modalities)[number];
  meetingUrl: string;
  notes: string;
}
export type SessionDraft = Omit<ScheduleSession, "id" | "day"> & {
  id?: string;
  days: number[];
};
