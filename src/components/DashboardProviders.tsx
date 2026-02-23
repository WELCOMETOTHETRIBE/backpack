"use client";

import { Toaster } from "react-hot-toast";
import { CommandPalette } from "./CommandPalette";

export function DashboardProviders({ user }: { user: { role?: string } | null | undefined }) {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "0.5rem" },
        }}
      />
      <CommandPalette user={user} />
    </>
  );
}
