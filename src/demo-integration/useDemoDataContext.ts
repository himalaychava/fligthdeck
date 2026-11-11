import { useContext } from "react";
import { DemoDataContext } from "./demoDataContextState";

export function useDemoData() {
  const ctx = useContext(DemoDataContext);
  if (!ctx) throw new Error("useDemoData must be used within DemoDataProvider");
  return ctx;
}
