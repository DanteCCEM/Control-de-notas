import { useEffect, useRef, useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import type { Grade } from "../types";
import { validGrade } from "../utils/grades";
export function GradeCell({
  grade,
  label,
  onValue,
  onLock,
}: {
  grade: Grade;
  label: string;
  onValue: (n: number | null) => Promise<void>;
  onLock: (locked: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(
    grade.value === null ? "" : String(grade.value),
  );
  const justLocked = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(grade.value === null ? "" : String(grade.value));
  }, [grade.value]);
  return (
    <div>
      <div
        className={
          "grade " +
          (grade.locked ? "locked " : "") +
          (grade.value !== null ? "filled" : "")
        }
      >
        <input
          aria-label={label}
          type="number"
          min="0"
          max="20"
          step="0.01"
          placeholder="—"
          disabled={grade.locked}
          value={draft}
          aria-invalid={error}
          onChange={(e) => {
            const s = e.target.value;
            setDraft(s);
            const n = s === "" ? null : Number(s);
            const bad = n !== null && !validGrade(n);
            setError(bad);
            if (!bad) void onValue(n);
          }}
          onBlur={() => {
            if (error) {
              setDraft(grade.value === null ? "" : String(grade.value));
              setError(false);
            }
          }}
        />
        <button
          type="button"
          aria-label={
            (grade.locked ? "Desbloquear con doble clic: " : "Bloquear: ") +
            label
          }
          title={
            grade.locked
              ? "Doble clic para desbloquear"
              : "Un clic para bloquear"
          }
          onClick={(e) => {
            if (e.detail <= 1) {
              justLocked.current = !grade.locked;
              if (!grade.locked) void onLock(true);
            }
          }}
          onDoubleClick={() => {
            if (grade.locked && !justLocked.current) void onLock(false);
          }}
        >
          {grade.locked ? (
            <LockKeyhole size={15} />
          ) : (
            <LockKeyholeOpen size={15} />
          )}
        </button>
      </div>
      {error && <small className="error">De 0 a 20 · máximo 2 decimales</small>}
    </div>
  );
}
