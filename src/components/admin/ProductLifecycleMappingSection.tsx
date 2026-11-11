/**
 * ProductLifecycleMappingSection
 * ──────────────────────────────
 * Admin screen for mapping CSP product names to IBM Product Lifecycle Catalog
 * entries, for the products the automatic 3-layer matcher cannot resolve.
 *
 * Saved mappings take effect immediately — the backend reads the mapping file
 * on every resolution pass, so no restart, redeploy or data re-upload is needed.
 *
 * Both fields are combo boxes rather than free text, because a mapping only
 * works if the CSP name matches the case data exactly and the catalog name
 * exists in the uploaded catalog — neither is something to retype by hand.
 * Selecting a CSP product re-ranks the catalog list to that product's
 * suggestions, so the usual path is two clicks.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, ComboBox, InlineLoading, Tag } from "@carbon/react";
import { Add, TrashCan, Renew, Edit as EditIcon } from "@carbon/icons-react";

interface Mapping {
  cspProductName: string;
  catalogProductName: string;
  updatedAt: string;
  updatedBy: string;
}

interface CatalogSuggestion {
  catalogName: string;
  versionsCovered: number;
  versionsTested: number;
  sampleVrms: string[];
  hasDates: boolean;
}

interface PendingProduct {
  productName: string;
  caseCount: number;
  clientCount: number;
  sampleVersions: string[];
  suggestions: CatalogSuggestion[];
}

interface PendingResult {
  products: PendingProduct[];
  totalDistinctProducts: number;
  resolvedProducts: number;
  scannedAt: string;
}

/** One entry in the CSP product combo box. */
interface CspOption {
  id: string;
  label: string;
  clientCount: number | null;
  alreadyMapped: boolean;
}

/** One entry in the catalog product combo box. */
interface CatalogOption {
  id: string;
  label: string;
  /** Set when this entry is a ranked suggestion for the selected CSP product. */
  coverage: string | null;
}

/**
 * The catalog runs to 4,000+ entries and Carbon renders every matching item
 * into the DOM on open and on each keystroke, so the menu is capped. Scrolling
 * that many is not how anyone finds a product anyway — the suggestions cover
 * the common case and typing covers the rest — but the cap is surfaced in the
 * helper text below the field so a truncated list never reads as a broken one.
 */
const CATALOG_MENU_LIMIT = 100;

