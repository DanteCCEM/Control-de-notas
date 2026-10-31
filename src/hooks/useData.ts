import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
export function useData(enabled = true) {
  const courses = useLiveQuery(
    async () => (enabled ? await db.courses.toArray() : undefined),
    [enabled],
  );
  const settings = useLiveQuery(
    async () => (enabled ? await db.settings.get("main") : undefined),
    [enabled],
  );
  return { courses, settings };
}
