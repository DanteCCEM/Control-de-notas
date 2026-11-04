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
export interface SessionFields {
  courseId: string;
  day: number;
  startMinute: number;
  endMinute: number;
  location: string;
  teacher: string;
  modality: (typeof modalities)[number];
  meetingUrl: string;
  notes: string;
}
export interface ScheduleSession extends CourseLinkedEntity, SessionFields {
  /** Local YYYY-MM-DD. Absent on legacy, indefinitely weekly sessions. */
  date?: string;
  recurrence?: {
    weeks: number;
    exceptions: Record<string, { cancelled: true } | { override: SessionFields & { date: string } }>;
  };
  /** Derived occurrence metadata, never stored. */
  seriesId?: string;
  occurrenceIndex?: number;
}
export type SessionDraft = Omit<ScheduleSession, "id" | "day"> & {
  id?: string;
  days: number[];
};
