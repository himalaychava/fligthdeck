import { Modal, TextArea, InlineNotification, Tag, NumberInput } from "@carbon/react";
import { useState, useEffect, useCallback } from "react";
import { kpiValueToPercent, type KPIDefinition } from "@/data/kpiLibrary";
import type { Client } from "@/data/clients";
import { addKPIHistory } from "@/services/clientService";
import { useAuth } from "@/contexts/AuthContext";
import { KPIScoringGuidance } from "./KPIScoringGuidance";

function quarterLabel(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(10, v));
}

/** Parse a user-typed string into a valid 0–10 number or null. */
function parseScore(raw: string): number | null {
  if (raw === "" || raw === null) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n * 10) / 10);
}

interface KPIScoreEntryProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  kpi: KPIDefinition;
  onUpdate?: () => void;
}

export function KPIScoreEntry({ open, onClose, client, kpi, onUpdate }: KPIScoreEntryProps) {
  const { user } = useAuth();
  const [inputRaw, setInputRaw] = useState<string>("");
  const [selectedBand, setSelectedBand] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInputRaw("");
      setSelectedBand(undefined);
      setNotes("");
      setSaving(false);
      setSaved(false);
      setError(null);
    }
  }, [open]);

  const lastEntry = useCallback(() => {
    const cfg = (client.kpiConfig ?? []).find((c) => c.kpiId === kpi.kpiId);
    if (!cfg || !cfg.history.length) return null;
    const sorted = [...cfg.history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return sorted[sorted.length - 1];
  }, [client, kpi.kpiId]);

  const parsedScore = parseScore(inputRaw);
  const pctPreview = parsedScore !== null ? kpiValueToPercent(parsedScore) : null;

  const handleBandSelect = (midpoint: number) => {
    setInputRaw(String(midpoint));
    // Detect which band was selected
    const band = kpi.scoringGuidance?.bands.find((b) => {
      const [lo, hi] = b.range.split("-").map(Number);
      return midpoint >= lo && midpoint <= hi;
    });
    setSelectedBand(band?.range);
  };

  const handleInputChange = (raw: string) => {
    setInputRaw(raw);
    // Auto-detect which band the typed value falls into
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 10) {
      const band = kpi.scoringGuidance?.bands.find((b) => {
        const [lo, hi] = b.range.split("-").map(Number);
        return n >= lo && n <= hi;
      });
      setSelectedBand(band?.range);
    } else {
      setSelectedBand(undefined);
    }
  };

  const notesEmpty = notes.trim() === "";
  // Show the notes warning as soon as a score is entered but notes is still empty
  const showNotesWarning = parsedScore !== null && notesEmpty;

  const handleSubmit = async () => {
    if (parsedScore === null) {
      setError("Please enter a score between 0 and 10.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addKPIHistory(
        client.clientId,
        [{ kpiId: kpi.kpiId, value: parsedScore, notes: notes || undefined, date: new Date().toISOString().split("T")[0] }],
        client.kpiConfig,
        user?.name ?? "",
        user?.email ?? ""
      );
      setSaved(true);
      onUpdate?.();
      setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save checkpoint.");
    } finally {
      setSaving(false);
    }
  };

  const last = lastEntry();

  return (
    <Modal
      open={open}
      modalHeading={kpi.label}
      modalLabel={`${quarterLabel()} Checkpoint — ${client.clientName}`}
      primaryButtonText={saving ? "Saving…" : "Save Checkpoint"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={saving || saved || parsedScore === null || notesEmpty}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      size="md"
    >
      {/* KPI description */}
      <p style={{ color: "var(--cds-text-secondary)", marginTop: 0, marginBottom: "1rem", fontSize: "0.875rem" }}>
        {kpi.description}
      </p>

      {/* Scoring guidance bands */}
      {kpi.scoringGuidance && (
        <KPIScoringGuidance
          guidance={kpi.scoringGuidance}
          selectedRange={selectedBand}
          onBandSelect={handleBandSelect}
        />
      )}

      {!kpi.scoringGuidance && (
        <div
          style={{
            background: "var(--cds-layer-02)",
            border: "1px solid var(--cds-border-subtle)",
            borderRadius: "4px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.8125rem",
            color: "var(--cds-text-secondary)",
          }}
        >
          ℹ️ Detailed scoring guidance for this KPI will be added in a future update.
        </div>
      )}

      {/* Score input row */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ width: "120px" }}>
          <NumberInput
            id={`kpi-score-input-${kpi.kpiId}`}
            label="Score (0 – 10)"
            min={0}
            max={10}
            step={0.1}
            value={inputRaw}
            onChange={(_e, { value }) => handleInputChange(typeof value === "number" ? String(value) : (value ?? ""))}
            placeholder="e.g. 7.2"
          />
        </div>
        {last !== null && (
          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.4rem", marginBottom: 0 }}>
            Last recorded: <strong>{kpi.kpiId === 'csat' ? `${last.value}/10` : `${Math.round(last.value * 10)}/100`}</strong>
            {last.date ? ` on ${last.date}` : ""}
          </p>
        )}
      </div>

      {/* Notes — mandatory */}
      <TextArea
        id={`kpi-notes-${kpi.kpiId}`}
        labelText="Notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add context or observations…"
        style={{ marginBottom: "0.25rem" }}
      />

      {/* Inline notes warning — shown as soon as score is set but notes is empty */}
      {showNotesWarning && (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "#da1e28", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ color: "#da1e28", fontWeight: 700 }}>⚠</span>
          <span>Please fill in the Notes before saving this checkpoint.</span>
        </p>
      )}

      {/* Feedback */}
      {saved && (
        <InlineNotification
          kind="success"
          title="Checkpoint saved"
          subtitle={`${kpi.label}: ${pctPreview ?? ""}`}
          hideCloseButton
          style={{ marginTop: "0.75rem" }}
        />
      )}
      {error && (
        <InlineNotification
          kind="error"
          title="Save failed"
          subtitle={error}
          hideCloseButton
          style={{ marginTop: "0.75rem" }}
        />
      )}
    </Modal>
  );
}