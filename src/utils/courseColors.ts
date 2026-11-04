export const coursePalette = [
  { name: "Azul cielo", color: "#1675ac" },
  { name: "Verde pradera", color: "#367d38" },
  { name: "Lavanda", color: "#8d5ca3" },
  { name: "Ámbar", color: "#a56b1c" },
  { name: "Rosa", color: "#ae4f63" },
  { name: "Turquesa", color: "#1b817a" },
] as const;
export function validCourseColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
// Keep the existing automatic assignment independent of list position.
export function courseColors(id: string, customColor?: string): [string, string] {
  if (validCourseColor(customColor)) {
    const channels = [1, 3, 5].map(start => parseInt(customColor.slice(start, start + 2), 16));
    const tint = "#" + channels.map(channel => Math.round(channel * .1 + 255 * .9).toString(16).padStart(2, "0")).join("");
    return [customColor, tint];
  }
  const tints = ["#e2f5ff", "#ebf9de", "#f5eaff", "#fff3d9", "#ffedf2", "#dff8f4"];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const index = hash % coursePalette.length;
  return [coursePalette[index].color, tints[index]];
}
