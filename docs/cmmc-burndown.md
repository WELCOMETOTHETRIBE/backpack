# CMMC L2 Burndown — 11 NOT MET Controls

**As of 2026-05-11.** Snapshot from `/dashboard/cae` and `/dashboard/ssp`:

|             | Count | Notes                                                             |
| ----------- | ----- | ----------------------------------------------------------------- |
| MET         | 89    | 83 via direct evidence + 6 via ESP inheritance (PE family)        |
| **NOT MET** | **11**| **The burndown list below**                                       |
| N/A         | 10    | Cloud-only Azure preset — wireless, physical media, VoIP, etc.    |
| Total       | 110   |                                                                   |

The 11 NOT MET are the controls TrainOS provides evidence for, but whose `esp_inheritance` elevator hasn't yet landed in Codex. Closing each requires the TrainOS module to push a bundle with the `esp` block populated; the existing Codex bridge intake (`src/lib/esp-inheritance/bridge-intake.ts`) then stamps `met_via='esp_inheritance'` on the snapshot.

---

## Burndown — by closure path

### Path 1: AT family (3 controls) — TrainOS AT-001 + AT-002 bundles

| Control       | Statement coverage | Close-out action                                                                                                                                                                                              | Bridge target                                                                |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **3.2.1**     | [a]–[d] via AT-001 | TrainOS publishes the AT-001 course-completion bundle for at least one user per role (manager / sysadmin / user), with `esp` block in the envelope naming AT.L2-3.2.1[a]–[d].                                  | New endpoint *or* extend the RA/CA bridge pattern. Currently no Codex route. |
| **3.2.2**     | [a]–[c] via AT-002 | TrainOS publishes AT-002 role-based bundles for each named-role owner; `esp.implementsObjectives` includes `AT.L2-3.2.2[a]–[c]`.                                                                              | Same as above.                                                               |
| **3.2.3**     | [a]–[b] via AT-001 | AT-001 already covers it; the same bundle carries `AT.L2-3.2.3[a]–[b]` in `implementsObjectives`.                                                                                                              | Same as above.                                                               |

**What's missing on Codex side:** there's no AT-bundle ingest endpoint yet. RA + CA have them; AT and IR don't.

**Action:**
1. **TrainOS:** confirm AT-001 / AT-002 evidence record export includes the `esp` block.
2. **Codex:** create `/api/training/bundles` (or extend existing training endpoints) with the same Bearer+HMAC bridge pattern as `/api/ca-assessments/bundles`. Reuse `applyEspInheritanceFromBundle` with `expectedControls: ["3.2.1","3.2.2","3.2.3"]`.

**ETA:** ~2 hours of Codex work + TrainOS export configuration.

---

### Path 2: IR family (3 controls) — TrainOS IR Tabletop bundle

| Control       | Statement coverage | Close-out action                                                                                                                                                                | Bridge target                                                          |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **3.6.1**     | [a]–[g] via IR Tabletop | Run one IR tabletop exercise per year; TrainOS publishes the 11-file bundle to `/api/ir-tabletop/bundles` with `esp` block naming `IR.L2-3.6.1[a]–[g]`.                          | `/api/ir-tabletop/bundles` (route exists; needs ESP block intake)      |
| **3.6.2**     | [a]–[f] via IR Tabletop | Same bundle; `esp.implementsObjectives` includes `IR.L2-3.6.2[a]–[f]`.                                                                                                          | Same.                                                                  |
| **3.6.3**     | [a] via IR Tabletop | Same bundle; `esp.implementsObjectives` includes `IR.L2-3.6.3[a]`.                                                                                                              | Same.                                                                  |

**What's missing on Codex side:** the IR tabletop bridge exists (`src/app/api/ir-tabletop/bundles/route.ts`) but doesn't yet call `applyEspInheritanceFromBundle`.

