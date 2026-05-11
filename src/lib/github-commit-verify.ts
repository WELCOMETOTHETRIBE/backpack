/**
 * GitHub commit-on-main verification.
 *
 * Used by POST /api/agent/run/:runId/complete to confirm that the
 * commit SHA the agent reports as the "fix" for a feedback item is
 * actually reachable from origin/main — i.e. it will be picked up by
 * Railway's auto-deploy and reach prod.
 *
 * Background: the Anthropic Claude Code sandbox creates a working
 * branch (e.g. `claude/gifted-noether-XXXX`) by default, and the agent
 * has historically pushed there instead of main despite the prompt
 * saying otherwise. That left feedback rows marked status='resolved'
 * with a resolution_commit_sha that exists only on a branch — Railway
 * never sees the fix, but the UI shows "resolved." This helper closes
 * that gap.
 *
 * Verification path:
 *   GET https://api.github.com/repos/{repo}/branches/main
 *     → has { commit: { sha } } for the current main HEAD
 *   GET .../compare/{candidate}...{mainHead}
 *     → response.status is one of: identical | behind | ahead | diverged
 *       - identical / behind → candidate is reachable from main ✓
 *       - ahead / diverged   → candidate is NOT on main
 *
 * Auth: optional for PUBLIC repos. REQUIRED for private repos.
 * GitHub returns 404 (not 403) on private-repo paths when the request
 * is unauthenticated, by design — so callers must distinguish
 * "no token configured" from "commit genuinely not on main."
 *
 * Configure via env var GITHUB_API_TOKEN — a fine-grained PAT scoped
 * read-only to the WELCOMETOTHETRIBE/CMMC repo (Contents + Metadata).
 * Without it on a private repo, this helper returns
 * status='unverifiable_no_token' so /complete can degrade to a
 * loud-audit-log mode instead of refusing every resolution.
 */

const GITHUB_REPO =
  process.env.AGENT_VERIFY_REPO ?? "WELCOMETOTHETRIBE/CMMC";
const MAIN_BRANCH = process.env.AGENT_VERIFY_MAIN_BRANCH ?? "main";

export interface VerifyResult {
  /** True iff the candidate SHA is reachable from main HEAD. */
  onMain: boolean;
  /**
   * Compare status string:
   *   identical | behind            → on main (success)
   *   ahead | diverged              → not on main (genuine reject)
   *   not_found                     → commit doesn't exist (genuine reject)
   *   unverifiable_no_token         → GitHub API blocked by missing
   *                                   token (private repo); /complete
   *                                   should degrade gracefully
   *   branch_fetch_failed           → other GitHub error
   *   invalid                       → commitSha not a hex SHA
   */
  status: string;
  /** main HEAD SHA at verification time (handy for logging). */
  mainHead: string | null;
  /** Free-form reason when onMain is false. */
  reason?: string;
  /**
   * True when verification couldn't run because the GITHUB_API_TOKEN
   * env var is missing (or invalid) and the repo is private. /complete
   * uses this to distinguish "can't check" from "checked and failed."
   * When true, the caller should ALLOW the resolution but write a
   * loud audit-log entry; the protection only fully engages once a
   * token is configured.
   */
  unverifiable: boolean;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "TrustCodex-AgentVerifier/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function hasToken(): boolean {
  const t = process.env.GITHUB_API_TOKEN;
  return typeof t === "string" && t.length > 0;
}

/**
 * Verify a commit SHA is reachable from origin/main on the configured
 * repo. Best-effort: callers handle three outcomes:
 *   onMain=true                         → safe to mark resolved
 *   onMain=false + unverifiable=true    → can't check; degrade w/ audit
 *   onMain=false + unverifiable=false   → refuse the resolution
 */
