/**
 * Render-time WSOM section designations (100 / 400 / 800 …).
 * Not persisted — deterministic for a given sections array so Excel and calendar match.
 */

export type SectionDesignationInput = {
  id: string;
  department?: string | null;
  /** Catalog number in this app's spreadsheet mapping (e.g. "300"). */
  section_code?: string | null;
  /** Course title / name (e.g. seminar titles under a shared catalog number). */
  course_id?: string | number | null;
  crosslist_group_id?: string | null;
  state?: string | null;
};

/** Preferred registrar-style codes, then extras if a course has many offerings. */
export const SECTION_DESIGNATION_SEQUENCE = [
  "100",
  "400",
  "800",
  "200",
  "500",
  "700",
  "300",
  "600",
  "900",
] as const;

function isArchived(state: string | null | undefined): boolean {
  return String(state ?? "")
    .trim()
    .toLowerCase() === "archived";
}

function courseKey(
  department: string | null | undefined,
  catalog: string | null | undefined,
  courseName: string | number | null | undefined,
): string {
  const dept = String(department ?? "")
    .trim()
    .toUpperCase();
  const code = String(catalog ?? "")
    .trim()
    .toUpperCase();
  const name = String(courseName ?? "")
    .trim()
    .toUpperCase();
  return `${dept}::${code}::${name}`;
}

type Offering = {
  id: string;
  sectionIds: string[];
  courseKeys: Set<string>;
  sortKey: string;
};

/**
 * Assign a designation to every non-archived section.
 * - Each crosslist (≥2 members) is one offering; all members share one code.
 * - Solo sections are their own offerings.
 * - Offerings that share any (department, section_code, course_id) get distinct codes
 *   so same-code seminars with different titles do not collide.
 */
export function assignSectionDesignations(
  sections: SectionDesignationInput[],
): Map<string, string> {
  const active = sections.filter((s) => s.id && !isArchived(s.state));
  const byId = new Map(active.map((s) => [s.id, s]));

  const membersByGroup = new Map<string, SectionDesignationInput[]>();
  for (const section of active) {
    const groupId = String(section.crosslist_group_id ?? "").trim();
    if (!groupId) continue;
    const list = membersByGroup.get(groupId) ?? [];
    list.push(section);
    membersByGroup.set(groupId, list);
  }

  const offerings: Offering[] = [];
  const claimed = new Set<string>();

  for (const [groupId, members] of Array.from(membersByGroup.entries())) {
    if (members.length < 2) continue;
    const sectionIds = members.map((m) => m.id).sort();
    for (const id of sectionIds) claimed.add(id);
    const courseKeys = new Set(
      members.map((m) => courseKey(m.department, m.section_code, m.course_id)),
    );
    const primary = Array.from(courseKeys).sort()[0] ?? "";
    offerings.push({
      id: `crosslist:${groupId}`,
      sectionIds,
      courseKeys,
      sortKey: `${primary}|${sectionIds.join(",")}`,
    });
  }

  for (const section of active) {
    if (claimed.has(section.id)) continue;
    const key = courseKey(section.department, section.section_code, section.course_id);
    offerings.push({
      id: `solo:${section.id}`,
      sectionIds: [section.id],
      courseKeys: new Set([key]),
      sortKey: `${key}|${section.id}`,
    });
  }

  offerings.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }));

  const designationByOffering = new Map<string, string>();
  const usedByCourseKey = new Map<string, Set<string>>();

  const nextCode = (used: Set<string>): string => {
    for (const code of SECTION_DESIGNATION_SEQUENCE) {
      if (!used.has(code)) return code;
    }
    // Exhausted preferred list — generate 110, 410, 810, 210, …
    for (let tens = 1; tens <= 9; tens += 1) {
      for (const base of SECTION_DESIGNATION_SEQUENCE) {
        const n = String(Number(base) + tens * 10);
        if (!used.has(n)) return n;
      }
    }
    return String(1000 + used.size);
  };

  for (const offering of offerings) {
    const used = new Set<string>();
    for (const key of Array.from(offering.courseKeys)) {
      const set = usedByCourseKey.get(key);
      if (set) for (const code of Array.from(set)) used.add(code);
    }
    const code = nextCode(used);
    designationByOffering.set(offering.id, code);
    for (const key of Array.from(offering.courseKeys)) {
      const set = usedByCourseKey.get(key) ?? new Set<string>();
      set.add(code);
      usedByCourseKey.set(key, set);
    }
  }

  const result = new Map<string, string>();
  for (const offering of offerings) {
    const code = designationByOffering.get(offering.id) ?? "100";
    for (const sectionId of offering.sectionIds) {
      if (byId.has(sectionId)) result.set(sectionId, code);
    }
  }
  return result;
}
