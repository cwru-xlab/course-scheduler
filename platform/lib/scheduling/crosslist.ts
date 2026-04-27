import type { SchedulingInput } from "./types";

const normalizeGroupId = (value: unknown): string => String(value ?? "").trim();

const normalizeSectionId = (value: unknown): string => String(value ?? "").trim();

export const normalizeCrosslistData = (input: SchedulingInput): SchedulingInput => {
  const sectionIds = new Set(input.sections.map((section) => normalizeSectionId(section.id)).filter(Boolean));
  const membersByGroup = new Map<string, Set<string>>();

  for (const section of input.sections) {
    const groupId = normalizeGroupId(section.crosslist_group_id ?? "");
    const sectionId = normalizeSectionId(section.id);
    if (!groupId || !sectionId) continue;
    const members = membersByGroup.get(groupId) ?? new Set<string>();
    members.add(sectionId);
    membersByGroup.set(groupId, members);
  }

  for (const group of input.crosslist_groups) {
    const groupId = normalizeGroupId(group.id);
    if (!groupId) continue;
    const members = membersByGroup.get(groupId) ?? new Set<string>();
    for (const memberSectionId of group.member_section_ids ?? []) {
      const normalizedMemberId = normalizeSectionId(memberSectionId);
      if (!normalizedMemberId || !sectionIds.has(normalizedMemberId)) continue;
      members.add(normalizedMemberId);
    }
    membersByGroup.set(groupId, members);
  }

  const normalizedCrosslistGroups = Array.from(membersByGroup.entries())
    .map(([groupId, members]) => ({
      id: groupId,
      member_section_ids: Array.from(members).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const enforceableCrosslistGroups = normalizedCrosslistGroups.filter(
    (group) => group.member_section_ids.length >= 2,
  );

  const normalizedSections = input.sections.map((section) => {
    const sectionId = normalizeSectionId(section.id);
    let crosslistGroupId: string | null = null;
    for (const group of enforceableCrosslistGroups) {
      if (group.member_section_ids.includes(sectionId)) {
        crosslistGroupId = group.id;
        break;
      }
    }
    return {
      ...section,
      crosslist_group_id: crosslistGroupId,
    };
  });

  return {
    ...input,
    sections: normalizedSections,
    crosslist_groups: normalizedCrosslistGroups,
  };
};
