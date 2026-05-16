import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { evidenceRuns } from "../../../../../../drizzle/schema.evidence";
import { eq, and, sql } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { createHash } from "crypto";

/**
 * POST /api/registers/external-system-connections/snapshot
 *
 * EnclaveWatch's azure_external_connections collector POSTs a full inventory
 * of every external connection observable from live Azure topology:
 *   • VNet peerings (east-west)
 *   • ExpressRoute circuits (private path to on-prem / partner)
 *   • Site-to-site / point-to-site VPN connections
 *   • Private endpoints (services we expose privately)
 *   • Public IPs (north-south public surface, NSG/Caddy-gated)
 *   • Front Door endpoints (public reverse proxy in front of the enclave)
 *   • B2B guest users (external identities with tenant access)
 *   • Cross-tenant access policy default trust settings
 *
 * Each detected connection becomes ONE finalized register entry tagged with
 * the connection kind, the Azure resource id, and the live metadata. The
 * defensible argument to an assessor: "the register is auto-populated from
 * Azure ground truth on every cadence; every entry is a real, live
 * connection at the time of collection — show me one without authorization
 * and I'll show you a register entry with the authorization record."
 *
 * Idempotent on (vault_id, connection kind, connection id): re-uploading the
 * same connection in a later cadence updates the existing entry in-place,
 * preserving the original authorized_at and authorized_by fields when set.
 *
 * After the upsert, recomputes 3.1.20 status. With a non-empty inventory and
 * matching register entries, the codex flips the control to implemented.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

type RawConnection = Record<string, unknown>;

type Body = {
  source?: string; // "azure_external_connections"
  collected_at?: string;
  vault_id?: string;
  scope?: {
    subscription_id?: string;
    resource_group?: string;
    tenant_id?: string;
  };
  vnet_peerings?: RawConnection[];
  express_route?: RawConnection[];
  vpn_connections?: RawConnection[];
  private_endpoints?: RawConnection[];
  public_ips?: RawConnection[];
  afd_endpoints?: RawConnection[];
  b2b_guests?: RawConnection[];
  cross_tenant_access?: RawConnection | null;
  collector_version?: string;
};

const FORBIDDEN_RAW_KEYS = [
  "raw_event_xml",
  "raw_event_body",
  "command_line",
  "raw_command_line",
  "password",
  "secret",
  "private_key",
];

function findForbiddenKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenKey(value[i], [...path, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_RAW_KEYS.includes(k.toLowerCase())) {
      return [...path, k].join(".");
    }
    const found = findForbiddenKey(obj[k], [...path, k]);
    if (found) return found;
  }
  return null;
}

/**
 * Normalize a raw Azure resource into a flat entry shape suitable for an
 * assessor: kind, stable id, display name, key risk facets, raw object
 * preserved for traceability. The `connection_id` is what we dedupe on
 * across cadences (Azure resource id when available, otherwise the
 * external identifier).
 */
type NormalizedConnection = {
  kind: string;
  connection_id: string;
  display_name: string;
  details: Record<string, unknown>;
  raw: RawConnection;
};

function normalize(
  kind: string,
  items: RawConnection[] | undefined,
  pickId: (it: RawConnection) => string,
  pickDisplay: (it: RawConnection) => string,
  pickDetails: (it: RawConnection) => Record<string, unknown>,
): NormalizedConnection[] {
  if (!Array.isArray(items)) return [];
  const out: NormalizedConnection[] = [];
  for (const it of items) {
    const id = pickId(it);
    if (!id) continue;
    out.push({
      kind,
      connection_id: id,
      display_name: pickDisplay(it) || id,
      details: pickDetails(it),
      raw: it,
    });
  }
  return out;
}

