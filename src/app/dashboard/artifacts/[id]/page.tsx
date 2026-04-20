import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  artifacts,
  artifactLinks,
  controls,
  controlRecords,
  poamEntries,
  poamEntryMilestones,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArtifactDetailActions } from "./ArtifactDetailActions";

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");
  const { id } = await params;

  const [artifact] = await db
    .select({
      artifact: artifacts,
      controlId: controls.controlId,
      controlTitle: controls.title,
    })
    .from(artifacts)
    .innerJoin(controlRecords, eq(artifacts.controlRecordId, controlRecords.id))
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
    .limit(1);

  if (!artifact) return notFound();

  const links = await db
    .select()
    .from(artifactLinks)
    .where(eq(artifactLinks.artifactId, id));

  // Resolve each link to a human-readable description.
  const milestoneIds = links
    .filter((l) => l.linkType === "poam_milestone")
    .map((l) => l.linkTargetId);
  const poamEntryIds = links
    .filter((l) => l.linkType === "poam_entry")
    .map((l) => l.linkTargetId);
  const registerEntryIds = links
    .filter((l) => l.linkType === "register_entry")
    .map((l) => l.linkTargetId);
  const controlRecordIds = links
    .filter((l) => l.linkType === "control")
    .map((l) => l.linkTargetId);

  const milestoneRows = milestoneIds.length
    ? await db
        .select({
          id: poamEntryMilestones.id,
          title: poamEntryMilestones.title,
          completedAt: poamEntryMilestones.completedAt,
          poamEntryId: poamEntryMilestones.poamEntryId,
        })
        .from(poamEntryMilestones)
        .where(inArray(poamEntryMilestones.id, milestoneIds))
    : [];
  const poamEntryRows = poamEntryIds.length
    ? await db
        .select({ id: poamEntries.id, status: poamEntries.status, controlRecordId: poamEntries.controlRecordId })
        .from(poamEntries)
        .where(inArray(poamEntries.id, poamEntryIds))
    : [];
  const registerEntryRows = registerEntryIds.length
    ? await db
        .select({
          id: governanceRegisterEntries.id,
          status: governanceRegisterEntries.status,
          registerName: governanceRegisters.name,
          registerKey: governanceRegisters.registerKey,
        })
        .from(governanceRegisterEntries)
        .innerJoin(
          governanceRegisters,
          eq(governanceRegisterEntries.registerId, governanceRegisters.id)
        )
        .where(inArray(governanceRegisterEntries.id, registerEntryIds))
    : [];
  const controlRows = controlRecordIds.length
    ? await db
        .select({
          id: controlRecords.id,
          controlId: controlRecords.controlId,
          title: controls.title,
        })
        .from(controlRecords)
        .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
        .where(inArray(controlRecords.id, controlRecordIds))
    : [];

  const a = artifact.artifact;
  const hasFile = Boolean(a.fileUrl);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/artifacts"
          className="text-sm text-sky-600 hover:underline"
        >
          ← All artifacts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
          {a.artifactLabel}
        </h1>
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">
          Primary control: {artifact.controlId} · {artifact.controlTitle}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Expected evidence
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Status" value={a.status} />
            <Row label="Closure type" value={a.expectedClosureType ?? "—"} />
            <Row label="Evidence type" value={a.expectedEvidenceType ?? "—"} />
            <Row label="Cadence" value={a.expectedCadence ?? "—"} />
            <Row label="Due" value={a.expectedDueDate ?? "—"} />
            <Row label="Milestone key" value={a.milestoneKey ?? "—"} />
          </dl>
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            File
          </h2>
          {hasFile ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Filename" value={a.fileName ?? "—"} />
              <Row label="Size" value={a.fileSize ? `${a.fileSize} bytes` : "—"} />
              <Row label="Version" value={a.version ?? "—"} />
              <Row
                label="Approved"
                value={a.approvalDate ?? "—"}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No file uploaded yet. Use the upload action on the right.
            </p>
          )}
        </section>
      </div>

      <ArtifactDetailActions artifactId={a.id} hasFile={hasFile} />

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Links
        </h2>
        <div className="mt-3 space-y-4">
          <LinkGroup
            title="Controls"
            items={controlRows.map((c) => ({
              id: c.id,
              label: `${c.controlId} — ${c.title}`,
              href: `/dashboard/controls`,
            }))}
          />
          <LinkGroup
            title="Register entries"
            items={registerEntryRows.map((r) => ({
              id: r.id,
              label: `${r.registerName} · ${r.status}`,
              href: `/dashboard/registers`,
            }))}
          />
          <LinkGroup
            title="POA&M milestones"
            items={milestoneRows.map((m) => ({
              id: m.id,
              label: `${m.title} ${m.completedAt ? "· completed" : ""}`,
              href: `/dashboard/poam/${m.poamEntryId}`,
            }))}
          />
          <LinkGroup
            title="POA&M entries"
            items={poamEntryRows.map((e) => ({
              id: e.id,
              label: `Entry · ${e.status}`,
              href: `/dashboard/poam/${e.id}`,
            }))}
          />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

function LinkGroup({
  title,
  items,
}: {
  title: string;
  items: { id: string; label: string; href: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">—</div>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={i.href} className="text-sky-600 hover:underline">
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
