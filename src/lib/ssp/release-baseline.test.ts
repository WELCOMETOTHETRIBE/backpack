import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeSignoffs,
  createOrGetReleaseBaseline,
} from "./release-baseline";

const baseRow = {
  id: "00000000-0000-0000-0000-000000000001",
  signoffKind: "authorizing_official",
  signerUserId: "user-1",
  signerDisplayName: "Pat AO",
  signerTitle: "Authorizing Official",
  dataHash: "deadbeef".repeat(8),
  signedAt: new Date("2026-01-15T10:00:00Z"),
  signatureAlg: "attestation_only",
};

describe("canonicalizeSignoffs", () => {
  it("renders Date as ISO-8601 and shapes for storage", () => {
    const out = canonicalizeSignoffs([baseRow]);
    expect(out).toEqual([
      {
        signoff_id: baseRow.id,
        signoff_kind: "authorizing_official",
        signer_user_id: "user-1",
        signer_display_name: "Pat AO",
        signer_title: "Authorizing Official",
        data_hash: baseRow.dataHash,
        signed_at: "2026-01-15T10:00:00.000Z",
        signature_alg: "attestation_only",
      },
    ]);
  });

  it("sorts by (kind, signed_at, id) — order-independent input → identical output", () => {
    const a = { ...baseRow, id: "id-a", signoffKind: "system_owner" };
    const b = { ...baseRow, id: "id-b", signoffKind: "authorizing_official" };
    const c = {
      ...baseRow,
      id: "id-c",
      signoffKind: "authorizing_official",
      signedAt: new Date("2026-01-15T11:00:00Z"),
    };
    const d = { ...baseRow, id: "id-d", signoffKind: "isso" };

    const insertionOrderOne = canonicalizeSignoffs([a, b, c, d]);
    const insertionOrderTwo = canonicalizeSignoffs([d, c, b, a]);
    const insertionOrderThree = canonicalizeSignoffs([c, a, d, b]);

    // Same JSON regardless of insertion order — load-bearing for any
    // future hash-of-baseline use case.
    expect(JSON.stringify(insertionOrderOne)).toEqual(
      JSON.stringify(insertionOrderTwo),
    );
    expect(JSON.stringify(insertionOrderTwo)).toEqual(
      JSON.stringify(insertionOrderThree),
    );

    // And the order is the documented (kind, signed_at, id) ordering:
    // 'authorizing_official' (b before c by signed_at) → 'isso' →
    // 'system_owner'.
    expect(insertionOrderOne.map((r) => r.signoff_id)).toEqual([
      "id-b",
      "id-c",
      "id-d",
      "id-a",
    ]);
  });

  it("breaks ties on signoff_id when kind+signed_at match", () => {
    const sameTimestamp = new Date("2026-01-15T10:00:00Z");
    const x = {
      ...baseRow,
      id: "id-z",
      signoffKind: "authorizing_official",
      signedAt: sameTimestamp,
    };
    const y = {
      ...baseRow,
      id: "id-a",
      signoffKind: "authorizing_official",
      signedAt: sameTimestamp,
    };

    const out = canonicalizeSignoffs([x, y]);
    expect(out.map((r) => r.signoff_id)).toEqual(["id-a", "id-z"]);
  });

  it("preserves nullable fields as null (not undefined)", () => {
    const out = canonicalizeSignoffs([
      {
        ...baseRow,
        signerUserId: null,
        signatureAlg: null,
      },
    ]);
    expect(out[0].signer_user_id).toBeNull();
    expect(out[0].signature_alg).toBeNull();
  });

  it("returns an empty array for empty input", () => {
    expect(canonicalizeSignoffs([])).toEqual([]);
  });
});