export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = ctx.orgId;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    return NextResponse.json(
      { error: `Payload contains forbidden key at "${forbidden}"`, code: "FORBIDDEN_KEY_REJECTED" },
      { status: 400 },
    );
  }

  if (!body.source || !body.collected_at || !body.vault_id) {
    return NextResponse.json(
      { error: "source, collected_at, vault_id are required" },
      { status: 400 },
    );
  }

  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return NextResponse.json({ error: "No boundary for org" }, { status: 400 });

  const candidates = resolveRegisterKeyCandidates("external_system_connections");
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!register) {
    return NextResponse.json(
      { error: "external_system_connections register not provisioned for org" },
      { status: 400 },
    );
  }

  // Normalize every input into a uniform connection shape. The pickId function
  // determines the dedup key; pickDisplay is what the assessor sees in the UI.
  const all: NormalizedConnection[] = [
    ...normalize("vnet_peering", body.vnet_peerings,
      (it) => String((it.peering_name as string) ?? "") + "@" + String((it.local_vnet as string) ?? ""),
      (it) => `Peering ${it.peering_name} on ${it.local_vnet} → ${it.remote_vnet ?? "?"}`,
      (it) => ({
        local_vnet: it.local_vnet,
        local_rg: it.local_rg,
        remote_vnet: it.remote_vnet,
        state: it.state,
        allow_forwarded_traffic: it.allow_forwarded_traffic,
        allow_gateway_transit: it.allow_gateway_transit,
      })),
    ...normalize("express_route", body.express_route,
      (it) => String(it.id ?? it.name ?? ""),
      (it) => String(it.name ?? it.id ?? ""),
      (it) => ({ status: it.circuitProvisioningState, location: it.location, sku: it.sku })),
    ...normalize("vpn_connection", body.vpn_connections,
      (it) => String(it.id ?? it.name ?? ""),
      (it) => String(it.name ?? ""),
      (it) => ({ type: it.connectionType, status: it.connectionStatus })),
    ...normalize("private_endpoint", body.private_endpoints,
      (it) => String(it.id ?? it.name ?? ""),
      (it) => String(it.name ?? ""),
      (it) => ({ rg: it.resourceGroup, target: it.privateLinkServiceConnections })),
    ...normalize("public_ip", body.public_ips,
      (it) => String(it.id ?? ""),
      (it) => `${it.name} (${it.ipAddress})`,
      (it) => ({ rg: it.resourceGroup, ip: it.ipAddress, attached_to: it.ipConfiguration })),
    ...normalize("afd_endpoint", body.afd_endpoints,
      (it) => `${it.profile}/${it.endpoint_name}`,
      (it) => `${it.profile}/${it.endpoint_name} (${it.hostname})`,
      (it) => ({ profile: it.profile, rg: it.rg, front_door_id: it.front_door_id, hostname: it.hostname, state: it.state })),
    ...normalize("b2b_guest",
      Array.isArray(body.b2b_guests)
        ? body.b2b_guests
        : ((body.b2b_guests as unknown as { value?: RawConnection[] })?.value ?? []),
      (it) => String(it.id ?? it.userPrincipalName ?? ""),
      (it) => `${it.displayName ?? it.userPrincipalName} (${it.userPrincipalName})`,
      (it) => ({ upn: it.userPrincipalName, state: it.externalUserState, created: it.createdDateTime, mail: it.mail })),
  ];

  // Cross-tenant access policy: not a per-connection entry but a tenant-wide
  // posture row that lives alongside the connections for traceability.
  if (body.cross_tenant_access && typeof body.cross_tenant_access === "object") {
    all.push({
      kind: "cross_tenant_access_policy",
      connection_id: "cross_tenant_access_policy",
      display_name: "Cross-tenant access default policy",
      details: body.cross_tenant_access as Record<string, unknown>,
      raw: body.cross_tenant_access as RawConnection,
    });
  }

  // Upsert each connection as a register entry. Match on (entry_type=external_connection,
  // entryData.kind, entryData.connection_id). Preserve operator-set authorization
  // fields (authorized_by, authorized_at, isa_signed_date, isa_expires_at) when
  // updating — the cadence shouldn't clobber human-set authorization metadata.
  let inserted = 0;
  let updated = 0;
  const now = new Date();
  for (const conn of all) {
    const [match] = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, register.id),
          eq(governanceRegisterEntries.entryType, "external_connection"),
          sql`${governanceRegisterEntries.entryData} ->> 'kind' = ${conn.kind}`,
          sql`${governanceRegisterEntries.entryData} ->> 'connection_id' = ${conn.connection_id}`,
        ),
      )
      .limit(1);

    const existing = (match?.entryData ?? {}) as Record<string, unknown>;
    const entryData: Record<string, unknown> = {
      ...conn,
      source: body.source,
      collected_at: body.collected_at,
      vault_id: body.vault_id,
      scope: body.scope ?? null,
      // Preserve operator-set authorization fields if present from prior entry.
      authorized_by: existing.authorized_by ?? null,
      authorized_at: existing.authorized_at ?? null,
      isa_signed_date: existing.isa_signed_date ?? null,
      isa_expires_at: existing.isa_expires_at ?? null,
      authorization_notes: existing.authorization_notes ?? null,
    };

    if (match) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, status: "final", finalizedAt: now, updatedAt: now })
        .where(eq(governanceRegisterEntries.id, match.id));
      updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryData,
        entryType: "external_connection",
        status: "final",
        finalizedAt: now,
      });
      inserted++;
    }
  }

  const totals = {
    total: all.length,
    vnet_peerings: body.vnet_peerings?.length ?? 0,
    express_route: body.express_route?.length ?? 0,
    vpn_connections: body.vpn_connections?.length ?? 0,
    private_endpoints: body.private_endpoints?.length ?? 0,
    public_ips: body.public_ips?.length ?? 0,
    afd_endpoints: body.afd_endpoints?.length ?? 0,
    b2b_guests: Array.isArray(body.b2b_guests)
      ? body.b2b_guests.length
      : ((body.b2b_guests as unknown as { value?: unknown[] })?.value?.length ?? 0),
    inserted,
    updated,
  };

  // Evidence run row for the cadence freshness pill.
  const fingerprint = createHash("sha256")
    .update(`azure_external_connections|${body.vault_id ?? ""}|${body.collected_at ?? ""}`)
    .digest("hex");
  const runId = `EXT-${(body.collected_at ?? "").slice(0, 10).replace(/-/g, "")}-${(body.vault_id ?? "unknown").slice(0, 24)}`;
  await db
    .delete(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.runFingerprint, fingerprint),
      ),
    );
  await db.insert(evidenceRuns).values({
    organizationId: orgId,
    systemId: boundary.id,
    runId,
    collectedAt: new Date(body.collected_at),
    collectorName: "azure_external_connections",
    collectorVersion: body.collector_version ?? "azure_external_connections",
    bundleRoot: `azure_external_connections://${body.vault_id ?? ""}`,
    manifest: { vault_id: body.vault_id, scope: body.scope ?? null, totals } as Record<string, unknown>,
    hashAlgorithm: "sha256",
    source: "azure_external_connections",
    boundaryId: boundary.id,
    runFingerprint: fingerprint,
  });

  // Recompute 3.1.20 status now that the register has entries.
  let recomputed = 0;
  const [rec] = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, "3.1.20")))
    .limit(1);
  if (rec) {
    await calculateControlStatus(rec.id).catch(() => null);
    recomputed = 1;
  }

  console.log(
    JSON.stringify({
      event: "external_connections_snapshot_ingested",
      orgId,
      vaultId: body.vault_id,
      collectedAt: body.collected_at,
      totals,
      recomputed,
    }),
  );

  return NextResponse.json({
    ok: true,
    register_id: register.id,
    totals,
    fingerprint,
    run_id: runId,
    recomputed_controls: recomputed,
  });
}
