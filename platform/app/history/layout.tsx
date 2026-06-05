import { FullBleedContent } from "@/components/layout/FullBleedContent";

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullBleedContent>{children}</FullBleedContent>;
}
