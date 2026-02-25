import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { PlusCircle, LayoutGrid } from "lucide-react";
import { CreateBoundaryButton } from "./CreateBoundaryButton";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export default async function OSBaselinesPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const list = await db
    .select()
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
            OS Baselines
          </h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Define CUI boundaries and OS assets; assign baseline templates and
            track technical control status from evidence runs.
          </p>
        </div>

        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
              Boundaries (CUI enclaves)
            </h2>
            <CreateBoundaryButton />
          </div>
          {list.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-gray-500)]">
              No boundaries yet. Create one to add OS assets and assign
              baselines.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {list.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/dashboard/os-baselines/boundaries/${b.id}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-gray-50)]"
                  >
                    <LayoutGrid className="h-5 w-5 text-[var(--color-gray-500)]" />
                    <div>
                      <span className="font-medium text-[var(--color-gray-900)]">
                        {b.name}
                      </span>
                      {b.description && (
                        <p className="text-sm text-[var(--color-gray-500)]">
                          {b.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