export function ProductLifecycleMappingSection({ callerEmail = "" }: { callerEmail?: string }) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [catalogNames, setCatalogNames] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cspName, setCspName] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (callerEmail) h["x-cp-email"] = callerEmail;
    return h;
  }, [callerEmail]);

  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lifecycle-mappings", { headers: headers() });
      const data = (await res.json()) as { mappings?: Mapping[]; catalogProductNames?: string[] };
      setMappings(data.mappings ?? []);
      setCatalogNames(data.catalogProductNames ?? []);
    } catch {
      /* leave existing state */
    }
  }, [headers]);

  const loadPending = useCallback(
    async (refresh = false) => {
      setLoadingPending(true);
      try {
        const res = await fetch(`/api/admin/lifecycle-pending${refresh ? "?refresh=true" : ""}`, {
          headers: headers(),
        });
        const data = (await res.json()) as PendingResult & { error?: string };
        if (data.error) setError(data.error);
        else setPending(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to scan");
      } finally {
        setLoadingPending(false);
      }
    },
    [headers],
  );

  // Both load on open. The pending scan is cached server-side for 5 minutes, so
  // this is only slow on the first visit after a data upload.
  useEffect(() => {
    void loadMappings();
    void loadPending(false);
  }, [loadMappings, loadPending]);

  // ── CSP options: unmapped first (they're the ones needing work), then the
  //    already-mapped ones so an existing mapping can be re-pointed. ──
  const cspOptions = useMemo<CspOption[]>(() => {
    const mappedNames = new Set(mappings.map((m) => m.cspProductName.trim().toLowerCase()));
    const unmapped = (pending?.products ?? [])
      .filter((p) => !mappedNames.has(p.productName.trim().toLowerCase()))
      .map((p) => ({
        id: p.productName,
        label: p.productName,
        clientCount: p.clientCount,
        alreadyMapped: false,
      }));
    const mapped = mappings.map((m) => ({
      id: m.cspProductName,
      label: m.cspProductName,
      clientCount: null,
      alreadyMapped: true,
    }));
    return [...unmapped, ...mapped];
  }, [pending, mappings]);

  const selectedCspOption = useMemo(
    () => cspOptions.find((o) => o.label.toLowerCase() === cspName.trim().toLowerCase()) ?? null,
    [cspOptions, cspName],
  );

  // Suggestions for whichever CSP product is selected, if it's in the pending set.
  const suggestions = useMemo<CatalogSuggestion[]>(() => {
    if (!cspName.trim()) return [];
    return (
      pending?.products.find(
        (p) => p.productName.trim().toLowerCase() === cspName.trim().toLowerCase(),
      )?.suggestions ?? []
    );
  }, [pending, cspName]);

  // ── Catalog options: this product's suggestions first, then the rest of the
  //    catalog filtered by whatever has been typed. ──
  const catalogMenu = useMemo<{
    items: CatalogOption[];
    totalMatching: number;
    shown: number;
  }>(() => {
    const suggested = suggestions.map((s) => ({
      id: s.catalogName,
      label: s.catalogName,
      coverage:
        s.versionsCovered > 0
          ? `covers ${s.versionsCovered}/${s.versionsTested} versions`
          : "name match only",
    }));
    const suggestedKeys = new Set(suggested.map((s) => s.id.toLowerCase()));

    const q = catalogQuery.trim().toLowerCase();
    const rest: CatalogOption[] = [];
    let totalMatching = 0;
    for (const n of catalogNames) {
      if (suggestedKeys.has(n.toLowerCase())) continue;
      if (q && !n.toLowerCase().includes(q)) continue;
      totalMatching++;
      if (rest.length < CATALOG_MENU_LIMIT) rest.push({ id: n, label: n, coverage: null });
    }
    return { items: [...suggested, ...rest], totalMatching, shown: rest.length };
  }, [suggestions, catalogNames, catalogQuery]);

  const selectedCatalogOption = useMemo(
    () => catalogMenu.items.find((o) => o.label === catalogName) ?? null,
    [catalogMenu, catalogName],
  );

  const catalogNameValid =
    catalogName.trim() === "" ||
    catalogNames.some((n) => n.toLowerCase() === catalogName.trim().toLowerCase());

  const replacingExisting = mappings.find(
    (m) => m.cspProductName.trim().toLowerCase() === cspName.trim().toLowerCase(),
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lifecycle-mappings", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ cspProductName: cspName, catalogProductName: catalogName }),
      });
      const data = (await res.json()) as { mappings?: Mapping[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setMappings(data.mappings ?? []);
      setCspName("");
      setCatalogName("");
      setCatalogQuery("");
      void loadPending(true); // mapped product should leave the pending list
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (csp: string) => {
    try {
      const res = await fetch(`/api/admin/lifecycle-mappings/${encodeURIComponent(csp)}`, {
        method: "DELETE",
        headers: headers(),
      });
      const data = (await res.json()) as { mappings?: Mapping[] };
      setMappings(data.mappings ?? []);
      void loadPending(true);
    } catch {
      /* ignore */
    }
  };

  const pickCsp = (name: string) => {
    setCspName(name);
    setCatalogName(""); // suggestions change with the product
    setCatalogQuery("");
  };

  const cell = { padding: "0.5rem 0.75rem", verticalAlign: "middle" as const };
  const th = {
    padding: "0.5rem 0.75rem",
    textAlign: "left" as const,
    fontWeight: 600,
    fontSize: "0.6875rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "#525252",
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderTop: "4px solid #0f62fe",
        padding: "1.5rem",
        marginBottom: "1.25rem",
        background: "#fff",
      }}
    >
      <div style={{ marginBottom: "0.875rem" }}>
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#161616",
            marginBottom: "0.25rem",
          }}
        >
          Product Lifecycle Mapping
        </div>
        <div style={{ fontSize: "0.8125rem", color: "#525252", maxWidth: 640 }}>
          Map CSP product names to IBM Product Lifecycle Catalog entries for products the automatic
          matcher cannot resolve. Mappings apply immediately — no restart or re-upload needed. One
          CSP product needs only ONE catalog entry, since all license variants of a product share
          the same End of Support date.
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
            marginBottom: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Add / edit form ── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 250 }}>
          <ComboBox
            id="csp-product-name"
            titleText="CSP Product Name"
            placeholder={
              loadingPending && !pending ? "Loading products…" : "Select an unmapped product"
            }
            items={cspOptions}
            selectedItem={selectedCspOption}
            itemToString={(i: CspOption | null) => i?.label ?? ""}
            itemToElement={(i: CspOption) => (
              <span style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span>{i.label}</span>
                <span style={{ color: "#6f6f6f", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  {i.alreadyMapped ? "mapped" : `${i.clientCount} clients`}
                </span>
              </span>
            )}
            onChange={({ selectedItem }: { selectedItem?: CspOption | null }) => {
              // allowCustomValue hands back a raw string, which Carbon's types
              // don't model — widen it here rather than lose the typed items.
              const picked = selectedItem as CspOption | string | null | undefined;
              if (!picked) return pickCsp("");
              pickCsp(typeof picked === "string" ? picked : picked.label);
            }}
            allowCustomValue
            size="sm"
          />
        </div>

        <div style={{ flex: "1 1 340px", minWidth: 280 }}>
          <ComboBox
            id="catalog-product-name"
            titleText="Catalog Product Name"
            placeholder={
              cspName.trim()
                ? "Pick a suggestion or search the catalog"
                : "Select a CSP product first"
            }
            disabled={!cspName.trim()}
            items={catalogMenu.items}
            helperText={
              !cspName.trim()
                ? undefined
                : catalogMenu.totalMatching > catalogMenu.shown
                  ? `${suggestions.length} suggested · showing ${catalogMenu.shown} of ${catalogMenu.totalMatching.toLocaleString()} other catalog products — type to narrow`
                  : `${suggestions.length} suggested · ${catalogMenu.totalMatching.toLocaleString()} other catalog product${catalogMenu.totalMatching === 1 ? "" : "s"}`
            }
            selectedItem={selectedCatalogOption}
            itemToString={(i: CatalogOption | null) => i?.label ?? ""}
            itemToElement={(i: CatalogOption) => (
              <span style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                <span>{i.label}</span>
                {i.coverage && (
                  <span
                    style={{
                      color: i.coverage.startsWith("covers") ? "#0e6027" : "#8d8d8d",
                      fontSize: "0.6875rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {i.coverage}
                  </span>
                )}
              </span>
            )}
            onChange={({ selectedItem }: { selectedItem?: CatalogOption | null }) => {
              const picked = selectedItem as CatalogOption | string | null | undefined;
              if (!picked) return setCatalogName("");
              setCatalogName(typeof picked === "string" ? picked : picked.label);
            }}
            onInputChange={(text: string) => setCatalogQuery(text ?? "")}
            // The menu is capped for performance, so typing is the way to reach
            // entries beyond the first page — filtering happens in catalogOptions.
            shouldFilterItem={() => true}
            invalid={!catalogNameValid}
            invalidText="Not a product in the uploaded lifecycle catalog"
            allowCustomValue
            size="sm"
          />
        </div>

        <div style={{ paddingTop: "1.5rem" }}>
          <Button
            kind="primary"
            size="sm"
            renderIcon={Add}
            disabled={saving || !cspName.trim() || !catalogName.trim() || !catalogNameValid}
            onClick={() => void save()}
          >
            {replacingExisting ? "Replace Mapping" : "Save Mapping"}
          </Button>
        </div>
      </div>

      {/* Overwriting is silent server-side, so say so before it happens. */}
      {replacingExisting && (
        <div style={{ fontSize: "0.75rem", color: "#8a6d00", marginBottom: "1rem" }}>
          <strong>{replacingExisting.cspProductName}</strong> is already mapped to{" "}
          <strong>{replacingExisting.catalogProductName}</strong> — saving replaces it.
        </div>
      )}
      {!replacingExisting && <div style={{ marginBottom: "1.25rem" }} />}

      {/* ── Saved mappings ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Saved Mappings ({mappings.length})
        </div>
        {mappings.length === 0 ? (
          <div style={{ fontSize: "0.75rem", color: "#6f6f6f", fontStyle: "italic" }}>
            No manual mappings yet — everything resolving today does so automatically.
          </div>
        ) : (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 4, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
                  <th style={th}>CSP Product Name</th>
                  <th style={th}>Catalog Product Name</th>
                  <th style={th}>Updated</th>
                  <th style={{ ...th, width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.cspProductName} style={{ borderBottom: "1px solid #eef0f2" }}>
                    <td style={{ ...cell, fontWeight: 600 }}>{m.cspProductName}</td>
                    <td style={{ ...cell, color: "#525252" }}>{m.catalogProductName}</td>
                    <td style={{ ...cell, color: "#8d8d8d", fontSize: "0.75rem" }}>
                      {new Date(m.updatedAt).toLocaleDateString()} · {m.updatedBy}
                    </td>
                    <td style={cell}>
                      <Button
                        kind="ghost"
                        size="sm"
                        hasIconOnly
                        iconDescription="Edit"
                        renderIcon={EditIcon}
                        onClick={() => {
                          setCspName(m.cspProductName);
                          setCatalogName(m.catalogProductName);
                          setCatalogQuery("");
                        }}
                      />
                      <Button
                        kind="ghost"
                        size="sm"
                        hasIconOnly
                        iconDescription="Delete"
                        renderIcon={TrashCan}
                        onClick={() => void remove(m.cspProductName)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pending products ── */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Pending Products</span>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Renew}
            disabled={loadingPending}
            onClick={() => void loadPending(true)}
          >
            Rescan
          </Button>
          {pending && (
            <>
              <Tag type="red" size="sm">
                {pending.products.length} unmapped
              </Tag>
              <Tag type="green" size="sm">
                {pending.resolvedProducts} resolving automatically
              </Tag>
              <span style={{ fontSize: "0.75rem", color: "#8d8d8d" }}>
                of {pending.totalDistinctProducts} distinct products
              </span>
            </>
          )}
        </div>

        <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
          CSP products failing all three automatic layers, across all onboarded clients. Counts
          exclude IBM customers not in this Control Plane. Suggestions are ranked by how many
          clients each catalog entry would resolve.
        </div>

        {loadingPending && <InlineLoading description="Scanning CSP case data…" status="active" />}

        {pending && !loadingPending && pending.products.length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "#0e6027", fontStyle: "italic" }}>
            Every product with case activity resolves — nothing pending.
          </div>
        )}

        {pending && !loadingPending && pending.products.length > 0 && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 4, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
                  <th style={th}>CSP Product Name</th>
                  <th style={{ ...th, width: 80 }}>Clients</th>
                  <th style={{ ...th, width: 80 }}>Cases</th>
                  <th style={th}>Suggested Catalog Match</th>
                  <th style={{ ...th, width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.products.slice(0, 200).map((p) => (
                  <tr key={p.productName} style={{ borderBottom: "1px solid #eef0f2" }}>
                    <td style={{ ...cell, fontWeight: 600, verticalAlign: "top" }}>
                      {p.productName}
                      <div
                        style={{
                          fontWeight: 400,
                          fontFamily: "monospace",
                          fontSize: "0.6875rem",
                          color: "#8d8d8d",
                          marginTop: "0.2rem",
                        }}
                      >
                        {p.sampleVersions.join(", ") || "—"}
                      </div>
                    </td>
                    <td style={{ ...cell, color: "#525252", verticalAlign: "top" }}>
                      {p.clientCount}
                    </td>
                    <td style={{ ...cell, color: "#525252", verticalAlign: "top" }}>
                      {p.caseCount.toLocaleString()}
                    </td>
                    <td style={{ ...cell, verticalAlign: "top" }}>
                      {p.suggestions.length === 0 ? (
                        <span
                          style={{ fontSize: "0.75rem", color: "#8d8d8d", fontStyle: "italic" }}
                        >
                          No candidate found — search the catalog manually
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          {p.suggestions.map((s) => {
                            const strong = s.versionsCovered > 0;
                            return (
                              <button
                                key={s.catalogName}
                                type="button"
                                title={`Catalog versions: ${s.sampleVrms.join(", ") || "—"}`}
                                onClick={() => {
                                  setCspName(p.productName);
                                  setCatalogName(s.catalogName);
                                  setCatalogQuery("");
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                style={{
                                  textAlign: "left",
                                  cursor: "pointer",
                                  border: `1px solid ${strong ? "#24a148" : "#e0e0e0"}`,
                                  background: strong ? "#defbe6" : "#f4f4f4",
                                  borderRadius: 4,
                                  padding: "0.25rem 0.5rem",
                                  fontSize: "0.75rem",
                                  color: "#161616",
                                  font: "inherit",
                                  fontFamily: "inherit",
                                }}
                              >
                                {s.catalogName}
                                <span
                                  style={{
                                    marginLeft: "0.4rem",
                                    color: strong ? "#0e6027" : "#8d8d8d",
                                    fontSize: "0.6875rem",
                                  }}
                                >
                                  {strong
                                    ? `covers ${s.versionsCovered}/${s.versionsTested} versions${s.hasDates ? "" : " · no dates"}`
                                    : "name match only"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, verticalAlign: "top" }}>
                      <Button kind="ghost" size="sm" onClick={() => pickCsp(p.productName)}>
                        Map
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.products.length > 200 && (
              <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#8d8d8d" }}>
                Showing the top 200 of {pending.products.length} unmapped products.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
