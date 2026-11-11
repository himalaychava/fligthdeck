/**
 * Executive Account Summary — a Carbon tile dashboard, read-only.
 *
 * Tiles across three groups (Products, Support Activity, Opportunities),
 * matching the KPI tile pattern used elsewhere on Client Overview. Every
 * number is exact — computed server-side and never touched by AI. The only
 * AI-authored text is the short caption under each number, or the message
 * that replaces the number on an empty tile.
 *
 * Colour is deliberately loud: a tinted background, a coloured icon badge and
 * a coloured caption line, not just a border. The fixed palette per state is
 * what keeps it scannable — red always means the same thing everywhere on the
 * page, so a seller can read the account's health from the colours alone
 * before reading a single word.
 *
 * ── Why read-only ──
 * The content is generated from the customer's saved report during the batch
 * run. An edit would put a hand-typed value where a derived one belongs, and
 * it would be silently overwritten by the next run. Anyone who needs to
 * annotate downloads the report and edits their own copy. The server enforces
 * this too — PUT on this resource returns 405.
 *
 * ── Why it never regenerates on view ──
 * Captions are written once per report run and read back unchanged, so two
 * people looking at the same account in the same meeting see the same tiles.
 */
import { useEffect, useState } from "react";
import { Tile, SkeletonPlaceholder, SkeletonText, InlineNotification, Tag } from "@carbon/react";
import {
  Api,
  Application,
  Upgrade,
  WarningFilled,
  WarningAlt,
  CheckmarkFilled,
  CalendarHeatMap,
  WarningAltFilled,
  Information,
  Enterprise,
  DocumentSigned,
  Cube,
  Time,
  ServiceDesk,
  Collaborate,
} from "@carbon/icons-react";
import type { Client } from "@/data/clients";
import { apiFetch } from "@/lib/apiFetch";

type TileState = "risk" | "warning" | "positive" | "neutral" | "empty" | "none";
type TileGroup = "products" | "support" | "opportunities";

interface TileSpec {
  key: string;
  group: TileGroup;
  label: string;
  icon: string;
  value: string | null;
  secondary: string | null;
  /** Names listed under the value — up to three shown, then "+N more". */
  items?: string[];
  state: TileState;
  caption: string;
}

interface NarrativeSummary {
  intro: string;
  contracts: string;
  totals: string;
  endOfSupport: string;
  aiGenerated: boolean;
  ecProductNames: string[];
  eosExpiredProducts: string[];
  eosExpiringSoonProducts: string[];
}

interface SummaryResponse {
  clientId: string;
  clientName: string;
  narrative: NarrativeSummary;
  groups: { group: TileGroup; label: string; tiles: TileSpec[] }[];
  aiGenerated: boolean;
  generatedAt: string | null;
  reportGeneratedAt: string | null;
  hasSavedSummary: boolean;
}

interface Props {
  client: Client;
  /**
   * Leave out the Opportunities group — set on the external customer view so a
   * customer never sees their own account framed as a sales opportunity.
   */
  hideOpportunities?: boolean;
  /** Retained so existing call sites keep compiling; nothing here mutates. */
  onUpdate?: () => void;
}

const ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  Api,
  Application,
  Upgrade,
  WarningFilled,
  WarningAlt,
  CheckmarkFilled,
  CalendarHeatMap,
  WarningAltFilled,
  ServiceDesk,
  Collaborate,
};

/** Names shown on a tile before collapsing the rest into "+N more". */
const MAX_TILE_ITEMS = 3;

/**
 * Tile styling per state.
 *
 * Matches the rest of Control Plane: every other tile in the app (Product
 * Portfolio, Commercial Snapshot, KPI grid) sits on a plain Carbon neutral
 * layer and reserves colour for one small accent, not a full tinted card.
 * "positive" and "neutral" — routine counts, nothing to act on — get that same
 * plain treatment here: flat layer background, dark text throughout, a
 * neutral-grey icon swatch.
 *
 * "risk" and "warning" are the exception, and deliberately so: a customer with
 * live Sev1 cases or upgrade work outstanding is exactly what a seller needs to
 * see before the rest of the tile. Colour there is still restrained — a thin
 * top bar plus a tinted icon swatch, the same rgba(colour, 0.1)-style accent
 * already used elsewhere in the app, not a coloured background or coloured
 * text.
 */
const STATE_STYLE: Record<
  TileState,
  {
    bg: string;
    badgeBg: string;
    iconColor: string;
    valueColor: string;
    captionColor: string;
    topBar: string | null;
  }
