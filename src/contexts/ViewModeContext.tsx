import { createContext, useContext, useState, type ReactNode } from "react";

export type ViewMode = "internal" | "external" | "demo";
export type ViewAs = "management" | "sales" | "delivery";

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  viewAs: ViewAs;
  setViewAs: (v: ViewAs) => void;
}

const ViewModeContext = createContext<ViewModeContextValue | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>("internal");
  const [viewAs, setViewAs] = useState<ViewAs>("delivery");
  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, viewAs, setViewAs }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider");
  return ctx;
}