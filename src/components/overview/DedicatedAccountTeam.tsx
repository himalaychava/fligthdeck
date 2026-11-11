import { useState } from "react";
import type { Client } from "@/data/clients";
import { Tile, Button } from "@carbon/react";
import { UserAvatar, Email, Phone } from "@carbon/icons-react";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { LIVE_NO_DATA } from "@/demo-integration/productIntegrationDisplay";

interface TeamMember {
  name: string;
  role: string;
  assignment: string;
  email: string;
  phone: string;
}

const getMockTeamMembers = (client: Client): TeamMember[] => {
  const members: TeamMember[] = [
    {
      name: "Sarah Jenkins",
      role: "Project Manager",
      assignment: "Account Level",
      email: "sjenkins@ibm.com",
      phone: "+1 (555) 019-2834",
    },
    {
      name: "Michael Chang",
      role: "Primary TAM",
      assignment: "Account Level",
      email: "mchang@ibm.com",
      phone: "+1 (555) 014-9821",
    },
  ];

  const consultantPool = [
    { name: "David Miller", email: "dmiller@ibm.com", phone: "+1 (555) 017-8822" },
    { name: "Elena Rostova", email: "erostova@ibm.com", phone: "+1 (555) 012-3344" },
    { name: "Marcus Johnson", email: "mjohnson@ibm.com", phone: "+1 (555) 015-7799" },
    { name: "Sophia Martinez", email: "smartinez@ibm.com", phone: "+1 (555) 018-4455" },
  ];

  client.productPortfolio.forEach((prod, index) => {
    const consultant = consultantPool[index % consultantPool.length];
    members.push({
      name: consultant.name,
      role: "Delivery Consultant",
      assignment: prod.productName,
      email: consultant.email,
      phone: consultant.phone,
    });

    if (index === 0 && client.productPortfolio.length > 1) {
      const backupConsultant = consultantPool[(index + 2) % consultantPool.length];
      members.push({
        name: backupConsultant.name,
        role: "Backup Consultant",
        assignment: prod.productName,
        email: backupConsultant.email,
        phone: backupConsultant.phone,
      });
    }
  });

  return members;
};

export function DedicatedAccountTeam({ client }: { client: Client }) {
  const { isDemoLive } = useDemoData();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const team = isDemoLive ? (client.accountTeam ?? []) : getMockTeamMembers(client);

  return (
    <section className="cp-section" style={{ marginTop: "2.5rem" }}>
      <h2
        className="cp-section-title"
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--cds-text-secondary)",
          marginBottom: "1rem",
        }}
      >
        Dedicated Account Team
      </h2>
      {team.length === 0 ? (
        <Tile style={{ background: "var(--cds-layer-02)", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          {isDemoLive ? LIVE_NO_DATA : "No team members assigned."}
        </Tile>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {team.map((member, idx) => {
            const isHovered = hoveredIndex === idx;

            return (
              <Tile
                key={`${member.name}-${member.assignment}-${idx}`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  background: isHovered ? "var(--cds-layer-01-hover, #e5e5e5)" : "var(--cds-layer-01)",
                  border: "1px solid var(--cds-border-subtle)",
                  borderRadius: "2px",
                  borderColor: isHovered
                    ? "var(--cds-border-interactive, #0f62fe)"
                    : "var(--cds-border-subtle)",
                  transition: "all 0.15s ease",
                  boxShadow: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: isHovered
                        ? "var(--cds-layer-active, #c6c6c6)"
                        : "var(--cds-layer-02, #f4f4f4)",
                      color: "var(--cds-link-01, #0f62fe)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <UserAvatar size={20} />
                  </div>

                  <div style={{ marginLeft: "1rem" }}>
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 500,
                        color: "var(--cds-text-primary)",
                        fontFamily: "var(--cds-body-short-01-font-family, inherit)",
                      }}
                    >
                      {member.name}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginTop: "0.15rem" }}>
                      <span style={{ color: "var(--cds-link-01, #0f62fe)", fontWeight: 400 }}>
                        {member.role}
                      </span>
                      {" • "}
                      <span>{member.assignment}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                  <Button
                    kind="ghost"
                    hasIconOnly
                    renderIcon={Email}
                    iconDescription={`Email ${member.name}`}
                    tooltipPosition="left"
                    size="md"
                    style={{ color: "var(--cds-text-secondary)" }}
                    onClick={() => window.open(`mailto:${member.email}`, "_self")}
                  />
                  <Button
                    kind="ghost"
                    hasIconOnly
                    renderIcon={Phone}
                    iconDescription={`Call ${member.name}`}
                    tooltipPosition="left"
                    size="md"
                    style={{ color: "var(--cds-text-secondary)" }}
                    onClick={() => window.open(`tel:${member.phone}`, "_self")}
                  />
                </div>
              </Tile>
            );
          })}
        </div>
      )}
    </section>
  );
}
