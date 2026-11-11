import type { KPIScoringGuidance as KPIScoringGuidanceType } from "@/data/kpiLibrary";

interface KPIScoringGuidanceProps {
  guidance: KPIScoringGuidanceType;
  selectedRange?: string;
  onBandSelect: (midpoint: number) => void;
}

const BAND_COLORS: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  "1-2": {
    border: "var(--cds-support-error, #da1e28)",
    bg: "rgba(218,30,40,0.06)",
    label: "Critical",
    labelColor: "var(--cds-support-error, #da1e28)",
  },
  "3-4": {
    border: "var(--cds-support-caution, #ff832b)",
    bg: "rgba(255,131,43,0.06)",
    label: "Watch",
    labelColor: "var(--cds-support-caution, #ff832b)",
  },
  "5-6": {
    border: "var(--cds-support-warning, #f1c21b)",
    bg: "rgba(241,194,27,0.06)",
    label: "Developing",
    labelColor: "#8a6800",
  },
  "7-8": {
    border: "#0f62fe",
    bg: "rgba(15,98,254,0.06)",
    label: "Good",
    labelColor: "#0f62fe",
  },
  "9-10": {
    border: "var(--cds-support-success, #24a148)",
    bg: "rgba(36,161,72,0.06)",
    label: "Excellent",
    labelColor: "var(--cds-support-success, #24a148)",
  },
};

const BAND_MIDPOINTS: Record<string, number> = {
  "1-2": 1.5,
  "3-4": 3.5,
  "5-6": 5.5,
  "7-8": 7.5,
  "9-10": 9.5,
};

export function KPIScoringGuidance({ guidance, selectedRange, onBandSelect }: KPIScoringGuidanceProps) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--cds-text-primary)",
          marginBottom: "0.75rem",
          marginTop: 0,
        }}
      >
        {guidance.question}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "0.5rem",
        }}
      >
        {guidance.bands.map((band) => {
          const colors = BAND_COLORS[band.range] ?? BAND_COLORS["5-6"];
          const isSelected = selectedRange === band.range;
          return (
            <button
              key={band.range}
              type="button"
              onClick={() => onBandSelect(BAND_MIDPOINTS[band.range] ?? 5.5)}
              style={{
                border: `2px solid ${isSelected ? colors.border : "var(--cds-border-subtle)"}`,
                background: isSelected ? colors.bg : "var(--cds-layer-01)",
                borderRadius: "4px",
                padding: "0.625rem 0.5rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
                outline: "none",
              }}
              aria-pressed={isSelected}
              title={band.description}
            >
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  color: colors.border,
                  marginBottom: "0.2rem",
                }}
              >
                {band.range}
              </div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: colors.labelColor,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "0.35rem",
                }}
              >
                {colors.label}
              </div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--cds-text-secondary)",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {band.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
