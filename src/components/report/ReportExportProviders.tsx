import { Theme } from "@carbon/react";
import { StaticAuthProvider } from "@/contexts/AuthContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { DemoDataProvider } from "@/demo-integration/DemoDataProvider";

/** React context required by overview components in the full-report export tree. */
export function ReportExportProviders({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme="white">
      <StaticAuthProvider>
        <ViewModeProvider>
          <DemoDataProvider>{children}</DemoDataProvider>
        </ViewModeProvider>
      </StaticAuthProvider>
    </Theme>
  );
}
