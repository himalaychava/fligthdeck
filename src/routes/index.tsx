import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { isAuthenticated, authReady } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authReady) return;
    if (isAuthenticated) {
      navigate({ to: "/home" as any });
    } else {
      navigate({ to: "/login" });
    }
  }, [authReady, isAuthenticated, navigate]);
  return null;
}
