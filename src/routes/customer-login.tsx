import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, TextInput, InlineNotification } from "@carbon/react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { MOCK_CLIENTS } from "@/data/clients";

export const Route = createFileRoute("/customer-login")({ component: CustomerLoginPage });

function CustomerLoginPage() {
  const { login } = useAuth();
  const { setViewMode } = useViewMode();
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="cp-login-shell">
      <div className="cp-login-card">
        <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "2rem" }}>IBM</div>
        <div className="cp-login-brand">Customer Portal Access</div>
        <div className="cp-login-sub">View your account health, satisfaction and initiatives</div>
        <TextInput
          id="company"
          labelText="Company name"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <TextInput
          id="cust-email"
          labelText="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginTop: "1rem" }}
        />
        <Button
          style={{ marginTop: "1.5rem", width: "100%" }}
          onClick={async () => {
            await login(email || "guest@customer.com", "customer");
            setViewMode("external");
            navigate({ to: `/client/${MOCK_CLIENTS[0].clientId}/external` as any });
          }}
        >
          Access My Dashboard
        </Button>
        <InlineNotification
          kind="info"
          title="Customer portal — stub"
          subtitle="TODO: Replace with Customer Portal OIDC/Auth0 integration"
          hideCloseButton
          lowContrast
          style={{ marginTop: "1.5rem" }}
        />
      </div>
    </div>
  );
}