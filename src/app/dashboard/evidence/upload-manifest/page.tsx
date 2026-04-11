import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UploadManifestClient } from "./UploadManifestClient";

export default async function UploadManifestPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const orgBoundaries = await db
    .select({ id: boundaries.id, name: boundaries.name })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-2xl">
        <UploadManifestClient boundaries={orgBoundaries} />
      </div>
    </div>
  );
}
