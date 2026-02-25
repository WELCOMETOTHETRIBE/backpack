"use client";

import { useState } from "react";

export default function ClosureSignOffButton({ poamItemId }: { poamItemId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignOff() {
    if (!confirm("Record your sign-off for POA&M closure? (Dual sign-off required.)")) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/poam/${poamItemId}/closure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataHash: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Failed");
        return;
      }
      setMessage(data.closed ? "Closed." : "Sign-off recorded. One more approver needed.");
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSignOff}
        disabled={loading}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Sign off (closure)"}
      </button>
      {message && <p className="mt-2 text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
