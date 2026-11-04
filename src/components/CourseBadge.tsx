import { BookOpen } from "lucide-react";
import type { Course } from "../types";
import { courseColors } from "../utils/courseColors";
export function CourseBadge({ course }: { course: Course }) {
  const [accent, tint] = courseColors(course.id, course.color);
  return <span className="course-color-badge" style={{ background: tint, borderLeftColor: accent }} aria-hidden="true"><BookOpen size={17} /></span>;
}