export async function verifyCommitOnMain(
  commitSha: string,
): Promise<VerifyResult> {
  if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) {
    return {
      onMain: false,
      status: "invalid",
      mainHead: null,
      reason: "commitSha is not a valid hex SHA",
      unverifiable: false,
    };
  }

  const tokenConfigured = hasToken();

  // 1. Fetch main HEAD.
  let mainHead: string;
  try {
    const branchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/branches/${MAIN_BRANCH}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    if (!branchRes.ok) {
      // 404 + no token = almost certainly a private-repo auth issue
      // (GitHub returns 404, not 403, for private-repo paths to
      // unauthenticated callers — by design, to avoid leaking
      // existence). Distinguish from "genuine 404" so /complete can
      // degrade rather than false-reject.
      if (branchRes.status === 404 && !tokenConfigured) {
        return {
          onMain: false,
          status: "unverifiable_no_token",
          mainHead: null,
          reason:
            "GitHub /branches/main returned 404 and GITHUB_API_TOKEN is not configured. The repo is likely private; set a fine-grained PAT (Contents+Metadata read) on Railway to enable strict verification.",
          unverifiable: true,
        };
      }
      // 401/403 with no token = same root cause; treat as unverifiable.
      if ((branchRes.status === 401 || branchRes.status === 403) && !tokenConfigured) {
        return {
          onMain: false,
          status: "unverifiable_no_token",
          mainHead: null,
          reason: `GitHub /branches/main returned HTTP ${branchRes.status} and GITHUB_API_TOKEN is not configured.`,
          unverifiable: true,
        };
      }
      return {
        onMain: false,
        status: "branch_fetch_failed",
        mainHead: null,
        reason: `GitHub /branches/${MAIN_BRANCH} returned HTTP ${branchRes.status}`,
        unverifiable: false,
      };
    }
    const branchJson = (await branchRes.json()) as {
      commit?: { sha?: string };
    };
    if (!branchJson.commit?.sha) {
      return {
        onMain: false,
        status: "branch_no_sha",
        mainHead: null,
        reason: "GitHub /branches response missing commit.sha",
        unverifiable: false,
      };
    }
    mainHead = branchJson.commit.sha;
  } catch (err) {
    return {
      onMain: false,
      status: "branch_fetch_error",
      mainHead: null,
      reason: err instanceof Error ? err.message : String(err),
      unverifiable: false,
    };
  }

  // Identical-by-prefix shortcut.
  const a = commitSha.toLowerCase();
  const b = mainHead.toLowerCase();
  if (a === b || b.startsWith(a) || a.startsWith(b)) {
    return { onMain: true, status: "identical", mainHead, unverifiable: false };
  }

  // 2. Compare candidate → mainHead.
  try {
    const cmpRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/compare/${commitSha}...${mainHead}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    if (cmpRes.status === 404) {
      return {
        onMain: false,
        status: "not_found",
        mainHead,
        reason: `commit ${commitSha} not reachable from ${MAIN_BRANCH} HEAD ${mainHead.slice(0, 12)}`,
        unverifiable: false,
      };
    }
    if (!cmpRes.ok) {
      return {
        onMain: false,
        status: "compare_failed",
        mainHead,
        reason: `GitHub /compare returned HTTP ${cmpRes.status}`,
        unverifiable: false,
      };
    }
    const cmpJson = (await cmpRes.json()) as { status?: string };
    const cmpStatus = cmpJson.status ?? "unknown";

    if (cmpStatus === "identical" || cmpStatus === "behind") {
      return { onMain: true, status: cmpStatus, mainHead, unverifiable: false };
    }
    return {
      onMain: false,
      status: cmpStatus,
      mainHead,
      reason: `commit ${commitSha} is "${cmpStatus}" relative to ${MAIN_BRANCH} — not reachable from main`,
      unverifiable: false,
    };
  } catch (err) {
    return {
      onMain: false,
      status: "compare_error",
      mainHead,
      reason: err instanceof Error ? err.message : String(err),
      unverifiable: false,
    };
  }
}
