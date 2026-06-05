export type TextMatchMode = "startsWith" | "contains";

export type NumberCompareOp = "eq" | "lt" | "gt" | "lte" | "gte";

export type TimeCompareOp = "before" | "after";

export type EditorFilterControl =
  | { kind: "multiSearch"; textMatch: TextMatchMode }
  | { kind: "multiSelect"; showSearch?: boolean }
  | { kind: "numberCompare" }
  | { kind: "timeCompare" }
  | { kind: "singleSelect" };

export type EditorColumnFilterDef<TRow> = {
  columnId: string;
  label: string;
  control: EditorFilterControl;
  options?: { key: string; label: string }[];
  /** Row value is an array; match if any element satisfies the filter. */
  arrayValue?: boolean;
  getValue: (row: TRow) => unknown;
};

export type ColumnFilterState = {
  values?: string[];
  numberOp?: NumberCompareOp;
  numberValue?: string;
  timeOp?: TimeCompareOp;
  timeValue?: string;
  singleValue?: string;
};

export type EditorFiltersState = Record<string, ColumnFilterState>;

export const NUMBER_COMPARE_OPTIONS: { key: NumberCompareOp; label: string }[] = [
  { key: "eq", label: "Equal to" },
  { key: "lt", label: "Less than" },
  { key: "gt", label: "Greater than" },
  { key: "gte", label: "Greater than or equal to" },
  { key: "lte", label: "Less than or equal to" },
];

export const TIME_COMPARE_OPTIONS: { key: TimeCompareOp; label: string }[] = [
  { key: "before", label: "Before" },
  { key: "after", label: "After" },
];

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value).trim();
}

function rowValueKeys(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const key = String(raw).trim();
  return key ? [key] : [];
}

export function getFilterOptionsForDef<TRow>(
  def: EditorColumnFilterDef<TRow>,
  rows: TRow[],
): { key: string; label: string }[] {
  if (def.options && def.options.length > 0) {
    return def.options;
  }

  const optionByKey = new Map<string, string>();

  const add = (raw: unknown) => {
    if (raw == null || raw === "") return;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const key = String(item).trim();
        if (key) optionByKey.set(key, key);
      }
      return;
    }
    const key = String(raw).trim();
    if (key) optionByKey.set(key, key);
  };

  for (const row of rows) {
    add(def.getValue(row));
  }

  return Array.from(optionByKey.entries())
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
    .map(([key, label]) => ({ key, label }));
}

export function isColumnFilterActive<TRow>(
  def: EditorColumnFilterDef<TRow>,
  state?: ColumnFilterState,
): boolean {
  if (!state) return false;
  switch (def.control.kind) {
    case "multiSearch":
    case "multiSelect":
      return (state.values?.length ?? 0) > 0;
    case "numberCompare":
      return Boolean(
        state.numberOp && state.numberValue?.trim() && Number.isFinite(Number(state.numberValue)),
      );
    case "timeCompare":
      return Boolean(state.timeOp && state.timeValue?.trim());
    case "singleSelect":
      return Boolean(state.singleValue?.trim());
    default:
      return false;
  }
}

export function countActiveColumnFilters<TRow>(
  defs: EditorColumnFilterDef<TRow>[],
  filters: EditorFiltersState,
): number {
  return defs.filter((def) => isColumnFilterActive(def, filters[def.columnId])).length;
}

function parseTimeMinutes(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function matchesMultiSearch(
  raw: unknown,
  values: string[],
  mode: TextMatchMode,
  arrayValue: boolean,
): boolean {
  const needles = values.map((v) => v.toLowerCase());
  const texts = arrayValue ? rowValueKeys(raw) : [normalizeText(raw)];
  for (const text of texts) {
    const hay = text.toLowerCase();
    for (const needle of needles) {
      if (mode === "startsWith" && hay.startsWith(needle)) return true;
      if (mode === "contains" && hay.includes(needle)) return true;
    }
  }
  return false;
}

function matchesMultiSelect(raw: unknown, values: string[], arrayValue: boolean): boolean {
  const selected = new Set(values);
  if (arrayValue) {
    return rowValueKeys(raw).some((key) => selected.has(key));
  }
  const key = normalizeText(raw);
  if (!key) return selected.has("") || selected.has("__none__");
  return selected.has(key);
}

function matchesNumberCompare(raw: unknown, op: NumberCompareOp, cmpVal: string): boolean {
  const num = Number(raw);
  const cmp = Number(cmpVal);
  if (!Number.isFinite(num) || !Number.isFinite(cmp)) return false;
  if (op === "eq") return num === cmp;
  if (op === "lt") return num < cmp;
  if (op === "gt") return num > cmp;
  if (op === "lte") return num <= cmp;
  if (op === "gte") return num >= cmp;
  return false;
}

function matchesTimeCompare(raw: unknown, op: TimeCompareOp, cmpVal: string): boolean {
  const rowMinutes = parseTimeMinutes(raw);
  const cmpMinutes = parseTimeMinutes(cmpVal);
  if (rowMinutes == null || cmpMinutes == null) return false;
  if (op === "before") return rowMinutes < cmpMinutes;
  if (op === "after") return rowMinutes > cmpMinutes;
  return false;
}

function matchesSingleSelect(raw: unknown, value: string): boolean {
  return normalizeText(raw) === value;
}

function matchColumnFilter<TRow>(
  raw: unknown,
  def: EditorColumnFilterDef<TRow>,
  state: ColumnFilterState,
): boolean {
  switch (def.control.kind) {
    case "multiSearch":
      return matchesMultiSearch(
        raw,
        state.values ?? [],
        def.control.textMatch,
        Boolean(def.arrayValue),
      );
    case "multiSelect":
      return matchesMultiSelect(raw, state.values ?? [], Boolean(def.arrayValue));
    case "numberCompare":
      return matchesNumberCompare(raw, state.numberOp ?? "eq", state.numberValue ?? "");
    case "timeCompare":
      return matchesTimeCompare(raw, state.timeOp ?? "before", state.timeValue ?? "");
    case "singleSelect":
      return matchesSingleSelect(raw, state.singleValue ?? "");
    default:
      return true;
  }
}

export function applyEditorColumnFilters<TRow>(
  rows: TRow[],
  filters: EditorFiltersState,
  defs: EditorColumnFilterDef<TRow>[],
): TRow[] {
  const activeDefs = defs.filter((def) => isColumnFilterActive(def, filters[def.columnId]));
  if (activeDefs.length === 0) return rows;

  return rows.filter((row) =>
    activeDefs.every((def) => {
      const state = filters[def.columnId];
      if (!state) return true;
      return matchColumnFilter(def.getValue(row), def, state);
    }),
  );
}
