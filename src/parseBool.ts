/**
 * Multipart/form and URL-encoded bodies send booleans as strings.
 * `Boolean("false")` is true in JS — use this for API flags instead.
 */
export function parseFormBoolean(value: unknown, defaultValue = false): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null || value === "") return defaultValue;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
    return defaultValue;
  }
  return defaultValue;
}