describe("createOrGetReleaseBaseline idempotency", () => {
  /**
   * The hard idempotency guarantee is the unique index on
   * ssp_doc_control_submission_id, but the service short-circuits
   * BEFORE attempting an insert so a re-link is a fast read rather
   * than a unique-violation that has to be swallowed. This test
   * verifies that early-return path: when the first select finds an
   * existing baseline, the service returns it without doing any
   * further reads or writes.
   */
  it("returns existing baseline without further DB calls when one is found", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "existing-baseline-id" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const insert = vi.fn();
    const update = vi.fn();

    const tx = { select, insert, update } as unknown as Parameters<
      typeof createOrGetReleaseBaseline
    >[0];

    const result = await createOrGetReleaseBaseline(tx, {
      organizationId: "org-1",
      sspDocumentId: "ssp-doc-1",
      sspDocControlSubmissionId: "submission-1",
      qmsDocumentNumber: "SSP-001",
      qmsSha256: "feedface".repeat(8),
      releasedAt: new Date("2026-02-01T00:00:00Z"),
    });

    expect(result).toEqual({
      baselineId: "existing-baseline-id",
      created: false,
      supersededBaselineIds: [],
    });
    // No insert and no update should have been issued.
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // Exactly one select — the idempotency probe.
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("normalizes qms_sha256 to lowercase on insert", async () => {
    // First select: idempotency probe returns no existing baseline.
    // Second select: read sspDocuments returns a doc.
    // Third select: read sspSignoffs returns no signoffs (empty snapshot).
    // Then insert.returning() returns the new id.
    // Then update.returning() supersedes nothing.
    const limit = vi
      .fn()
      // idempotency probe
      .mockResolvedValueOnce([])
      // sspDocuments read
      .mockResolvedValueOnce([
        {
          id: "ssp-doc-1",
          organizationId: "org-1",
          versionNumber: 3,
          boundaryId: "boundary-1",
          payloadSha256: "ab".repeat(32),
        },
      ]);
    const where = vi.fn().mockReturnValue({ limit });
    // sspSignoffs read does NOT call .limit — it terminates at .where.
    // Make .where return a thenable so awaiting it yields [] for the
    // signoffs query, but a chainable {limit} for the others. We
    // simulate that by having .where return a Promise-like that ALSO
    // exposes .limit, since the two callsites consume different keys.
    const whereResultLikePromiseAndChainable = Object.assign(
      Promise.resolve([]),
      { limit },
    );
    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResultLikePromiseAndChainable),
    });
    const select = vi.fn().mockReturnValue({ from });

    const insertReturning = vi
      .fn()
      .mockResolvedValue([{ id: "new-baseline-id" }]);
    const insertValues = vi
      .fn()
      .mockReturnValue({ returning: insertReturning });
    const insert = vi.fn().mockReturnValue({ values: insertValues });

    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi
      .fn()
      .mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    const tx = { select, insert, update } as unknown as Parameters<
      typeof createOrGetReleaseBaseline
    >[0];

    const result = await createOrGetReleaseBaseline(tx, {
      organizationId: "org-1",
      sspDocumentId: "ssp-doc-1",
      sspDocControlSubmissionId: "submission-1",
      qmsDocumentNumber: "SSP-001",
      qmsSha256: "FEEDFACEBEEFCAFE".repeat(4), // upper-case input
      releasedAt: new Date("2026-02-01T00:00:00Z"),
    });

    expect(result.created).toBe(true);
    expect(result.baselineId).toBe("new-baseline-id");

    // Inspect the values passed to insert: qmsSha256 must be lowercase.
    const insertedValues = insertValues.mock.calls[0]![0]! as Record<
      string,
      unknown
    >;
    expect(insertedValues.qmsSha256).toBe(
      "feedfacebeefcafe".repeat(4),
    );
    // Other load-bearing fields should be carried straight through.
    expect(insertedValues.payloadSha256).toBe("ab".repeat(32));
    expect(insertedValues.sspVersionNumber).toBe(3);
    expect(insertedValues.boundaryId).toBe("boundary-1");
    expect(insertedValues.status).toBe("active");
    expect(insertedValues.signoffsJson).toEqual([]);
  });
});
