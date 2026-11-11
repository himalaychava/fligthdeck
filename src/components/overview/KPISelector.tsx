import {
  Modal,
  Checkbox,
  Tag,
  InlineNotification,
  Accordion,
  AccordionItem,
} from "@carbon/react";
import { View, ViewOff, Locked } from "@carbon/icons-react";
import { useState, useEffect, useMemo } from "react";
import type { Client } from "@/data/clients";
import { updateClientKPIs } from "@/services/clientService";
import { useAuth } from "@/contexts/AuthContext";
import {
  getKpiCatalogForTier,
  getMandatoryKpiIds,
  getRotationalKpiIds,
  getHigherTierKpis,
} from "@/lib/kpiTierRules";

export function KPISelector({
  open,
  onClose,
  client,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  client: Client;
  onUpdate?: () => void;
}) {
  const { user } = useAuth();
  const mandatoryIds = useMemo(() => getMandatoryKpiIds(client.tier), [client.tier]);
  const rotationalIds = useMemo(() => getRotationalKpiIds(client.tier), [client.tier]);
  const catalog = useMemo(() => getKpiCatalogForTier(client.tier), [client.tier]);
  const higherTierKpis = useMemo(() => getHigherTierKpis(client.tier), [client.tier]);

  const [selectedRotational, setSelectedRotational] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const active = new Set((client.kpiConfig ?? []).map((c) => c.kpiId));
    setSelectedRotational(rotationalIds.filter((id) => active.has(id)));
    setSaved(false);
  }, [open, client, rotationalIds]);

  const toggleRotational = (id: string) => {
    setSelectedRotational((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalSelected = mandatoryIds.length + selectedRotational.length;

  if (client.tier === "Free") {
    return (
      <Modal open={open} modalHeading="Configure KPIs" onRequestClose={onClose} passiveModal>
        <InlineNotification
          kind="info"
          title="No KPIs for Free tier"
          subtitle="This client tier does not include KPI tracking."
          hideCloseButton
          lowContrast
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      modalHeading={`Configure KPIs for ${client.clientName}`}
      modalLabel={`${totalSelected} KPI${totalSelected === 1 ? "" : "s"} active (${mandatoryIds.length} mandatory)`}
      primaryButtonText="Save Configuration"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={async () => {
        try {
          await updateClientKPIs(
            client.clientId,
            selectedRotational,
            client.kpiConfig,
            client.tier,
            user?.name ?? "",
            user?.email ?? ""
          );
          setSaved(true);
          onUpdate?.();
          setTimeout(onClose, 800);
        } catch (e) {
          console.error(e);
        }
      }}
      size="lg"
    >
      <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)" }}>
        Mandatory KPIs for {client.tier} tier are always tracked on the overview. Select
        additional rotational KPIs to include. Only Delivery (TAM) can change this list.
      </p>
      {saved && (
        <InlineNotification
          kind="success"
          title="Saved"
          subtitle="KPI selection updated"
          hideCloseButton
        />
      )}
      
      {/* Available KPIs Section */}
      <h6 style={{ margin: "1rem 0 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
        Available KPIs
      </h6>
      <div className="cp-kpi-selector-list">
        {catalog.map((k) => {
          const isMandatory = k.availability === "required";
          const checked = isMandatory || selectedRotational.includes(k.kpiId);
          return (
            <div
              key={k.kpiId}
              className="cp-kpi-selector-item"
              style={{ borderBottom: "1px solid var(--cds-border-subtle)" }}
            >
              <Checkbox
                id={`kpi-${k.kpiId}`}
                labelText={k.label}
                checked={checked}
                disabled={isMandatory}
                onChange={() => {
                  if (!isMandatory) toggleRotational(k.kpiId);
                }}
              />
              <div style={{ marginLeft: "1.75rem", marginTop: "-0.25rem" }}>
                <p
                  style={{
                    margin: "0 0 0.35rem",
                    color: "var(--cds-text-secondary)",
                    fontSize: "0.875rem",
                  }}
                >
                  {k.description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  <Tag type={isMandatory ? "blue" : "purple"} size="sm">
                    {isMandatory ? "Mandatory" : "Rotational"}
                  </Tag>
                  <Tag type="cool-gray" size="sm">
                    {k.dataSource}
                  </Tag>
                  <Tag
                    type={k.externalVisible ? "green" : "gray"}
                    size="sm"
                    renderIcon={k.externalVisible ? View : ViewOff}
                  >
                    {k.externalVisible ? "Customer visible" : "Internal only"}
                  </Tag>
                  <Tag type="outline" size="sm">
                    {k.tierLock}
                  </Tag>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Locked Higher Tier KPIs */}
      {(higherTierKpis.silver.length > 0 || higherTierKpis.gold.length > 0) && (
        <div style={{ marginTop: "1.5rem" }}>
          <Accordion>
            {higherTierKpis.silver.length > 0 && (
              <AccordionItem title={`Silver Tier Features (${higherTierKpis.silver.length} KPIs)`}>
                <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                  Upgrade to Silver tier to unlock these advanced KPI features.
                </p>
                <div className="cp-kpi-selector-list">
                  {higherTierKpis.silver.map((k) => (
                    <div
                      key={k.kpiId}
                      className="cp-kpi-selector-item"
                      style={{
                        borderBottom: "1px solid var(--cds-border-subtle)",
                        opacity: 0.7,
                        cursor: "not-allowed"
                      }}
                    >
                      <Checkbox
                        id={`locked-silver-${k.kpiId}`}
                        labelText={
                          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {k.label}
                            <Locked size={16} />
                          </span>
                        }
                        checked={false}
                        disabled={true}
                      />
                      <div style={{ marginLeft: "1.75rem", marginTop: "-0.25rem" }}>
                        <p
                          style={{
                            margin: "0 0 0.35rem",
                            color: "var(--cds-text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {k.description}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          <Tag type="red" size="sm" renderIcon={Locked}>
                            Upgrade to Silver
                          </Tag>
                          <Tag type="cool-gray" size="sm">
                            {k.dataSource}
                          </Tag>
                          <Tag
                            type={k.externalVisible ? "green" : "gray"}
                            size="sm"
                            renderIcon={k.externalVisible ? View : ViewOff}
                          >
                            {k.externalVisible ? "Customer visible" : "Internal only"}
                          </Tag>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionItem>
            )}
            
            {higherTierKpis.gold.length > 0 && (
              <AccordionItem title={`Gold Tier Features (${higherTierKpis.gold.length} KPIs)`}>
                <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                  Upgrade to Gold tier to unlock these premium KPI features.
                </p>
                <div className="cp-kpi-selector-list">
                  {higherTierKpis.gold.map((k) => (
                    <div
                      key={k.kpiId}
                      className="cp-kpi-selector-item"
                      style={{
                        borderBottom: "1px solid var(--cds-border-subtle)",
                        opacity: 0.7,
                        cursor: "not-allowed"
                      }}
                    >
                      <Checkbox
                        id={`locked-gold-${k.kpiId}`}
                        labelText={
                          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {k.label}
                            <Locked size={16} />
                          </span>
                        }
                        checked={false}
                        disabled={true}
                      />
                      <div style={{ marginLeft: "1.75rem", marginTop: "-0.25rem" }}>
                        <p
                          style={{
                            margin: "0 0 0.35rem",
                            color: "var(--cds-text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {k.description}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          <Tag type="red" size="sm" renderIcon={Locked}>
                            Upgrade to Gold
                          </Tag>
                          <Tag type="cool-gray" size="sm">
                            {k.dataSource}
                          </Tag>
                          <Tag
                            type={k.externalVisible ? "green" : "gray"}
                            size="sm"
                            renderIcon={k.externalVisible ? View : ViewOff}
                          >
                            {k.externalVisible ? "Customer visible" : "Internal only"}
                          </Tag>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      )}
    </Modal>
  );
}
