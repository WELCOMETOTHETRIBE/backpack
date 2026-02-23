"use client";

import { useState, useEffect, useRef } from "react";

type MermaidModule = typeof import("mermaid");

export function BoundaryDiagram() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/boundary/diagram");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMessage(data.error ?? "Failed to load diagram");
          setStatus("error");
          return;
        }
        const mermaidSource = data.mermaidSource as string | undefined;
        if (!mermaidSource || cancelled) return;

        const mermaid = (await import("mermaid")) as MermaidModule;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
        });

        const id = `mermaid-boundary-${Date.now()}`;
        const div = document.createElement("div");
        div.id = id;
        div.className = "mermaid";
        div.textContent = mermaidSource;

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(div);
          await mermaid.run({
            nodes: [div],
            suppressErrors: false,
          });
          if (!cancelled) setStatus("success");
        }
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : "Failed to render diagram");
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div
        className="min-h-[200px] rounded-lg border border-gray-200 bg-gray-100 animate-pulse"
        aria-busy="true"
        aria-label="Loading boundary diagram"
      />
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-[200px] rounded-lg border border-gray-200 bg-white p-4 [&_svg]:max-w-full"
      aria-label="CUI boundary diagram"
    />
  );
}
