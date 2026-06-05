import { EditorActionProvider } from "@/components/scheduler/editors/EditorActionProvider";

/**
 * Editor routes use the full content width (root layout is max-w-7xl).
 * Break out horizontally so tables fit without a nested horizontal scroll.
 */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EditorActionProvider>
      <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8 box-border">
        <div className="w-full min-w-0 max-w-none">{children}</div>
      </div>
    </EditorActionProvider>
  );
}
