/**
 * Dispatches the GitHub Actions workflow that does the actual sending.
 *
 * Every send - daily cron, dashboard button, one-off wish - goes through the
 * same workflow, so there is exactly one submission path, one sent-log, and
 * one sender reputation. The Worker never talks SMTP for real sends; it asks
 * GitHub to run the proven Python sender instead.
 */

import type { Env } from "../env";

const API = "https://api.github.com";

export class GitHubError extends Error {}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "birthday-email-system",
    "Content-Type": "application/json",
  };
}

function requireConfig(env: Env): { token: string; repo: string; workflow: string } {
  if (!env.GH_PAT) {
    throw new GitHubError(
      "GH_PAT is not set. Create a fine-grained GitHub token with Actions " +
        "read/write on the repository and add it with: wrangler secret put GH_PAT",
    );
  }
  const repo = env.GITHUB_REPO;
  if (!repo) throw new GitHubError("GITHUB_REPO is not configured.");
  return { token: env.GH_PAT, repo, workflow: env.GITHUB_WORKFLOW || "birthday.yml" };
}

/** Fires the workflow. GitHub returns 204 with no body on success. */
export async function dispatchWorkflow(
  env: Env,
  inputs: Record<string, string>,
): Promise<{ actionsUrl: string }> {
  const { token, repo, workflow } = requireConfig(env);

  const res = await fetch(
    `${API}/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ ref: "main", inputs }),
    },
  );

  if (res.status !== 204) {
    const body = await res.text().catch(() => "");
    throw new GitHubError(
      `GitHub refused the dispatch (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  return { actionsUrl: `https://github.com/${repo}/actions` };
}

/** The most recent runs, so the dashboard can show what happened. */
export async function recentRuns(env: Env, limit = 5): Promise<
  Array<{ status: string; conclusion: string | null; startedAt: string; url: string }>
> {
  const { token, repo, workflow } = requireConfig(env);

  const res = await fetch(
    `${API}/repos/${repo}/actions/workflows/${workflow}/runs?per_page=${limit}`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    throw new GitHubError(`Could not list workflow runs (${res.status}).`);
  }

  const data = (await res.json()) as {
    workflow_runs: Array<{
      status: string;
      conclusion: string | null;
      run_started_at: string;
      html_url: string;
    }>;
  };

  return data.workflow_runs.map((run) => ({
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.run_started_at,
    url: run.html_url,
  }));
}
