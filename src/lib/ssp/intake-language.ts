import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";

export async function buildIntakeSspLanguage(organizationId: string) {
  const recentRequests = await db
    .select()
    .from(intakeRequests)
    .where(eq(intakeRequests.organizationId, organizationId))
    .orderBy(desc(intakeRequests.createdAt))
    .limit(25);

  const requestIds = recentRequests.map((r) => r.id);
  const files = requestIds.length
    ? await db
        .select()
        .from(intakeFiles)
        .where(inArray(intakeFiles.intakeRequestId, requestIds))
    : [];

  const completed = recentRequests.filter((r) => r.status === "Closed").length;
  const active = recentRequests.length - completed;
  const filesWithHashes = files.filter((f) => Boolean(f.sha256Hash)).length;

  const paragraphs = [
    "Inbound controlled file handling is implemented through a dedicated CUI/FCI Intake Registry. External senders upload to scoped Azure Government intake storage paths using authorized Entra B2B access (preferred) or short-lived user delegation SAS fallback. The Windows CUI Vault performs controlled import; the Codex control-plane maintains metadata-only intake records and evidence references.",
    "For each intake transaction, the system records transaction identifier, sender identity metadata, authorization basis, upload method, file metadata, malware scan status, SHA-256 hash, vault import correlation, reviewer actions, access revocation events, manifest hash, and evidence artifact references. Plaintext CUI is not stored in Codex unless separately approved in boundary documentation.",
    "Chain-of-custody is maintained by correlating intake transaction identifiers with hash records, manifest artifacts, and vault import entries. Closure workflow gates require required lifecycle evidence or documented exception records. Prohibited transfer methods include regular email, anonymous upload endpoints, and unscoped long-lived token sharing.",
    `Operational snapshot: ${recentRequests.length} recent intake transactions (${active} active, ${completed} closed); ${filesWithHashes} files in sampled records include recorded SHA-256 values.`,
  ];

  return {
    componentLanguage: {
      azureGovIntake:
        "Azure Government Blob Intake component receives scoped inbound controlled uploads with storage security baseline controls and monitoring.",
      windowsVaultImport:
        "Windows Server CUI Vault component performs protected file import, hash correlation, and controlled storage/disposition.",
      codexMetadataRole:
        "Codex stores metadata-only intake records, evidence references, control mappings, and assessor reconstruction outputs.",
      enclaveWatchRole:
        "EnclaveWatch receives and emits intake-related metadata events (scan/hash/import/review/revocation) without plaintext CUI payloads.",
    },
    flowLanguage: {
      plaintextCuiFlow:
        "External sender -> Azure Gov intake container/path -> malware scan and hash recording -> private import to Windows CUI Vault.",
      metadataOnlyFlow:
        "Intake transaction metadata, status history, hashes, manifests, and evidence references -> Codex and EnclaveWatch metadata channels.",
      controls:
        "Access provisioning/revocation, malware scan/hash/manifest process, prohibited transfer methods, and chain-of-custody attestation.",
    },
    paragraphs,
  };
}
