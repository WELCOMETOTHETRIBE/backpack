/**
 * Governance Document Matrix: required for Gov Pure, Gov Hybrid, Tech/Hybrid,
 * with MACTech document path, Missing indicator, and Controls Mapped.
 * Single source of truth: docs/Governance_Document_Matrix.csv
 * Run `npm run sync-matrix` after editing the CSV to regenerate governance-matrix-data.json.
 */

import matrixData from "./governance-matrix-data.json";

export type GovernanceDocumentMatrixRow = {
  /** Governance document / artifact label (row label). */
  document: string;
  /** Required for 18 pure governance controls. */
  govPure: boolean;
  /** Required when adjudicating hybrid governance controls (policy + technical). */
  govHybrid: boolean;
  /** Required to close PARTIAL (Tech/Hybrid) controls—OS evidence + this doc. */
  techHybrid: boolean;
  /** MACTech repo path (relative to repo root); empty = no artifact. */
  mactechDocument: string;
  /** True if no MACTech artifact exists (empty path or "MISSING"). */
  missing: boolean;
  /** Control IDs (e.g. 3.1.1, 3.1.2) that this document satisfies. From CSV "Controls Mapped" column. */
  controlsMapped: string[];
};

type MatrixDataRow = (typeof matrixData.rows)[number];

/** Matrix rows from CSV (single source of truth). */
export const GOVERNANCE_DOCUMENT_MATRIX: GovernanceDocumentMatrixRow[] = (matrixData.rows as MatrixDataRow[]).map(
  (r) => ({
    document: r.document,
    govPure: r.govPure,
    govHybrid: r.govHybrid,
    techHybrid: r.techHybrid,
    mactechDocument: r.mactechDocument ?? "",
    missing: r.missing ?? false,
    controlsMapped: Array.isArray(r.controlsMapped) ? r.controlsMapped : [],
  })
);

/** Mapping from artifact label to MACTech path. From CSV. */
export const MACTECH_MAPPING: Record<string, string> = Object.fromEntries(
  GOVERNANCE_DOCUMENT_MATRIX.map((r) => [r.document, r.mactechDocument]).filter(([, path]) => path)
);

/** Reverse map: MACTech basename (with or without extension) → artifact label. For Codex bundle filename parsing. */
export const CODEX_BASENAME_TO_ARTIFACT_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [label, docPath] of Object.entries(MACTECH_MAPPING)) {
    if (!docPath) continue;
    const basename = docPath.split("/").pop() ?? docPath;
    out[basename.toLowerCase()] = label;
    const withoutExt = basename.replace(/\.[^.]+$/, "").toLowerCase();
    out[withoutExt] = label;
  }
  return out;
})();

/** Get artifact label from Codex/MACTech filename (basename only). Case-insensitive, with or without extension. */
export function getArtifactLabelFromCodexFilename(basename: string): string | undefined {
  const normalized = basename.replace(/^.*[/\\]/, "").toLowerCase();
  return CODEX_BASENAME_TO_ARTIFACT_LABEL[normalized] ?? CODEX_BASENAME_TO_ARTIFACT_LABEL[normalized.replace(/\.[^.]+$/, "")];
}

/** Control IDs that this document type satisfies. Single source of truth: CSV "Controls Mapped" column. */
export function getControlIdsForDocument(documentLabel: string): string[] {
  const trimmed = documentLabel.trim();
  if (!trimmed) return [];

  const exact = GOVERNANCE_DOCUMENT_MATRIX.find((r) => r.document === trimmed);
  if (exact) return exact.controlsMapped;

  const exactLower = GOVERNANCE_DOCUMENT_MATRIX.find(
    (r) => r.document.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactLower) return exactLower.controlsMapped;

  const prefixMatches = GOVERNANCE_DOCUMENT_MATRIX.filter((r) =>
    r.document.toLowerCase().startsWith(trimmed.toLowerCase())
  );
  if (prefixMatches.length === 1) return prefixMatches[0]!.controlsMapped;

  return [];
}
