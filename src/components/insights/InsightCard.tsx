import { Tile, InlineLoading } from "@carbon/react";
import type { ReactNode } from "react";

interface InsightCardProps {
  title: string;
  aiText: string | null;
  aiAvailable: boolean;
  loading?: boolean;
  bulletList?: boolean; // render aiText as styled bullet rows instead of a paragraph
  children?: ReactNode; // supporting data table/stats
}

// Accent colours cycling for bullet rows
const BULLET_ACCENTS = ["#0f62fe", "#6929c4", "#005d5d", "#9f1853"];

export function InsightCard({ title, aiText, aiAvailable, loading, bulletList, children }: InsightCardProps) {
  // Parse bullet lines: lines starting with "- " or "• "
  const bullets = bulletList && aiText
    ? aiText.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)
    : [];

  return (
    <Tile style={{ marginBottom: "1.25rem", padding: "1.5rem", position: "relative" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#161616", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </h3>

      {loading ? (
        <InlineLoading description="Generating AI commentary…" style={{ marginBottom: "0.75rem" }} />
      ) : aiText && bulletList ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: children ? "1.25rem" : 0 }}>
          {bullets.map((b, i) => {
            const accent = BULLET_ACCENTS[i % BULLET_ACCENTS.length];
            // Bold the first clause (text before first " — " or ": " or first 4 words)
            const dashIdx = b.indexOf(" — ");
            const colonIdx = b.indexOf(": ");
            const splitIdx = dashIdx !== -1 ? dashIdx : colonIdx !== -1 ? colonIdx : -1;
            const boldPart = splitIdx !== -1 ? b.slice(0, splitIdx + (dashIdx !== -1 ? 3 : 2)) : "";
            const restPart = splitIdx !== -1 ? b.slice(splitIdx + (dashIdx !== -1 ? 3 : 2)) : b;

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  background: "#f4f9ff",
                  border: "1px solid #d0e2ff",
                  borderLeft: `4px solid ${accent}`,
                  borderRadius: "2px",
                  padding: "0.625rem 0.875rem",
                }}
              >
                {/* Step number badge */}
                <span style={{
                  flexShrink: 0,
                  width: "1.375rem",
                  height: "1.375rem",
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "0.0625rem",
                }}>
                  {i + 1}
                </span>

                {/* Text */}
                <span style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.6 }}>
                  {boldPart && <strong style={{ color: accent }}>{boldPart}</strong>}
                  {restPart}
                </span>
              </div>
            );
          })}
        </div>
      ) : aiText ? (
        <p style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.6, marginBottom: children ? "1rem" : 0, borderLeft: "3px solid #0f62fe", paddingLeft: "0.75rem", background: "#f4f9ff", padding: "0.75rem", marginTop: 0 }}>
          {aiText}
        </p>
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "#6f6f6f", fontStyle: "italic", marginBottom: children ? "1rem" : 0 }}>
          {aiAvailable === false ? "AI commentary unavailable — showing data summary only." : "No AI commentary generated."}
        </p>
      )}

      {children && <div style={{ marginTop: aiText ? "1rem" : 0 }}>{children}</div>}

    </Tile>
  );
}
