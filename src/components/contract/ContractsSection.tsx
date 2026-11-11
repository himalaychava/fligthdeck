/**
 * ContractsSection
 * ────────────────
 * One box per contract (work order). Each box holds two rows:
 *
 *   Row 1 — Project Name · Owner · Project Manager (Primary TAM)
 *   Row 2 — Start Date · End Date · ACV · TCV
 *   Row 3 — Delivery Consultants and their products, always user-maintained
 *
 * Every card renders in full — no expand/collapse.
 */
import { useState, useMemo, useCallback } from "react";
import { Button, TextInput, ComboBox, Tag, InlineLoading } from "@carbon/react";
import { Add, TrashCan, Save, Edit, Close } from "@carbon/icons-react";

export interface DeliveryConsultant {
  id: string;
  name: string;
  products: string[];
}

export interface ContractWithTeam {
  workOrderNumber: string;
  projectName: string;
  startDate: string;
  endDate: string;
  acv: number | null;
  tcv: number | null;
  owner: string | null;
  primaryTam: string | null;
  /** Holder that signed for this customer, e.g. "Saudi Business Machines (SBM)"; null when held directly. */
  contractedThrough?: string | null;
  /** True when Clarizen supplied the value — field renders read-only. */
  ownerLocked: boolean;
  projectManagerLocked: boolean;
  deliveryConsultants: DeliveryConsultant[];
}

/** Shown wherever a value is genuinely absent. */
const EMPTY = "—";
/**
 * How many products the dropdown renders at once.
 *
 * Carbon's ComboBox has no virtualisation — every matching item becomes a DOM
 * node, rebuilt on each keystroke — so the full 1,115-name catalogue would
 * stutter on open and while typing.
 *
 * 200 was chosen from the real distribution rather than picked round: at 50,
 * 22% of two-character searches were being truncated and even a specific word
 * like "cloud" (81 matches) hit the ceiling. At 200 only bare single letters
 * and an empty box exceed it, and those aren't searches anyone completes by
 * scrolling. 200 nodes renders without noticeable lag.
 */
const PRODUCT_MENU_LIMIT = 200;

function formatDate(iso: string): string {
  if (!iso) return EMPTY;
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** ACV and TCV are USD figures and always render with the currency symbol. */
function formatMoney(v: number | null): string {
  if (v === null) return EMPTY;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function contractState(endDate: string): { label: string; fg: string; bg: string } | null {
  if (!endDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today) return { label: "Ended", fg: "#a2191f", bg: "#fff1f1" };
  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + 3);
  if (endDate <= horizon.toISOString().slice(0, 10)) {
    return { label: "Ending soon", fg: "#8a6d00", bg: "#fef7dc" };
  }
  return { label: "Active", fg: "#0e6027", bg: "#defbe6" };
}

/**
 * Carbon type tokens, applied directly.
 *
 * The app imports @carbon/styles but that bundle ships the theme CSS custom
 * properties WITHOUT the `cds--type-*` utility classes, so the scale has to be
 * set by value. These are the real v11 productive tokens — matching them
 * exactly is what makes the tab read as Carbon rather than approximately so.
 */
const type = {
  /** label-01 — 12px / 16px / 400 / 0.32px */
  label01: {
    fontSize: "0.75rem",
    lineHeight: "1rem",
    fontWeight: 400,
    letterSpacing: "0.32px",
  },
  /** body-compact-01 — 14px / 18px / 400 / 0.16px */
  bodyCompact01: {
    fontSize: "0.875rem",
    lineHeight: "1.125rem",
    fontWeight: 400,
    letterSpacing: "0.16px",
  },
  /** heading-compact-01 — 14px / 18px / 600 / 0.16px */
  headingCompact01: {
    fontSize: "0.875rem",
    lineHeight: "1.125rem",
    fontWeight: 600,
    letterSpacing: "0.16px",
  },
  /** heading-03 — 20px / 28px / 400 */
  heading03: { fontSize: "1.25rem", lineHeight: "1.75rem", fontWeight: 400, letterSpacing: 0 },
  /** helper-text-01 — 12px / 16px / 400 / 0.32px */
  helper01: {
    fontSize: "0.75rem",
    lineHeight: "1rem",
    fontWeight: 400,
    letterSpacing: "0.32px",
  },
} as const;

/** Carbon theme tokens — resolve from @carbon/styles, so they follow the theme. */
const token = {
  textPrimary: "var(--cds-text-primary, #161616)",
  textSecondary: "var(--cds-text-secondary, #525252)",
  textHelper: "var(--cds-text-helper, #6f6f6f)",
  textPlaceholder: "var(--cds-text-placeholder, #a8a8a8)",
  layer01: "var(--cds-layer-01, #f4f4f4)",
  layerAccent01: "var(--cds-layer-accent-01, #e0e0e0)",
  borderSubtle: "var(--cds-border-subtle-01, #e0e0e0)",
  interactive: "var(--cds-interactive, #0f62fe)",
  supportSuccess: "var(--cds-support-success, #24a148)",
} as const;

const cellLabel = {
  ...type.label01,
  color: token.textSecondary,
  marginBottom: "0.25rem",
};
/** Values carry heading-compact-01 so the data reads as the emphasis, not the labels. */
const cellValue = {
  ...type.headingCompact01,
  color: token.textPrimary,
  overflowWrap: "anywhere" as const,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={cellLabel}>{label}</div>
      <div style={cellValue}>{children}</div>
    </div>
  );
}