> = {
  risk: {
    bg: "var(--cds-layer-01, #f4f4f4)",
    badgeBg: "rgba(218,30,40,0.12)",
    // Carbon's actual semantic token, matching ScoreGauge / KPIWidgetGrid /
    // ProductPortfolioHealth elsewhere in this app — not a hardcoded hex, so
    // it follows the app's theme rather than being frozen to one palette.
    iconColor: "var(--cds-support-error, #da1e28)",
    valueColor: "var(--cds-text-primary, #161616)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: "var(--cds-support-error, #da1e28)",
  },
  warning: {
    bg: "var(--cds-layer-01, #f4f4f4)",
    badgeBg: "rgba(241,194,27,0.18)",
    // Carbon has no single pre-mixed "readable amber text" token — the same
    // darker amber ProductPortfolioHealth already uses on its own warning tag,
    // for contrast on a light background, not an invented one-off colour.
    iconColor: "#8a6d00",
    valueColor: "var(--cds-text-primary, #161616)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: "var(--cds-support-warning, #f1c21b)",
  },
  positive: {
    bg: "var(--cds-layer-01, #f4f4f4)",
    badgeBg: "var(--cds-layer-02, #e0e0e0)",
    iconColor: "var(--cds-icon-secondary, #525252)",
    valueColor: "var(--cds-text-primary, #161616)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: null,
  },
  neutral: {
    bg: "var(--cds-layer-01, #f4f4f4)",
    badgeBg: "var(--cds-layer-02, #e0e0e0)",
    iconColor: "var(--cds-icon-secondary, #525252)",
    valueColor: "var(--cds-text-primary, #161616)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: null,
  },
  // Checked, nothing qualified — muted like "empty" but without the top bar,
  // since it is a result rather than missing data.
  none: {
    bg: "var(--cds-layer-01, #f4f4f4)",
    badgeBg: "var(--cds-layer-02, #e0e0e0)",
    iconColor: "var(--cds-text-placeholder, #a8a8a8)",
    valueColor: "var(--cds-text-secondary, #525252)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: null,
  },
  empty: {
    bg: "var(--cds-layer-02, #f4f4f4)",
    badgeBg: "var(--cds-layer-03, #e0e0e0)",
    iconColor: "var(--cds-text-placeholder, #a8a8a8)",
    valueColor: "var(--cds-text-secondary, #525252)",
    captionColor: "var(--cds-text-secondary, #525252)",
    topBar: "var(--cds-border-subtle-01, #e0e0e0)",
  },
};

function formatWhen(iso: string | null): string {
  if (!iso) return "not generated yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "not generated yet" : d.toLocaleString();
}

function SummaryTile({ tile }: { tile: TileSpec }) {
  const Icon = ICONS[tile.icon] ?? Application;
  const style = STATE_STYLE[tile.state];
  const isNone = tile.state === "none";
  const isEmpty = !isNone && (tile.state === "empty" || tile.value === null);

  return (
    <Tile
      className="cp-exec-tile"
      style={{
        position: "relative",
        overflow: "hidden",
        background: style.bg,
        padding: "1rem 1.05rem 0.9rem",
        minHeight: 132,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        border: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
      }}
    >
      {/* Top accent bar — present only on tiles worth flagging (risk/warning).
          Routine tiles have none, matching how the rest of the app treats a
          plain metric versus one that needs attention. */}
      {style.topBar && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: style.topBar }}
        />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "var(--cds-text-secondary, #525252)",
            textTransform: "uppercase",
            lineHeight: 1.3,
          }}
        >
          {tile.label}
        </span>
        <div
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            background: style.badgeBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isEmpty ? (
            <Information size={16} style={{ color: style.iconColor }} />
          ) : isNone ? (
            <Icon size={16} style={{ color: style.iconColor }} />
          ) : (
            <Icon size={16} style={{ color: style.iconColor }} />
          )}
        </div>
      </div>

      {isNone ? (
        <div style={{ fontSize: "0.83rem", color: style.captionColor, lineHeight: 1.4, marginTop: "0.1rem" }}>
          {tile.caption}
        </div>
      ) : isEmpty ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.1rem" }}>
          <Tag type="cool-gray" size="sm" style={{ width: "fit-content", margin: 0 }}>
            No data
          </Tag>
          <div style={{ fontSize: "0.83rem", color: style.captionColor, lineHeight: 1.4 }}>
            {tile.caption}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              lineHeight: 1.05,
              color: style.valueColor,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}
          >
            {tile.value}
          </div>
          {tile.secondary && (
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 500,
                color: "var(--cds-text-secondary, #525252)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={tile.secondary}
            >
              {tile.secondary}
            </div>
          )}
          {tile.items && tile.items.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.15rem" }}>
              {tile.items.slice(0, MAX_TILE_ITEMS).map((name) => (
                <li
                  key={name}
                  title={name}
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--cds-text-primary, #161616)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </li>
              ))}
              {tile.items.length > MAX_TILE_ITEMS && (
                <li
                  title={tile.items.slice(MAX_TILE_ITEMS).join("\n")}
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--cds-text-secondary, #525252)" }}
                >
                  +{tile.items.length - MAX_TILE_ITEMS} more
                </li>
              )}
            </ul>
          )}
          <div
            style={{
              fontSize: "0.79rem",
              fontWeight: 600,
              color: style.captionColor,
              marginTop: "auto",
            }}
          >
            {tile.caption}
          </div>
        </>
      )}
    </Tile>
  );
}

