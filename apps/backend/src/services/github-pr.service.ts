/**
 * Round-trips a seed-file edit back to the repo. Two modes, chosen by config:
 *
 *   1. GitHub API mode (GITHUB_TOKEN + GITHUB_REPO set) — fetches the base
 *      branch tip, creates a new branch, commits the file change via the
 *      Contents API, opens a PR. This is the prod path: the EC2 filesystem
 *      is ephemeral and the seed file is baked into the image, so the only
 *      way an admin edit survives is by landing in git.
 *
 *   2. Local-file mode (GITHUB_TOKEN unset) — writes the rewritten file to
 *      `SEEDS_DIR` (bind-mounted at /app/scripts/seeds in dev). The operator
 *      commits manually. Convenient for local development; will not persist
 *      across container rebuild in prod.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

export interface SeedFileEdit {
  fileName: string;
  rewriteFile: (originalContent: string) => string;
  /** One-line summary used in commit message + PR title. */
  summary: string;
}

export interface PushResult {
  mode: 'github' | 'local';
  /** PR URL — only set in `github` mode. */
  pullRequestUrl?: string;
  /** Branch name on the remote — only set in `github` mode. */
  branch?: string;
  /** Absolute path on disk — only set in `local` mode. */
  localPath?: string;
}

export class GithubPushError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GithubPushError';
  }
}

const API_BASE = 'https://api.github.com';

function githubMode(): boolean {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
}

/**
 * Slug used for the per-edit branch name. Truncates aggressively because
 * GitHub refs have a 255-byte limit and downstream tooling (the PR list view)
 * is brutal on long names.
 */
function slugify(s: string, max = 40): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

async function gh<T>(token: string, urlPath: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GithubPushError(`GitHub API ${res.status} ${res.statusText} on ${urlPath}: ${body}`);
  }
  return res.json() as Promise<T>;
}

interface GetBranchResponse { commit: { sha: string } }
interface GetContentResponse { sha: string; content: string; encoding: string }
interface CreatePrResponse { html_url: string; number: number }

export async function pushSeedEdit(
  edit: SeedFileEdit,
  meta: { stickerLabel: string; actorUsername: string },
): Promise<PushResult> {
  if (!githubMode()) {
    return await writeLocalSeedFile(edit);
  }
  return await openSeedEditPr(edit, meta);
}

async function writeLocalSeedFile(edit: SeedFileEdit): Promise<PushResult> {
  const filePath = path.join(env.SEEDS_DIR, edit.fileName);
  const original = await fs.readFile(filePath, 'utf8');
  const updated = edit.rewriteFile(original);
  if (updated !== original) {
    await fs.writeFile(filePath, updated, 'utf8');
  }
  return { mode: 'local', localPath: filePath };
}

async function openSeedEditPr(
  edit: SeedFileEdit,
  meta: { stickerLabel: string; actorUsername: string },
): Promise<PushResult> {
  const token = env.GITHUB_TOKEN!;
  const repo = env.GITHUB_REPO!;
  const baseBranch = env.GITHUB_BASE_BRANCH;

  // 1. Resolve the base branch tip so we know what to fork off of.
  const baseBranchInfo = await gh<GetBranchResponse>(token, `/repos/${repo}/branches/${encodeURIComponent(baseBranch)}`);
  const baseSha = baseBranchInfo.commit.sha;

  // 2. Build the new branch name. Per-edit so concurrent admin saves don't
  //    collide on the same branch tip; the timestamp keeps it unique even
  //    if the same sticker is edited twice in a row.
  const branch = `cromo-admin-${slugify(meta.stickerLabel)}-${Date.now()}`;
  await gh(token, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });

  // 3. Read the file at the base branch via Contents API to get the
  //    existing blob SHA (required by PUT to avoid clobbering).
  const filePath = `scripts/seeds/${edit.fileName}`;
  const existing = await gh<GetContentResponse>(
    token,
    `/repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(baseBranch)}`,
  );
  const original = Buffer.from(existing.content, existing.encoding as BufferEncoding).toString('utf8');
  const updated = edit.rewriteFile(original);
  if (updated === original) {
    throw new GithubPushError(
      `Seed file ${edit.fileName} unchanged after rewrite — admin PATCH would be a no-op in git.`,
    );
  }

  // 4. PUT the new content onto the new branch. The Contents API takes care
  //    of creating a commit on the branch tip for us — no Git Data dance.
  await gh(token, `/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Admin sticker edit: ${edit.summary}`,
      content: Buffer.from(updated, 'utf8').toString('base64'),
      sha: existing.sha,
      branch,
    }),
  });

  // 5. Open the PR. Body cites who made the edit so reviewers know it's an
  //    intentional admin action and not a stray dev commit.
  const pr = await gh<CreatePrResponse>(token, `/repos/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Admin edit: ${meta.stickerLabel}`,
      head: branch,
      base: baseBranch,
      body: [
        `Generated by **${meta.actorUsername}** via the admin UI.`,
        '',
        `**Change:** ${edit.summary}`,
        '',
        '> ⚠️ The live DB already reflects this edit. Until this PR merges and',
        '> deploys, a backend restart will reseed the row back to its pre-edit',
        '> value (the seed file is the source of truth).',
      ].join('\n'),
    }),
  });

  return { mode: 'github', pullRequestUrl: pr.html_url, branch };
}
