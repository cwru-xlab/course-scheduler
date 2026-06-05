import { FullBleedContent } from "@/components/layout/FullBleedContent";

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullBleedContent>{children}</FullBleedContent>;
}
