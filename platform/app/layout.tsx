import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import { Link } from "@heroui/link";
import clsx from "clsx";

import { Providers } from "./providers";

import { siteConfig } from "@/config/site";
import { fontSans } from "@/config/fonts";
import { Navbar } from "@/components/navbar";
import { StatusBarProvider } from "@/components/GlobalStatusBar";
import { SolverActivityBridge } from "@/components/SolverActivityBridge";
import { UnsavedChangesGuard } from "@/components/scheduler/UnsavedChangesGuard";
import { RemoteChangesBanner } from "@/components/scheduler/RemoteChangesBanner";
import { SchedulingDataProvider } from "@/lib/scheduling/useSchedulingData";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head />
      <body
        className={clsx(
          "min-h-screen text-foreground bg-background font-sans antialiased",
          fontSans.variable
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "light" }}>
          <SchedulingDataProvider>
            <div className="relative flex flex-col min-h-screen bg-[var(--weatherhead-surface)] dark:bg-default-100">
              <Navbar />
              <StatusBarProvider>
                <SolverActivityBridge />
                <UnsavedChangesGuard />
                <RemoteChangesBanner />
                <main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 grow">
                  {children}
                </main>
              </StatusBarProvider>
            </div>
          </SchedulingDataProvider>
        </Providers>
      </body>
    </html>
  );
}
