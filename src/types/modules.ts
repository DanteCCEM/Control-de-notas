import type { Course } from "./index";

// Alias the existing key; this does not create or replace course identifiers.
export type CourseId = Course["id"];
export type AcademicModuleId = "grades" | "schedule" | "pomodoro" | "notes";

/** Shared relation for future schedule entries and course notes. */
export interface CourseLinkedEntity {
  id: string;
  courseId: CourseId;
}

/** Pomodoro sessions may also be independent of a course. */
export interface OptionalCourseLinkedEntity {
  id: string;
  courseId: CourseId | null;
}

export type AcademicModuleDefinition = {
  id: AcademicModuleId;
  label: string;
  courseLink: "required" | "optional";
} & ({ status: "available"; href: `#${string}` } | { status: "planned" });
export type AvailableAcademicModule = Extract<
  AcademicModuleDefinition,
  { status: "available" }
>;
