/** Split comma-separated editor / calendar form values into a trimmed string list. */
export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Join a string list for comma-separated form fields. */
export function joinCsv(values: string[] | undefined | null): string {
  return (values ?? []).join(", ");
}