**Action:**
1. **Codex:** add ESP block intake to the IR bridge — same pattern as the RA + CA bridges (Tier 1 #2 work). About 30 min, mirrors what's in `src/app/api/ca-assessments/bundles/route.ts`.
2. **TrainOS:** confirm IR Tabletop bundle envelope carries the `esp` block.
3. **MacTech:** run one IR tabletop (2-hour exercise) → bundle ships automatically on AAR sign-off.

**ETA:** ~30 min Codex code + 2-hour tabletop exercise.

---

### Path 3: RA — 3.11.1 — TrainOS Annual RA bundle

| Control      | Statement coverage | Close-out action                                                                                                                                                                                                              | Bridge target                                                                  |
| ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **3.11.1**   | [a]–[b] via Annual RA | TrainOS publishes a finalized Annual RA bundle to `/api/risk-assessments/[id]/finalize` with `esp.implementsObjectives` = `["RA.L2-3.11.1[a]","RA.L2-3.11.1[b]"]`. (We already shipped this bridge w/ ESP intake — Tier 1 #2.) | `/api/risk-assessments/[id]/finalize` ✓ ESP intake live                        |

**What's missing on Codex side:** nothing. RA bridge has ESP intake.

**Action:**
1. **TrainOS:** run the 7-phase RA wizard end-to-end; finalize the assessment.
2. **MacTech:** AO + ISSO + Assessor sign-off on the finalized bundle (existing flow).
3. Codex auto-elevates `met_via='esp_inheritance'` for 3.11.1 on RA bridge intake.

**ETA:** ~1 hour to drive a real RA cycle through the wizard, depending on scope.

---

### Path 4: CA family (4 controls) — TrainOS CA-001 cycle bundle

| Control       | Statement coverage      | Close-out action                                                                                                                                                                                                            | Bridge target                                                              |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **3.12.1**    | [a]–[b] via CA-001      | Finalize the CA-001 cycle; TrainOS pushes to `/api/ca-assessments/bundles` with `esp.implementsObjectives` covering `CA.L2-3.12.1[a]–[b]`. (Bridge has ESP intake — Tier 1 #2.)                                              | `/api/ca-assessments/bundles` ✓ ESP intake live                            |
| **3.12.2**    | [a]–[c] via CA-001      | Same bundle covers [a]–[c]; Operational POA&Ms get filed in Codex via the auto-POA&M flow.                                                                                                                                  | Same.                                                                      |
| **3.12.3**    | [a] via CA-001          | Same bundle; continuous monitoring events captured during the cycle.                                                                                                                                                        | Same.                                                                      |
| **3.12.4**    | [a]–[h] via CA-001 + SSP | Two-part: CA-001 bundle delivers Adjudication evidence; the SSP itself satisfies the [a]–[h] determination statements. **The SSP completeness validator already enforces 8/8**.                                              | Same. Plus SSP currently passes 8/8 (per `/dashboard/ssp` badge).          |

**What's missing on Codex side:** nothing. CA bridge has ESP intake; the SSP completeness gate is wired.

**Action:**
1. **TrainOS:** drive a full CA-001 cycle (Annual Formal type works); finalize.
2. **MacTech:** lead assessor + reviewer + approver sign-off.
3. Codex auto-elevates `met_via='esp_inheritance'` for all four CA controls.

**ETA:** depends on cycle scope — a full annual CA cycle is multi-hour. A quarterly/event-driven cycle covering only 3.12.x is faster.

---

## Burndown summary

| Path                     | Controls closed | Codex work needed                              | TrainOS work / operator action                           |
| ------------------------ | --------------- | ---------------------------------------------- | -------------------------------------------------------- |
| AT bundles               | 3 (3.2.1–3)     | ~2 hr (new `/api/training/bundles` endpoint)   | TrainOS export config + verify ESP block in canonical bytes |
| IR Tabletop bundle       | 3 (3.6.1–3)     | ~30 min (add ESP intake to existing IR bridge) | Run 1 tabletop exercise (~2 hr)                          |
| Annual RA                | 1 (3.11.1)      | ✓ done (ESP intake live)                       | Drive RA wizard end-to-end (~1 hr)                       |
| CA-001 cycle             | 4 (3.12.1–4)    | ✓ done (ESP intake live)                       | Drive CA cycle end-to-end                                |
| **Total**                | **11**          | **~2.5 hours of Codex code**                   | **Operator-driven cycles in TrainOS**                    |

**Codex code to write** (~2.5 hours):
1. `src/app/api/training/bundles/route.ts` — new endpoint for AT-001 / AT-002 bundles with Bearer+HMAC, calls `applyEspInheritanceFromBundle` for AT family. ~2 hours.
2. `src/app/api/ir-tabletop/bundles/route.ts` — add ESP block intake (extend existing route). ~30 min.

After both ship: TrainOS only needs to **finalize their exports for AT + IR + RA + CA**, and Codex auto-elevates all 11 controls to MET via `esp_inheritance` on the next rescore.

## End-state verification

After the burndown completes, the SSP page should show:

| Tally               | Before  | After                                |
| ------------------- | ------- | ------------------------------------ |
| MET                 | 89      | **100**                              |
| NOT MET             | 11      | **0**                                |
| N/A                 | 10      | 10 (unchanged — preset stays)        |
| Defensible          | 99      | **110** (100% of in-scope controls)  |
| MET via ESP         | 6       | **17** (6 PE + 11 TrainOS)           |
| MET via evidence    | 83      | 83 (unchanged)                       |

C3PAO walkthrough: "Show me the 11 TrainOS-elevated controls" → operator opens `/dashboard/cae`, filters Via=ESP, points at the 11 rows with their respective bundle citations.

## Verification SQL (live)

```sql
-- Run against Codex prod DB to confirm the 11 NOT_MET set
SELECT control_id, aggregate_finding, met_via, computed_at
FROM control_adjudication_snapshots cas
WHERE organization_id = '<MacTech-org-id>'
  AND aggregate_finding = 'NOT_MET'
  AND id = (
    SELECT id FROM control_adjudication_snapshots
    WHERE organization_id = cas.organization_id
      AND control_id = cas.control_id
    ORDER BY computed_at DESC LIMIT 1
  )
ORDER BY control_id;
```

Expected result: 11 rows, control_ids `3.2.1`, `3.2.2`, `3.2.3`, `3.6.1`, `3.6.2`, `3.6.3`, `3.11.1`, `3.12.1`, `3.12.2`, `3.12.3`, `3.12.4`.
