import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { getFieldLabelsAndSummaries } from "@/data/cmmc/field-labels-and-summaries";
import { CreateEntryForm } from "./CreateEntryForm";

type PageProps = { params: Promise<{ registerId: string }>; searchParams: Promise<{ boundary?: string }> };

export default async function NewEvidenceEntryPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { registerId: registerKey } = await params;
  const { boundary: boundaryParam } = await searchParams;
  const boundaryId = boundaryParam?.trim() ?? null;
  const schema = getRegisterSchemaByRegisterId(registerKey);

  const [register] = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisters.registerKey, registerKey)
      )
    );

  if (!register || !schema) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/evidence-engine/registers"
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Registers
        </Link>
        <p className="text-sm text-red-600">Register not found.</p>
      </div>
    );
  }

  const backHref = boundaryId
    ? `/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}?boundary=${encodeURIComponent(boundaryId)}`
    : `/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← {register.name}
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Create entry
        </h2>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Choose an entry type and fill required fields. Entry will be created as draft.
        </p>
      </div>

      <CreateEntryForm
        registerKey={registerKey}
        registerName={register.name}
        schema={schema}
        fieldLabels={getFieldLabelsAndSummaries().fields}
        boundaryId={boundaryId}
      />
    </div>
  );
}
