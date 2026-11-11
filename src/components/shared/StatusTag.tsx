import { Tag } from "@carbon/react";

type Status = "Excellent" | "Good" | "Watch" | "Critical" | "Pilot";

const MAP: Record<Status, "green" | "blue" | "magenta" | "red" | "purple"> = {
  Excellent: "green",
  Good: "blue",
  Watch: "magenta",
  Critical: "red",
  Pilot: "purple",
};

export function StatusTag({ status }: { status: Status }) {
  return <Tag type={MAP[status]}>{status.toUpperCase()}</Tag>;
}