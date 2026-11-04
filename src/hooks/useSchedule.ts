import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, saveScheduleRange } from "../services/db";
import { defaultScheduleRange, validScheduleRange } from "../utils/scheduleRange";
export function useScheduleRange() {
  const stored = useLiveQuery(async () => {
    const settings = await db.settings.get("main");
    return validScheduleRange(settings?.scheduleRange) ? settings.scheduleRange : defaultScheduleRange;
  });
  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (pending && stored?.start === pending.start && stored.end === pending.end) setPending(null);
  }, [stored, pending]);
  async function save(range: { start: number; end: number }) {
    const current = ++sequence.current;
    setPending(range);
    try { await saveScheduleRange(range); }
    catch (error) { if (current === sequence.current) setPending(null); throw error; }
  }
  return { range: pending ?? stored, save };
}
export function useSchedule() {
  return useLiveQuery(() => db.scheduleEntries.toArray());
}
export function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return now;
}
