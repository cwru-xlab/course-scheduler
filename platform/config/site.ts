export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Weatherhead Course Scheduling",
  description: "Decision-support scheduler prototype with mock solver output.",
  navItems: [
    { label: "Calendar", href: "/calendar" },
  ],
  editorItems: [
    { label: "Sections", href: "/editor/sections" },
    { label: "Instructors", href: "/editor/instructors" },
    { label: "Rooms", href: "/editor/rooms" },
    { label: "Timeslots", href: "/editor/timeslots" },
    { label: "Meeting Patterns", href: "/editor/meeting-patterns" },
    { label: "Constraints", href: "/editor/constraints" },
  ],
  navMenuItems: [
    { label: "Editor", href: "/editor/sections" },
    { label: "Calendar", href: "/calendar" },
  ],
  links: {
    github: "https://github.com/",
  },
};