/**
 * The descriptive bullets above the tiles.
 *
 * Four distinct points, each a single self-contained fact, with the EC product
 * names nested under the Expertise Connect point. Product names come straight
 * from the report data rather than the generated text, so this list and the EC
 * Products tile below can never disagree.
 *
 * Contracts appear here and nowhere else — the contracts tile group was
 * removed, so this is the only place contract facts are stated.
 */
/** One row of the account snapshot panel: an icon badge, a sentence, optional pills below it. */
function SnapshotRow({
  icon: Icon,
  text,
  children,
  last,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  text: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.85rem",
        alignItems: "flex-start",
        padding: "0.85rem 0",
        borderBottom: last ? "none" : "1px solid rgba(15,98,254,0.12)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          background: "rgba(15,98,254,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "0.05rem",
        }}
      >
        <Icon size={17} style={{ color: "var(--cp-accent, #0f62fe)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "0.94rem",
            lineHeight: 1.5,
            color: "var(--cds-text-primary, #161616)",
          }}
        >
          {text}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * The descriptive account snapshot above the tiles.
 *
 * Three fixed sentences, each on its own row with an icon badge, styled as a
 * distinct panel so it reads as a designed part of the page rather than plain
 * text sitting above the tile grid. The EC product names render as pills under
 * the intro row, straight from the report data — never from the generated
 * text — so this list and the EC Products tile below can never disagree.
 *
 * Wording is fixed: the same three sentence patterns for every customer, with
 * only the values substituted. See executiveSummaryNarrative.ts.
 */
function NarrativeBlock({ narrative }: { narrative: NarrativeSummary }) {
  return (
    <Tile
      style={{
        marginBottom: "1.5rem",
        padding: "1.1rem 1.3rem",
        borderLeft: "3px solid var(--cp-accent, #0f62fe)",
        background: "rgba(15,98,254,0.05)",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--cp-accent, #0f62fe)",
          marginBottom: "0.15rem",
        }}
      >
        Account Snapshot
      </div>

      <SnapshotRow icon={Enterprise} text={narrative.intro}>
        {narrative.ecProductNames.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
            {narrative.ecProductNames.map((name) => (
              <Tag key={name} type="blue" size="sm" style={{ margin: 0 }}>
                {name}
              </Tag>
            ))}
          </div>
        )}
      </SnapshotRow>

      <SnapshotRow icon={DocumentSigned} text={narrative.contracts} />
      <SnapshotRow icon={Cube} text={narrative.totals} />

      {/* End of support — red for already past it, amber for nearing, matching
          the status colours the Insights upgrades table already uses. */}
      <SnapshotRow icon={Time} text={narrative.endOfSupport} last>
        {(narrative.eosExpiredProducts.length > 0 ||
          narrative.eosExpiringSoonProducts.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
            {narrative.eosExpiredProducts.map((name) => (
              <Tag key={`eos-${name}`} type="red" size="sm" style={{ margin: 0 }}>
                {name}
              </Tag>
            ))}
            {narrative.eosExpiringSoonProducts.map((name) => (
              <Tag
                key={`soon-${name}`}
                size="sm"
                style={{ margin: 0, background: "#fef1c9", color: "#6c4d00" }}
              >
                {name}
              </Tag>
            ))}
          </div>
        )}
      </SnapshotRow>
    </Tile>
  );
}

function TileGroupSection({ label, tiles }: { label: string; tiles: TileSpec[] }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.6rem",
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--cds-text-primary, #161616)",
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--cds-border-subtle-01, #e0e0e0)" }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {tiles.map((t) => (
          <SummaryTile key={t.key} tile={t} />
        ))}
      </div>
    </div>
  );
}

export function ExecutiveSummary({ client, hideOpportunities = false }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/demo/clients/${encodeURIComponent(client.clientId)}/executive-summary`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load summary (${res.status})`);
        return (await res.json()) as SummaryResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load summary");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client.clientId]);

  return (
    <section className="cp-section">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.85rem",
        }}
      >
        <h2 className="cp-section-title" style={{ margin: 0 }}>
          Executive Account Summary
        </h2>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--cds-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {data && !data.hasSavedSummary && (
            <Tag type="cool-gray" size="sm">
              Awaiting report run
            </Tag>
          )}
          Generated: {formatWhen(data?.generatedAt ?? data?.reportGeneratedAt ?? null)}
        </span>
      </div>

      {loading && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SkeletonText paragraph lineCount={4} />
        </div>
      )}

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: "0.75rem" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonPlaceholder key={i} style={{ height: 132, width: "100%" }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <InlineNotification
          kind="error"
          title="Summary unavailable"
          subtitle={error}
          lowContrast
          hideCloseButton
          style={{ maxWidth: "none" }}
        />
      )}

      {!loading && !error && data && (
        <div>
          {data.narrative && <NarrativeBlock narrative={data.narrative} />}
          <div style={{ display: "grid", gap: "1.35rem" }}>
            {data.groups
              .filter((g) => !(hideOpportunities && g.group === "opportunities"))
              .map((g) => (
                <TileGroupSection key={g.group} label={g.label} tiles={g.tiles} />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
