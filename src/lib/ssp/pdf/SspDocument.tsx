/**
 * SSP PDF document — react-pdf component tree consuming the canonical
 * JSON payload produced by src/lib/ssp/generate.ts.
 *
 * Server-only. Rendered to a Buffer via @react-pdf/renderer's pdf()
 * helper in the /api/ssp/[id]/pdf endpoint.
 *
 * Layout philosophy:
 *   - First page: cover + adjudication tally + signature provenance
 *     (the "what is this" page a C3PAO opens to).
 *   - Sections follow in the AG-mandated order (system_id, scope,
 *     environment, security_reqs, then the 110 control sections,
 *     then connections, update_freq, appendices). Each section gets
 *     enough page-break friendliness that controls don't split
 *     mid-objective.
 *   - Per-control sections render the verdict + per-objective
 *     findings + implementation method + evidence list. The
 *     [a]-style objective tags appear inline so an auditor can
 *     follow the per-objective evidence trail.
 *
 * This is a pure presentation layer — no DB access here. Whatever the
 * canonical JSON says, the PDF reflects.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  cover: {
    paddingTop: 100,
  },
  coverTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 32,
  },
  coverMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 32,
  },
  coverMetaCell: {
    width: "50%",
    paddingVertical: 6,
    paddingRight: 12,
  },
  coverMetaLabel: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize: 11,
    color: "#0f172a",
  },
  coverHashBlock: {
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 4,
    marginBottom: 24,
  },
  hashLabel: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  hashValue: {
    fontFamily: "Courier",
    fontSize: 9,
    color: "#0f172a",
  },
  tally: {
    flexDirection: "row",
    marginBottom: 24,
  },
  tallyCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 6,
    borderWidth: 1,
    borderRadius: 4,
  },
  tallyMet: { borderColor: "#a7f3d0", backgroundColor: "#ecfdf5" },
  tallyNotMet: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  tallyNa: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  tallyDef: { borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  tallyLabel: { fontSize: 8, color: "#475569", textTransform: "uppercase" },
  tallyNumber: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sectionHeading: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    color: "#0f172a",
  },
  controlHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 4,
    color: "#0f172a",
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.45,
    marginBottom: 6,
    color: "#1e293b",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  pill: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
    borderRadius: 3,
    backgroundColor: "#e2e8f0",
    color: "#1e293b",
  },
  pillMet: { backgroundColor: "#d1fae5", color: "#065f46" },
  pillNotMet: { backgroundColor: "#fee2e2", color: "#9f1239" },
  pillNa: { backgroundColor: "#e2e8f0", color: "#475569" },
  objectiveLine: {
    fontSize: 9,
    lineHeight: 1.4,
    marginBottom: 4,
    color: "#1e293b",
  },
  objectiveTag: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
  },
  evidenceLine: {
    fontSize: 8.5,
    lineHeight: 1.35,
    marginBottom: 2,
    color: "#475569",
  },
  pageNumber: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },
});

// ── Public types — match canonical JSON payload shape ───────────────

export interface SspPdfPayload {
  version_number: number;
  organization: { name: string | null; slug: string | null };
  boundary: {
    name: string;
    boundary_type: string | null;
    cloud_provider: string | null;
    azure_environment: string | null;
  };
  generated_from_snapshot_at: string;
  tally: {
    controlsCovered: number;
    controlsMet: number;
    controlsNotMet: number;
    controlsNa: number;
    controlsMetViaEvidence: number;
    controlsMetViaEsp: number;
    controlsMetViaEnduringException: number;
    controlsMetViaDodCio: number;
    controlsMetViaOpPlan: number;
  };
  sections: Array<SspSectionPayload>;
}

export interface SspSectionPayload {
  kind: string;
  key: string;
  order: number;
  title: string;
  body_md: string;
  body_json: Record<string, unknown> | null;
  aggregate_finding: string | null;
  met_via: string | null;
  objective_verdicts: Array<{
    objective: string;
    verdict: string;
    rationale: string | null;
  }> | null;
  citations: Array<{
    evidence_kind: string;
    evidence_id: string;
    evidence_sha256: string | null;
    supports_objectives: string[];
    evidence_excerpt: string | null;
  }>;
}

export interface SspPdfMeta {
  payloadSha256: string;
  signature: {
    alg: string;
    kid: string;
    value: string;
    signedAt: string | Date;
  } | null;
  signoffs: Array<{
    signoffKind: string;
    signerDisplayName: string;
    signerTitle: string;
    signedAt: string | Date | null;
  }>;
}

// ── Document ────────────────────────────────────────────────────────

export function SspDocument({
  payload,
  meta,
}: {
  payload: SspPdfPayload;
  meta: SspPdfMeta;
}) {
  const orgName = payload.organization.name ?? payload.organization.slug ?? "Organization";
  const def = payload.tally.controlsMet + payload.tally.controlsNa;

  const ordered = [...payload.sections].sort((a, b) => a.order - b.order);
  const controlSections = ordered.filter((s) => s.kind === "control");
  const headSections = ordered.filter(
    (s) => s.kind !== "control" && s.order < 100,
  );
  const tailSections = ordered.filter(
    (s) => s.kind !== "control" && s.order >= 1000,
  );

  return (
    <Document
      title={`SSP — ${orgName} v${payload.version_number}`}
      author="MacTech Codex"
      subject="CMMC Level 2 System Security Plan"
    >
      {/* Cover */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.coverTitle}>System Security Plan</Text>
          <Text style={styles.coverSubtitle}>
            {orgName} — Version {payload.version_number}
          </Text>

          <View style={styles.coverMeta}>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>System</Text>
              <Text style={styles.coverMetaValue}>{payload.boundary.name}</Text>
            </View>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>Boundary type</Text>
              <Text style={styles.coverMetaValue}>
                {payload.boundary.boundary_type ?? "—"}
              </Text>
            </View>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>Cloud provider</Text>
              <Text style={styles.coverMetaValue}>
                {payload.boundary.cloud_provider ?? "—"}
                {payload.boundary.azure_environment
                  ? ` (Azure ${payload.boundary.azure_environment})`
                  : ""}
              </Text>
            </View>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>CMMC level</Text>
              <Text style={styles.coverMetaValue}>Level 2</Text>
            </View>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>Snapshot</Text>
              <Text style={styles.coverMetaValue}>
                {String(payload.generated_from_snapshot_at).slice(0, 19).replace("T", " ")} UTC
              </Text>
            </View>
            <View style={styles.coverMetaCell}>
              <Text style={styles.coverMetaLabel}>Status</Text>
              <Text style={styles.coverMetaValue}>
                {meta.signature ? "Signed" : "Draft"}
              </Text>
            </View>
          </View>

          <View style={styles.tally}>
            <View style={[styles.tallyCell, styles.tallyMet]}>
              <Text style={styles.tallyLabel}>Met</Text>
              <Text style={styles.tallyNumber}>{payload.tally.controlsMet}</Text>
            </View>
            <View style={[styles.tallyCell, styles.tallyNotMet]}>
              <Text style={styles.tallyLabel}>Not met</Text>
              <Text style={styles.tallyNumber}>{payload.tally.controlsNotMet}</Text>
            </View>
            <View style={[styles.tallyCell, styles.tallyNa]}>
              <Text style={styles.tallyLabel}>N/A</Text>
              <Text style={styles.tallyNumber}>{payload.tally.controlsNa}</Text>
            </View>
            <View style={[styles.tallyCell, styles.tallyDef]}>
              <Text style={styles.tallyLabel}>Defensible</Text>
              <Text style={styles.tallyNumber}>{def}</Text>
            </View>
          </View>

          <View style={styles.coverHashBlock}>
            <Text style={styles.hashLabel}>payload_sha256</Text>
            <Text style={styles.hashValue}>{meta.payloadSha256}</Text>
            {meta.signature && (
              <>
                <Text style={[styles.hashLabel, { marginTop: 6 }]}>
                  signature ({meta.signature.alg})
                </Text>
                <Text style={styles.hashValue}>{meta.signature.value}</Text>
                <Text style={[styles.hashLabel, { marginTop: 6 }]}>signed at</Text>
                <Text style={styles.hashValue}>
                  {String(meta.signature.signedAt).slice(0, 19).replace("T", " ")} UTC
                </Text>
              </>
            )}
          </View>

          {meta.signoffs.length > 0 && (
            <View>
              <Text style={styles.sectionHeading}>Sign-offs</Text>
              {meta.signoffs.map((s, i) => (
                <Text key={i} style={styles.paragraph}>
                  {s.signoffKind.replace(/_/g, " ")}: {s.signerDisplayName} ({s.signerTitle})
                  {s.signedAt
                    ? ` — ${String(s.signedAt).slice(0, 10)}`
                    : ""}
                </Text>
              ))}
            </View>
          )}

          <Text
            style={[styles.paragraph, { marginTop: 24, color: "#64748b", fontSize: 9 }]}
          >
            This SSP is generated deterministically from the canonical adjudication
            snapshot pinned above. Every cited evidence row is bound by SHA-256 at
            generation time. Re-derive the verification report at any time via
            GET /api/ssp/[id]/verify.
          </Text>
        </View>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* Header sections + 110 control sections + tail sections */}
      <Page size="LETTER" style={styles.page} wrap>
        {headSections.map((s) => (
          <View key={s.key} wrap={false}>
            <Text style={styles.sectionHeading}>{s.title}</Text>
            <Text style={styles.paragraph}>{stripMd(s.body_md)}</Text>
            <View style={styles.divider} />
          </View>
        ))}

        {controlSections.map((s) => (
          <ControlBlock key={s.key} section={s} />
        ))}

        {tailSections.map((s) => (
          <View key={s.key} wrap={false}>
            <Text style={styles.sectionHeading}>{s.title}</Text>
            <Text style={styles.paragraph}>{stripMd(s.body_md)}</Text>
            <View style={styles.divider} />
          </View>
        ))}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

