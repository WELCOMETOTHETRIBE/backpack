import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import {
  intakeAccessGrants,
  intakeEvidenceArtifacts,
  intakeFiles,
  intakeManifests,
  intakeRequests,
  intakeReviewActions,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { IntakeDetailActions } from "./IntakeDetailActions";

type Params = { params: Promise<{ id: string }> };

export default async function IntakeDetailPage({ params }: Params) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  if (!user?.organizationId) redirect("/auth/signin");
  const { id } = await params;

  const [request] = await db
    .select()
    .from(intakeRequests)
    .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, user.organizationId)))
    .limit(1);
  if (!request) notFound();

  const [files, grants, reviews, manifests, artifacts] = await Promise.all([
    db.select().from(intakeFiles).where(eq(intakeFiles.intakeRequestId, request.id)),
    db.select().from(intakeAccessGrants).where(eq(intakeAccessGrants.intakeRequestId, request.id)),
    db.select().from(intakeReviewActions).where(eq(intakeReviewActions.intakeRequestId, request.id)),
    db.select().from(intakeManifests).where(eq(intakeManifests.intakeRequestId, request.id)),
    db
      .select()
      .from(intakeEvidenceArtifacts)
      .where(eq(intakeEvidenceArtifacts.intakeRequestId, request.id)),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/intake" className="text-sm text-[var(--color-gray-600)] hover:underline">
            ← Intake Registry
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">
            {request.title}
          </h1>
          <p className="mt-1 font-mono text-xs text-[var(--color-gray-600)]">
            {request.intakeTransactionId}
          </p>
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
            Status: <strong>{request.status}</strong> · Classification:{" "}
            <strong>{request.expectedClassification}</strong>
          </p>
        </div>
      </div>

      <IntakeDetailActions intakeId={request.id} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Sender + Authorization
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-[var(--color-gray-500)]">Sender</dt><dd>{request.senderName ?? "—"}</dd></div>
            <div><dt className="text-[var(--color-gray-500)]">Email</dt><dd>{request.senderEmail ?? "—"}</dd></div>
            <div><dt className="text-[var(--color-gray-500)]">Organization</dt><dd>{request.senderOrganization ?? "—"}</dd></div>
            <div><dt className="text-[var(--color-gray-500)]">Authorization Basis</dt><dd>{request.authorizationBasis}</dd></div>
          </dl>
        </section>
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Access Grants
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {grants.map((grant) => (
              <li key={grant.id} className="rounded border border-[var(--color-border-muted)] p-2">
                <div className="font-medium">{grant.accessMethod}</div>
                <div className="font-mono text-xs text-[var(--color-gray-600)]">{grant.accessScope}</div>
                <div className="text-xs text-[var(--color-gray-600)]">
                  Expires: {grant.accessExpiresAt ? new Date(grant.accessExpiresAt).toLocaleString() : "—"} ·
                  Revoked: {grant.accessRevokedAt ? new Date(grant.accessRevokedAt).toLocaleString() : "No"}
                </div>
              </li>
            ))}
            {!grants.length && <li className="text-[var(--color-gray-600)]">No grants recorded.</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          Files
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {files.map((file) => (
            <li key={file.id} className="rounded border border-[var(--color-border-muted)] p-2">
              <div className="font-medium">{file.originalFilename}</div>
              <div className="text-xs text-[var(--color-gray-600)]">
                Scan: {file.malwareScanStatus} · Hash: {file.sha256Hash ?? "—"} · Vault: {file.vaultImportStatus}
              </div>
            </li>
          ))}
          {!files.length && <li className="text-[var(--color-gray-600)]">No uploaded files recorded.</li>}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Reviewer Actions
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {reviews.map((review) => (
              <li key={review.id} className="rounded border border-[var(--color-border-muted)] p-2">
                <div className="font-medium">{review.actionType}</div>
                <div className="text-xs text-[var(--color-gray-600)]">
                  {review.performedByIdentity ?? "unknown"} ·{" "}
                  {new Date(review.performedAt).toLocaleString()}
                </div>
              </li>
            ))}
            {!reviews.length && <li className="text-[var(--color-gray-600)]">No reviewer actions yet.</li>}
          </ul>
        </section>
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Evidence + Manifest
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {manifests.map((manifest) => (
              <li key={manifest.id} className="rounded border border-[var(--color-border-muted)] p-2">
                <div className="font-medium">Manifest {manifest.manifestHash.slice(0, 12)}...</div>
                <div className="font-mono text-xs text-[var(--color-gray-600)]">
                  {manifest.storageLocation ?? "storage-path-missing"}
                </div>
              </li>
            ))}
            {artifacts.map((artifact) => (
              <li key={artifact.id} className="rounded border border-[var(--color-border-muted)] p-2">
                <div className="font-medium">{artifact.artifactName}</div>
                <div className="text-xs text-[var(--color-gray-600)]">
                  {artifact.artifactType} · {artifact.artifactHash ?? "no-hash"}
                </div>
              </li>
            ))}
            {!manifests.length && !artifacts.length && (
              <li className="text-[var(--color-gray-600)]">No evidence artifacts yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
