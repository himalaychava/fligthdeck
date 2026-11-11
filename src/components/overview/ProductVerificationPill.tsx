/**
 * Verification badge, Edit-and-Verify dialog, and add/remove controls for the
 * Active Product Integration boxes.
 *
 * Shown only on Clarizen-sourced products — a sample client's hand-maintained
 * portfolio has no verification concept and is left alone.
 *
 * Whether the current user may act arrives from the SERVER as `canVerify`; the
 * rule is expected to tighten to assigned delivery consultants later, so it is
 * deliberately not re-derived here.
 */
import { useState, useEffect } from "react";
import { Button, Modal, TextInput, ComboBox, Tag } from "@carbon/react";
import { CheckmarkFilled, Time, Add, TrashCan, Undo } from "@carbon/icons-react";

export type VerificationStatus = "pending" | "verified";

/** One recorded Product Adoption checkpoint. */
export interface AdoptionPoint {
  date: string;
  value: number;
  notes?: string;
  recordedBy?: string;
}

export interface EcProductBox {
  /** Stable identity — the UTL30 code, or a synthetic one for a manual product. */
  code: string;
  productName: string;
  /** The catalog's own name, so a correction can be shown against it. */
  sourceName: string;
  unresolved: boolean;
  manual: boolean;
  status: VerificationStatus;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  canVerify: boolean;
  productId: string;
  adoptionHistory: AdoptionPoint[];
}

export interface RemovedProduct {
  code: string;
  productName: string;
  manual: boolean;
}

export type ProductAction = "verify" | "unverify" | "add" | "remove" | "restore";

/** Pill colours, matching the contract status pills already used in the app. */
const PILL = {
  pending: { label: "Pending Review", fg: "#8a6d00", bg: "#fef7dc" },
  verified: { label: "Verified", fg: "#0e6027", bg: "#defbe6" },
} as const;

export function formatVerifiedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ProductVerificationPill({ status }: { status: VerificationStatus }) {
  const p = PILL[status];
  const Icon = status === "verified" ? CheckmarkFilled : Time;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: p.fg,
        background: p.bg,
        borderRadius: 12,
        padding: "0.1rem 0.5rem",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={14} />
      {p.label}
    </span>
  );
}