function ControlBlock({ section }: { section: SspSectionPayload }) {
  const verdictPillStyle =
    section.aggregate_finding === "MET"
      ? styles.pillMet
      : section.aggregate_finding === "NA"
        ? styles.pillNa
        : styles.pillNotMet;
  const findingLabel =
    section.aggregate_finding === "MET"
      ? "MET"
      : section.aggregate_finding === "NA"
        ? "N/A"
        : "NOT MET";

  return (
    // Allow long control sections to wrap between pages — the
    // implementation method prose is often too tall to fit on a
    // single page and react-pdf warns when wrap=false on oversized
    // views. The heading + verdict pills stay together via the
    // inner View that wraps={false}.
    <View>
      <View wrap={false}>
        <Text style={styles.controlHeading}>{section.title}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.pill, verdictPillStyle]}>{findingLabel}</Text>
          {section.met_via && (
            <Text style={styles.pill}>via {section.met_via.replace(/_/g, " ")}</Text>
          )}
        </View>
      </View>

      {section.objective_verdicts && section.objective_verdicts.length > 0 && (
        <View>
          {section.objective_verdicts.map((o, i) => (
            <Text key={i} style={styles.objectiveLine}>
              <Text style={styles.objectiveTag}>[{o.objective}]</Text>{" "}
              {formatVerdict(o.verdict)}
            </Text>
          ))}
        </View>
      )}

      <Text style={[styles.paragraph, { marginTop: 6 }]}>
        {stripMd(section.body_md, /implementation method[\s\S]*?(?=#### Evidence|$)/i)}
      </Text>

      {section.citations.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.hashLabel, { marginBottom: 2 }]}>
            Evidence pinned at generation time
          </Text>
          {section.citations.slice(0, 6).map((c, i) => (
            <Text key={i} style={styles.evidenceLine}>
              [{c.evidence_kind}]{" "}
              {c.evidence_excerpt ?? c.evidence_id}
              {c.evidence_sha256 ? ` · sha256:${c.evidence_sha256.slice(0, 12)}…` : ""}
            </Text>
          ))}
          {section.citations.length > 6 && (
            <Text style={styles.evidenceLine}>
              + {section.citations.length - 6} more (see canonical JSON)
            </Text>
          )}
        </View>
      )}
      <View style={styles.divider} />
    </View>
  );
}

// Strip Markdown emphasis + heading marks for the PDF body. We keep
// the prose readable but not styled — react-pdf doesn't parse Markdown
// natively and we want the canonical JSON to be the source of truth
// for any rich rendering.
function stripMd(md: string, extract?: RegExp): string {
  let body = md;
  if (extract) {
    const m = md.match(extract);
    if (m) body = m[0];
  }
  return body
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|.*$/gm, "")
    .trim();
}

function formatVerdict(v: string): string {
  if (v === "MET") return "MET";
  if (v === "NOT_MET") return "NOT MET";
  if (v === "NA") return "N/A";
  return v;
}
