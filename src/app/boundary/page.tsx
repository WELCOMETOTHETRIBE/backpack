import Link from "next/link";

export default function BoundaryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">System boundary statement</h1>
      <p className="mb-4 text-zinc-600">
        The CMMC Compliance Control Plane is a metadata-only, multi-tenant SaaS platform that sits
        <strong> outside </strong>
        the customer&apos;s CUI boundary. It orchestrates compliance and does not store, process, or
        transmit Controlled Unclassified Information (CUI). Evidence artifacts (logs, config exports,
        screenshots) remain in the customer enclave; only pointers (paths, RunIds, SHA-256 hashes) are
        registered in this system. This platform is not part of the assessed system under CMMC.
      </p>
      <Link href="/" className="text-zinc-600 underline hover:text-zinc-900">
        Back to home
      </Link>
    </div>
  );
}