/** Stops a click inside a ClickableTile from also opening the detail modal. */
const swallow = (e: React.MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

/**
 * Per-box controls: Edit and Verify, plus Remove.
 *
 * These live inside a ClickableTile, so every click is stopped from bubbling —
 * otherwise acting on a box would also open the product detail modal.
 */
export function ProductBoxActions({
  box,
  busy,
  onEdit,
  onRemove,
  onUnverify,
}: {
  box: EcProductBox;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUnverify: () => void;
}) {
  if (!box.canVerify) return null;
  const verified = box.status === "verified";
  return (
    <div
      onClick={swallow}
      style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.5rem" }}
    >
      <Button
        kind={verified ? "ghost" : "tertiary"}
        size="sm"
        disabled={busy}
        onClick={(e) => {
          swallow(e);
          onEdit();
        }}
      >
        {busy ? "Saving…" : verified ? "Edit" : "Edit and Verify"}
      </Button>
      {verified && (
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          iconDescription="Mark as pending review"
          renderIcon={Undo}
          disabled={busy}
          onClick={(e) => {
            swallow(e);
            onUnverify();
          }}
        />
      )}
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        iconDescription="Remove — not a product for this customer"
        renderIcon={TrashCan}
        disabled={busy}
        onClick={(e) => {
          swallow(e);
          onRemove();
        }}
      />
    </div>
  );
}

/**
 * Edit-and-Verify dialog.
 *
 * Confirming the name IS the verification, so there is one action rather than
 * an edit followed by a separate verify.
 */
export function EditAndVerifyModal({
  box,
  open,
  saving,
  onClose,
  onSave,
}: {
  box: EcProductBox | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (code: string, productName: string) => void;
}) {
  const [name, setName] = useState("");

  // Reset to the product's current name each time the dialog opens, so a
  // previous edit never leaks into the next product.
  useEffect(() => {
    if (open && box) setName(box.productName);
  }, [open, box]);

  if (!box) return null;
  const corrected = box.productName !== box.sourceName;

  return (
    <Modal
      open={open}
      modalHeading="Confirm product"
      modalLabel={`Active Product Integration — ${box.sourceName}`}
      primaryButtonText={saving ? "Saving…" : "Save and verify"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={saving}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => onSave(box.code, name)}
      size="sm"
    >
      <div style={{ display: "grid", gap: "1rem", paddingBottom: "1rem" }}>
        <TextInput
          id={`product-name-${box.code}`}
          labelText="Product name"
          helperText="Confirm this is the correct product for this customer. Correct the name if it is wrong — the correction is kept for this account."
          value={name}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
        />

        {box.unresolved && (
          <p
            style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #525252)", margin: 0 }}
          >
            This product came through as code <strong>{box.code}</strong> with no catalog name.
            Giving it a proper name here is how it gets one.
          </p>
        )}

        {corrected && !box.unresolved && (
          <p
            style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #525252)", margin: 0 }}
          >
            Catalog name: <strong>{box.sourceName}</strong>
          </p>
        )}

        {!box.manual && (
          <p
            style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #525252)", margin: 0 }}
          >
            Identified from Clarizen product code <strong>{box.code}</strong>. Renaming changes only
            what is displayed — recorded scores stay with the product.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Dialog for adding a product that never appeared automatically. */
export function AddProductModal({
  open,
  saving,
  products,
  onClose,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  /** CSP product names to choose from. */
  products: string[];
  onClose: () => void;
  onSave: (productName: string) => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setQuery("");
    }
  }, [open]);

  // Carbon's ComboBox has no virtualisation — every item is a real DOM node
  // rebuilt per keystroke — so the menu is capped and narrowed by typing.
  const MENU_LIMIT = 200;
  const q = query.trim().toLowerCase();
  const matched = q ? products.filter((p) => p.toLowerCase().includes(q)) : products;
  const items = matched.slice(0, MENU_LIMIT);

  return (
    <Modal
      open={open}
      modalHeading="Add product"
      modalLabel="Active Product Integration"
      primaryButtonText={saving ? "Adding…" : "Add product"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={saving || !name.trim()}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => onSave(name)}
      size="sm"
    >
      <div style={{ display: "grid", gap: "0.75rem", paddingBottom: "1rem" }}>
        <p style={{ fontSize: "0.875rem", margin: 0 }}>
          Add a product this customer has that did not come through automatically.
        </p>
        <ComboBox
          id="add-product-combo"
          titleText="Product"
          placeholder="Search products…"
          items={items}
          selectedItem={name || null}
          itemToString={(i: string | null) => i ?? ""}
          onInputChange={(t: string) => setQuery(t ?? "")}
          shouldFilterItem={() => true}
          onChange={({ selectedItem }: { selectedItem?: string | null }) =>
            setName(selectedItem ?? "")
          }
          helperText={
            matched.length > items.length
              ? `Showing ${items.length} of ${matched.length.toLocaleString()} — type to narrow`
              : "From the CSP product list"
          }
        />
      </div>
    </Modal>
  );
}

/**
 * Confirmation before removing a product.
 *
 * Carbon's danger modal. The heading names the product so there is no doubt
 * which box was clicked; the one line of body says the change is reversible.
 * Nothing else — a consultant removing a wrong product does not need the
 * storage mechanics explained to them.
 */
export function ConfirmRemoveModal({
  box,
  open,
  saving,
  onClose,
  onConfirm,
}: {
  box: EcProductBox | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: (code: string) => void;
}) {
  if (!box) return null;
  return (
    <Modal
      open={open}
      danger
      modalHeading={`Remove ${box.productName}?`}
      modalLabel="Active Product Integration"
      primaryButtonText={saving ? "Removing…" : "Remove product"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={saving}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => onConfirm(box.code)}
      size="sm"
    >
      <p style={{ margin: 0, paddingBottom: "1rem", fontSize: "0.875rem" }}>
        This product will no longer show for this customer. You can restore it from the list below
        the product boxes.
      </p>
    </Modal>
  );
}

/** Tile that opens the add-product dialog, sitting at the end of the grid. */
export function AddProductTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4rem",
        background: "transparent",
        border: "1px dashed var(--cds-border-strong-01, #8d8d8d)",
        cursor: "pointer",
        color: "var(--cds-text-secondary, #525252)",
        font: "inherit",
        padding: "1rem",
      }}
    >
      <Add size={20} />
      <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Add product</span>
      <span style={{ fontSize: "0.75rem", textAlign: "center" }}>
        For a product that did not appear automatically
      </span>
    </button>
  );
}

/** Strip listing removed products, each restorable. */
export function RemovedProductsBar({
  removed,
  busy,
  onRestore,
}: {
  removed: RemovedProduct[];
  busy: string | null;
  onRestore: (code: string) => void;
}) {
  if (removed.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.4rem",
        marginTop: "0.75rem",
        fontSize: "0.75rem",
        color: "var(--cds-text-secondary, #525252)",
      }}
    >
      <span>
        {removed.length} removed {removed.length === 1 ? "product" : "products"}:
      </span>
      {removed.map((r) => (
        <Tag
          key={r.code}
          type="cool-gray"
          size="sm"
          filter
          disabled={busy === r.code}
          onClose={() => onRestore(r.code)}
          title="Restore this product"
        >
          {r.productName}
        </Tag>
      ))}
      <span style={{ fontStyle: "italic" }}>— click the × on a name to restore it</span>
    </div>
  );
}
