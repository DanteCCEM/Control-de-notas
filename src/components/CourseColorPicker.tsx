import { courseColors, coursePalette } from "../utils/courseColors";
export function CourseColorPicker({ id, color, onChange, disabled = false }: { id: string; color?: string; onChange: (color: string | undefined) => void; disabled?: boolean }) {
  const [accent, tint] = courseColors(id, color);
  return <fieldset className="course-color-picker" disabled={disabled}>
    <legend>Color del curso</legend>
    <div className="course-color-palette">
      <button type="button" aria-pressed={color === undefined} onClick={() => onChange(undefined)}>Automático</button>
      {coursePalette.map(option => <button key={option.color} type="button" aria-label={option.name} title={option.name} aria-pressed={color?.toLowerCase() === option.color} onClick={() => onChange(option.color)}>
        <span className="course-color-swatch" style={{ background: option.color }} aria-hidden="true" />
        {color?.toLowerCase() === option.color && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>
    <label>Color personalizado<input type="color" value={accent} onChange={event => onChange(event.target.value)} /></label>
    <p className="course-color-preview" style={{ background: tint, borderLeftColor: accent }}>Vista previa · {color ? accent.toUpperCase() : "Color automático"}</p>
  </fieldset>;
}
