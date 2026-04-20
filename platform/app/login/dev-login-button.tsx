"use client";

import { useState } from "react";
import { Button } from "@heroui/button";

export function DevLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      if (!res.ok) {
        setError("Dev login failed. Check server logs.");
        setLoading(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") ?? "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        color="secondary"
        variant="flat"
        size="lg"
        className="w-full font-semibold"
        isDisabled={loading}
        onPress={handleClick}
      >
        {loading ? "Signing in..." : "Dev one-click login"}
      </Button>
      {error ? (
        <p className="text-sm text-danger text-center">{error}</p>
      ) : null}
    </div>
  );
}
