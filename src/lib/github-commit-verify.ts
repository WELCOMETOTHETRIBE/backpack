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
 * Verification path: GET https://api.github.com/repos/{repo}/branches/main
 *   → has { commit: { sha } } for the current main HEAD
 *   then GET .../compare/{candidate}...{mainHead}
 *   → response.status is one of: identical, behind, ahead, diverged
 *     - identical = candidate IS main HEAD              → on main
 *     - behind    = candidate is an ancestor of main    → on main
 *     - ahead     = candidate is descendant (newer)     → NOT on main yet
 *     - diverged  = candidate diverged from main         → NOT on main
 *
 * "behind" is the success case for our use because the candidate is
 * older than main HEAD but reachable from it — the deploy already
 * picked it up.
 *
 * Auth: optional. Public repos work unauthenticated up to 60 req/hr.
 * Set GITHUB_API_TOKEN to bump to 5000/hr (a fine-grained PAT scoped
 * read-only to the WELCOMETOTHETRIBE/CMMC repo's contents is enough).
 */

const GITHUB_REPO =
  process.env.AGENT_VERIFY_REPO ?? "WELCOMETOTHETRIBE/CMMC";
const MAIN_BRANCH = process.env.AGENT_VERIFY_MAIN_BRANCH ?? "main";

interface VerifyResult {
  /** True iff the candidate SHA is reachable from main HEAD. */
  onMain: boolean;
  /** GitHub's compare status: identical | behind | ahead | diverged | unknown. */
  status: string;
  /** main HEAD SHA at verification time (handy for logging). */
  mainHead: string | null;
  /** Free-form reason when onMain is false (rate limit, 404, etc). */
  reason?: string;
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

/**
 * Verify a commit SHA is reachable from origin/main on the configured
 * repo. Best-effort: any GitHub API error is treated as `onMain=false`
 * with a reason, so /complete can refuse the resolution rather than
 * silently trust an agent that may be lying.
 */
export async function verifyCommitOnMain(
  commitSha: string,
): Promise<VerifyResult> {
  if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) {
    return { onMain: false, status: "invalid", mainHead: null, reason: "commitSha is not a valid hex SHA" };
  }

  // 1. Fetch main HEAD.
  let mainHead: string;
  try {
    const branchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/branches/${MAIN_BRANCH}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    if (!branchRes.ok) {
      return {
        onMain: false,
        status: "branch_fetch_failed",
        mainHead: null,
        reason: `GitHub /branches/${MAIN_BRANCH} returned HTTP ${branchRes.status}`,
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
      };
    }
    mainHead = branchJson.commit.sha;
  } catch (err) {
    return {
      onMain: false,
      status: "branch_fetch_error",
      mainHead: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // Identical-by-prefix shortcut: if the candidate is a prefix of main
  // HEAD (or vice-versa), they're the same commit and we can skip the
  // compare round-trip.
  const a = commitSha.toLowerCase();
  const b = mainHead.toLowerCase();
  if (a === b || b.startsWith(a) || a.startsWith(b)) {
    return { onMain: true, status: "identical", mainHead };
  }

  // 2. Compare candidate → mainHead. The "status" field tells us the
  // relationship.
  try {
    const cmpRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/compare/${commitSha}...${mainHead}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    if (cmpRes.status === 404) {
      // Either the candidate SHA doesn't exist in the repo at all (agent
      // pushed only locally and reported a sha that GitHub never saw),
      // or it exists only on a branch that GitHub can compare from but
      // returns 404 because it's unreachable. Both are "not on main."
      return {
        onMain: false,
        status: "not_found",
        mainHead,
        reason: `commit ${commitSha} not reachable from ${MAIN_BRANCH} HEAD ${mainHead.slice(0, 12)}`,
      };
    }
    if (!cmpRes.ok) {
      return {
        onMain: false,
        status: "compare_failed",
        mainHead,
        reason: `GitHub /compare returned HTTP ${cmpRes.status}`,
      };
    }
    const cmpJson = (await cmpRes.json()) as { status?: string };
    const cmpStatus = cmpJson.status ?? "unknown";

    // candidate...mainHead semantics:
    //   "identical" → same commit
    //   "behind"    → candidate is an ANCESTOR of mainHead → on main ✓
    //   "ahead"     → candidate is a DESCENDANT of mainHead → newer than main
    //   "diverged"  → candidate is on a sibling branch
    if (cmpStatus === "identical" || cmpStatus === "behind") {
      return { onMain: true, status: cmpStatus, mainHead };
    }
    return {
      onMain: false,
      status: cmpStatus,
      mainHead,
      reason: `commit ${commitSha} is "${cmpStatus}" relative to ${MAIN_BRANCH} — not reachable from main`,
    };
  } catch (err) {
    return {
      onMain: false,
      status: "compare_error",
      mainHead,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
