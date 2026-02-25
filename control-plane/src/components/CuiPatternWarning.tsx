"use client";

import { useState, useCallback } from "react";

const CUI_PATTERNS = [
  /\bCUI\b/i,
  /\bControlled Unclassified\b/i,
  /\bFOUO\b/i,
  /\d{3}-\d{2}-\d{4}/,
];

export default function CuiPatternWarning() {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");

  const checkPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const hasMatch = CUI_PATTERNS.some((p) => p.test(pasted));
    if (hasMatch) setShow(true);
  }, []);

  return (
    <div>
      {show && (
        <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          This system must not contain CUI. Please remove sensitive content.
        </div>
      )}
    </div>
  );
}

export function useCuiWarning() {
  const [warning, setWarning] = useState(false);
  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (CUI_PATTERNS.some((p) => p.test(pasted))) setWarning(true);
  }, []);
  return { warning, setWarning, onPaste };
}