/**
 * One contract card. Always fully visible — no expand/collapse.
 *
 * Three rows:
 *   1. Project Name · Owner · Project Manager (Primary TAM)
 *   2. Start Date · End Date · ACV · TCV
 *   3. Delivery Consultants and their products — always editable
 *
 * Owner and Project Manager come from Clarizen and render read-only when it
 * has a value. When Clarizen has none (null) they become editable so the gap
 * can be filled by hand — see ownerLocked / projectManagerLocked.
 */
function ContractBox({
  contract,
  products,
  onSave,
  saving,
  canEdit,
}: {
  contract: ContractWithTeam;
  products: string[];
  onSave: (workOrder: string, patch: Partial<ContractWithTeam>) => Promise<void>;
  saving: boolean;
  /** False hides the Edit control entirely — a view-only card. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(contract.owner ?? "");
  const [projectManager, setProjectManager] = useState(contract.primaryTam ?? "");
  const [consultants, setConsultants] = useState<DeliveryConsultant[]>(
    contract.deliveryConsultants,
  );
  const [productQuery, setProductQuery] = useState("");

  const state = contractState(contract.endDate);

  const productOptions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const matched = q ? products.filter((p) => p.toLowerCase().includes(q)) : products;
    return { items: matched.slice(0, PRODUCT_MENU_LIMIT), total: matched.length };
  }, [products, productQuery]);

  const startEdit = () => {
    setOwner(contract.owner ?? "");
    setProjectManager(contract.primaryTam ?? "");
    setConsultants(contract.deliveryConsultants);
    setEditing(true);
  };

  const cancel = () => {
    setOwner(contract.owner ?? "");
    setProjectManager(contract.primaryTam ?? "");
    setConsultants(contract.deliveryConsultants);
    setEditing(false);
  };

  const save = async () => {
    await onSave(contract.workOrderNumber, {
      // Locked fields are ignored server-side; sending null keeps intent clear.
      owner: contract.ownerLocked ? null : owner || null,
      primaryTam: contract.projectManagerLocked ? null : projectManager || null,
      deliveryConsultants: consultants,
    });
    setEditing(false);
  };

  const updateConsultant = (id: string, patch: Partial<DeliveryConsultant>) =>
    setConsultants((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** Owner / Project Manager cell — read-only from Clarizen, or an input when blank there. */
  const personCell = (
    locked: boolean,
    clarizenValue: string | null,
    draft: string,
    setDraft: (v: string) => void,
    inputId: string,
  ) => {
    if (locked) return <span>{clarizenValue}</span>;
    if (editing) {
      return (
        <TextInput
          id={inputId}
          labelText=""
          size="sm"
          placeholder="Not in Clarizen — add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      );
    }
    return (
      <span style={{ color: clarizenValue ? token.textPrimary : token.textPlaceholder }}>
        {clarizenValue ?? EMPTY}
      </span>
    );
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderLeft: "3px solid #0f62fe",
        borderRadius: 4,
        background: "#fff",
        marginBottom: "0.75rem",
        padding: "0.875rem 1rem",
      }}
    >
      {/* Card header — work order is the contract ID */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <span style={{ ...type.headingCompact01, fontFamily: "'IBM Plex Mono', monospace" }}>
          {contract.workOrderNumber || "(no work order)"}
        </span>
        {state && (
          <span
            style={{
              ...type.label01,
              fontWeight: 600,
              color: state.fg,
              background: state.bg,
              borderRadius: 10,
              padding: "0.1rem 0.5rem",
              whiteSpace: "nowrap",
            }}
          >
            {state.label}
          </span>
        )}
        {contract.contractedThrough && (
          <span style={{ ...type.label01, color: token.textSecondary }}>
            Contracted through: {contract.contractedThrough}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {/* canEdit hides the control entirely rather than disabling it — a
            view-only user should see a plain card, not a greyed-out button
            inviting a click that will fail server-side anyway. */}
        {canEdit && !editing && (
          <Button kind="ghost" size="sm" renderIcon={Edit} onClick={startEdit}>
            Edit
          </Button>
        )}
        {canEdit && editing && (
          <>
            <Button kind="ghost" size="sm" renderIcon={Close} disabled={saving} onClick={cancel}>
              Cancel
            </Button>
            <Button
              kind="primary"
              size="sm"
              renderIcon={Save}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </div>

      {/* ── Row 1 — Project Name · Owner · Project Manager ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <Field label="Project Name">{contract.projectName || EMPTY}</Field>
        <Field label="Project Owner">
          {personCell(
            contract.ownerLocked,
            contract.owner,
            owner,
            setOwner,
            `owner-${contract.workOrderNumber}`,
          )}
        </Field>
        <Field label="Project Manager (Primary TAM)">
          {personCell(
            contract.projectManagerLocked,
            contract.primaryTam,
            projectManager,
            setProjectManager,
            `pm-${contract.workOrderNumber}`,
          )}
        </Field>
      </div>

      {/* ── Row 2 — Start · End · ACV · TCV ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "0.75rem",
          background: token.layer01,
          border: "1px solid #f0f0f0",
          borderRadius: 4,
          padding: "0.6rem 0.75rem",
          marginBottom: "0.875rem",
        }}
      >
        <Field label="Start Date">{formatDate(contract.startDate)}</Field>
        <Field label="End Date">{formatDate(contract.endDate)}</Field>
        <Field label="ACV">
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(contract.acv)}</span>
        </Field>
        <Field label="TCV">
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(contract.tcv)}</span>
        </Field>
      </div>

      {/* ── Row 3 — Delivery Consultants, always manual ── */}
      <div>
        <div
          style={{
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "#0e6027",
            marginBottom: "0.4rem",
          }}
        >
          DELIVERY TEAM
        </div>

        {consultants.length === 0 && !editing && (
          <p style={{ ...type.helper01, color: token.textPlaceholder, margin: 0 }}>
            {canEdit
              ? "No delivery consultants recorded. Use Edit to add them."
              : "No delivery consultants recorded."}
          </p>
        )}

        {!editing && consultants.length > 0 && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 4, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", ...type.bodyCompact01 }}>
              <thead>
                <tr
                  style={{
                    background: token.layer01,
                    borderBottom: `1px solid ${token.borderSubtle}`,
                  }}
                >
                  {["Delivery Consultant", "Products"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        ...type.label01,
                        color: token.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consultants.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #eef0f2" }}>
                    <td
                      style={{ padding: "0.5rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}
                    >
                      {c.name || EMPTY}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {c.products.length === 0 ? (
                        <span style={{ color: token.textPlaceholder }}>{EMPTY}</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                          {c.products.map((p) => (
                            <Tag key={p} type="cool-gray" size="sm">
                              {p}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {consultants.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 4,
                  padding: "0.6rem 0.75rem",
                  background: token.layer01,
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <div style={cellLabel}>Delivery Consultant</div>
                    <TextInput
                      id={`dc-${c.id}`}
                      labelText=""
                      size="sm"
                      placeholder="Name"
                      value={c.name}
                      onChange={(e) => updateConsultant(c.id, { name: e.target.value })}
                    />
                  </div>
                  <Button
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    iconDescription="Remove consultant"
                    renderIcon={TrashCan}
                    onClick={() => setConsultants((prev) => prev.filter((x) => x.id !== c.id))}
                  />
                </div>

                <div style={{ marginTop: "0.5rem" }}>
                  <div style={cellLabel}>
                    Products
                    {c.products.length > 0 && (
                      <span style={{ color: token.textHelper }}>
                        {" "}
                        · {c.products.length} selected
                      </span>
                    )}
                  </div>

                  {/* Selected products sit ABOVE the search box so they read as
                      the running result of what you've picked, and stay visible
                      while you keep searching for the next one. They accumulate
                      in local state and all persist together on Save. */}
                  {c.products.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.25rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      {c.products.map((p) => (
                        <Tag
                          key={p}
                          type="cool-gray"
                          size="sm"
                          filter
                          onClose={() =>
                            updateConsultant(c.id, {
                              products: c.products.filter((x) => x !== p),
                            })
                          }
                        >
                          {p}
                        </Tag>
                      ))}
                    </div>
                  )}

                  {/* Pick one at a time; each selection clears the box so you
                      can immediately search for the next. Nothing is written
                      to the server until Save. */}
                  <ComboBox
                    id={`prod-${c.id}`}
                    titleText=""
                    placeholder="Search a product to add…"
                    size="sm"
                    items={productOptions.items}
                    selectedItem={null}
                    itemToString={(i: string | null) => i ?? ""}
                    onInputChange={(t: string) => setProductQuery(t ?? "")}
                    shouldFilterItem={() => true}
                    onChange={({ selectedItem }: { selectedItem?: string | null }) => {
                      const picked = selectedItem as string | null | undefined;
                      if (!picked || c.products.includes(picked)) return;
                      updateConsultant(c.id, { products: [...c.products, picked] });
                      setProductQuery("");
                    }}
                    helperText={
                      productOptions.total > productOptions.items.length
                        ? `Showing ${productOptions.items.length} of ${productOptions.total.toLocaleString()} — type to narrow`
                        : undefined
                    }
                  />
                </div>
              </div>
            ))}

            <div>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Add}
                onClick={() =>
                  setConsultants((prev) => [
                    ...prev,
                    {
                      id: `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                      name: "",
                      products: [],
                    },
                  ])
                }
              >
                Add Delivery Consultant
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContractsSection({
  clientId,
  contracts,
  products,
  onReload,
  callerEmail = "",
  canEdit = true,
}: {
  clientId: string;
  contracts: ContractWithTeam[];
  products: string[];
  onReload: (next: ContractWithTeam[]) => void;
  callerEmail?: string;
  /**
   * False renders every contract card view-only — no Edit control. Defaults
   * to true so every existing caller keeps its current behaviour unchanged;
   * only the Contract route passes this explicitly, driven by the Delivery
   * "Edit Access" entitlement.
   */
  canEdit?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (workOrder: string, patch: Partial<ContractWithTeam>) => {
      setSaving(true);
      setError(null);
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (callerEmail) headers["x-cp-email"] = callerEmail;
        const res = await fetch(
          `/api/demo/contracts/${encodeURIComponent(clientId)}/${encodeURIComponent(workOrder)}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              owner: patch.owner ?? null,
              projectManager: patch.primaryTam ?? null,
              deliveryConsultants: patch.deliveryConsultants ?? [],
            }),
          },
        );
        const data = (await res.json()) as { contracts?: ContractWithTeam[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Save failed");
          return;
        }
        if (data.contracts) onReload(data.contracts);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [clientId, callerEmail, onReload],
  );

  if (contracts.length === 0) {
    return (
      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          background: "#fff",
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ ...type.heading03, color: token.textPrimary, margin: "0 0 0.5rem" }}>
          Contracts
        </h2>
        <p style={{ ...type.bodyCompact01, color: token.textSecondary, margin: 0 }}>
          No contracts found in Clarizen for this client.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ ...type.heading03, color: token.textPrimary, margin: 0 }}>
            Contracts <span style={{ color: token.textSecondary }}>({contracts.length})</span>
          </h2>
          <p style={{ ...type.helper01, color: token.textHelper, margin: "0.25rem 0 0" }}>
            Each work order is a separate contract.
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#a2191f",
            background: "#fff1f1",
            border: "1px solid #da1e28",
            borderRadius: 4,
            padding: "0.5rem 0.625rem",
            marginBottom: "0.75rem",
          }}
        >
          {error}
        </div>
      )}

      {contracts.map((c, i) => (
        <ContractBox
          key={`${c.workOrderNumber}-${i}`}
          contract={c}
          products={products}
          onSave={handleSave}
          saving={saving}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

export { InlineLoading };
