import { FullBleedContent } from "@/components/layout/FullBleedContent";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullBleedContent>{children}</FullBleedContent>;
}
