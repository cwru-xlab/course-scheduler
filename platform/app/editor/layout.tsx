import { FullBleedContent } from "@/components/layout/FullBleedContent";
import { EditorActionProvider } from "@/components/scheduler/editors/EditorActionProvider";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EditorActionProvider>
      <FullBleedContent>{children}</FullBleedContent>
    </EditorActionProvider>
  );
}
