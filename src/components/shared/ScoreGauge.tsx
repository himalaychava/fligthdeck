interface Props { value: number; max?: number }
export function ScoreGauge({ value, max = 100 }: Props) {
  const color =
    value >= 80 ? "var(--cds-support-success)" :
    value >= 60 ? "var(--cds-support-info)" :
    value >= 40 ? "var(--cds-support-warning)" :
    "var(--cds-support-error)";
  return (
    <span style={{ fontWeight: 400, fontSize: "1.5rem", color }}>
      {value}<span style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>/{max}</span>
    </span>
  );
}