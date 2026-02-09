import { defineCard } from '@hashdo/core';

/**
 * #do/repo — GitHub repository profile card.
 *
 * Uses the GitHub REST API (free, no auth for public repos).
 * Shows repo stats, description, language, topics, and license.
 * Users can star/bookmark repos in a personal list with stateful actions.
 */
export default defineCard({
  name: 'do-repo',
  description:
    'Look up any public GitHub repository. Shows stars, forks, language, description, topics, and license. All parameters have defaults — call this tool immediately without asking the user for parameters. If the user mentions a repo, pass it; otherwise use defaults.',

  inputs: {
    repo: {
      type: 'string',
      required: false,
      default: 'facebook/react',
      description:
        'Repository in "owner/name" format (e.g. "facebook/react", "torvalds/linux") or a GitHub URL. Has a sensible default — only override if the user specifies a repo.',
    },
  },

  async getData({ inputs, state }) {
    const raw = ((inputs.repo as string) ?? 'shauntrennery/hashdo').trim();
    if (!raw) {
      throw new Error('Please provide a repository in "owner/name" format.');
    }

    // ── 1. Parse repo identifier ───────────────────────────────────────
    const slug = parseRepoSlug(raw) ?? await searchRepo(raw);
    if (!slug) {
      throw new Error(
        `No repository found for "${raw}". Try "owner/name" format (e.g. "facebook/react").`
      );
    }

    // ── 2. Fetch repo data from GitHub API ─────────────────────────────
    const repo = await fetchRepo(slug.owner, slug.name);
    if (!repo) {
      throw new Error(
        `Repository "${slug.owner}/${slug.name}" not found. It may be private or misspelled.`
      );
    }

    // ── 3. Bookmarks state ─────────────────────────────────────────────
    const bookmarks = (state.bookmarks as string[]) ?? [];
    const fullName = repo.fullName;
    const isBookmarked = bookmarks.includes(fullName);

    // ── 4. Pick accent from language ───────────────────────────────────
    const accent = languageColor(repo.language);

    // ── 5. Format timestamps ───────────────────────────────────────────
    const updatedAgo = timeAgo(repo.pushedAt);

    // ── 6. Build text output ───────────────────────────────────────────
    let textOutput = `## ${repo.fullName}\n\n`;
    if (repo.description) {
      textOutput += `${repo.description}\n\n`;
    }
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Stars | ${formatCount(repo.stars)} |\n`;
    textOutput += `| Forks | ${formatCount(repo.forks)} |\n`;
    textOutput += `| Open Issues | ${formatCount(repo.openIssues)} |\n`;
    if (repo.language) {
      textOutput += `| Language | ${repo.language} |\n`;
    }
    if (repo.license) {
      textOutput += `| License | ${repo.license} |\n`;
    }
    textOutput += `| Last push | ${updatedAgo} |\n`;
    if (repo.topics.length > 0) {
      textOutput += `\n**Topics:** ${repo.topics.join(', ')}\n`;
    }
    textOutput += `\n[View on GitHub](${repo.htmlUrl})\n`;

    // ── 7. Build viewModel ─────────────────────────────────────────────
    const viewModel = {
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
      ownerAvatar: repo.ownerAvatar,
      description: repo.description,
      stars: formatCount(repo.stars),
      starsRaw: repo.stars,
      forks: formatCount(repo.forks),
      openIssues: formatCount(repo.openIssues),
      language: repo.language,
      license: repo.license,
      topics: repo.topics.slice(0, 6),
      htmlUrl: repo.htmlUrl,
      updatedAgo,
      accent,
      isBookmarked,
      bookmarkCount: bookmarks.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lastRepo: fullName,
        lookupCount: ((state.lookupCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    bookmark: {
      label: 'Bookmark Repo',
      description: 'Save this repository to your bookmarks',
      inputs: {
        repo: { type: 'string', required: true, description: 'Full repo name (owner/name)' },
      },
      async handler({ actionInputs, state }) {
        const bookmarks = (state.bookmarks as string[]) ?? [];
        const repo = actionInputs.repo as string;

        if (bookmarks.includes(repo)) {
          return { message: `${repo} is already bookmarked.` };
        }

        bookmarks.push(repo);
        return {
          state: { ...state, bookmarks },
          message: `Bookmarked ${repo}! (${bookmarks.length} total)`,
        };
      },
    },

    removeBookmark: {
      label: 'Remove Bookmark',
      description: 'Remove this repo from bookmarks',
      inputs: {
        repo: { type: 'string', required: true, description: 'Full repo name (owner/name)' },
      },
      async handler({ actionInputs, state }) {
        const bookmarks = (state.bookmarks as string[]) ?? [];
        const repo = actionInputs.repo as string;
        const idx = bookmarks.indexOf(repo);

        if (idx < 0) {
          return { message: `${repo} is not bookmarked.` };
        }

        bookmarks.splice(idx, 1);
        return {
          state: { ...state, bookmarks },
          message: `Removed ${repo}. (${bookmarks.length} remaining)`,
        };
      },
    },

    showBookmarks: {
      label: 'Show Bookmarks',
      description: 'List all bookmarked repositories',
      async handler({ state }) {
        const bookmarks = (state.bookmarks as string[]) ?? [];
        if (bookmarks.length === 0) {
          return { message: 'No bookmarked repositories yet.' };
        }
        return {
          message: `Bookmarked repos (${bookmarks.length}):\n${bookmarks.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    const topics = (vm.topics as string[]);

    const topicPills = topics.length > 0
      ? `<div style="padding:0 24px 16px; display:flex; gap:6px; flex-wrap:wrap;">
          ${topics.map((t: string) => `<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:500; background:#f0f4ff; color:#4f46e5; border:1px solid #e0e7ff;">${t}</span>`).join('')}
        </div>`
      : '';

    return `
      <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:400px; border-radius:20px; overflow:hidden; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,0.12);">
        <!-- Header -->
        <div style="padding:24px 24px 16px; background:${vm.accent};">
          <div style="display:flex; gap:14px; align-items:center;">
            <img src="${vm.ownerAvatar}" alt="${vm.owner}"
                 style="width:48px; height:48px; border-radius:12px; border:2px solid rgba(255,255,255,0.3);" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; color:rgba(255,255,255,0.8);">${vm.owner}</div>
              <div style="font-size:22px; font-weight:700; color:#fff; letter-spacing:-0.02em; line-height:1.2; overflow:hidden; text-overflow:ellipsis;">
                ${vm.name}
              </div>
            </div>
            ${vm.isBookmarked ? `
            <span style="padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(255,255,255,0.2); color:#fff; flex-shrink:0;">
              Bookmarked
            </span>
            ` : ''}
          </div>
        </div>

        <!-- Description -->
        ${vm.description ? `
        <div style="padding:16px 24px 12px;">
          <div style="font-size:14px; color:#4b5563; line-height:1.5;">
            ${vm.description}
          </div>
        </div>
        ` : ''}

        <!-- Stats row -->
        <div style="padding:4px 24px 16px; display:flex; gap:10px;">
          <div style="flex:1; background:#fefce8; border-radius:12px; padding:10px 12px; text-align:center;">
            <div style="font-size:18px; font-weight:700; color:#ca8a04;">${vm.stars}</div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#a16207; margin-top:2px;">Stars</div>
          </div>
          <div style="flex:1; background:#f0fdf4; border-radius:12px; padding:10px 12px; text-align:center;">
            <div style="font-size:18px; font-weight:700; color:#16a34a;">${vm.forks}</div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#15803d; margin-top:2px;">Forks</div>
          </div>
          <div style="flex:1; background:#fef2f2; border-radius:12px; padding:10px 12px; text-align:center;">
            <div style="font-size:18px; font-weight:700; color:#dc2626;">${vm.openIssues}</div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#b91c1c; margin-top:2px;">Issues</div>
          </div>
        </div>

        <!-- Topics -->
        ${topicPills}

        <!-- Meta footer -->
        <div style="padding:12px 24px 16px; border-top:1px solid #f3f4f6;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:12px; align-items:center; font-size:12px; color:#6b7280;">
              ${vm.language ? `
              <span style="display:flex; align-items:center; gap:4px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${vm.accent};"></span>
                ${vm.language}
              </span>
              ` : ''}
              ${vm.license ? `<span>${vm.license}</span>` : ''}
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="font-size:11px; color:#9ca3af;">Updated ${vm.updatedAgo}</span>
              <a href="${vm.htmlUrl}" target="_blank" rel="noopener"
                 style="font-size:12px; color:#4f46e5; text-decoration:none; font-weight:500;">
                GitHub &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface RepoData {
  fullName: string;
  owner: string;
  name: string;
  ownerAvatar: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  license: string | null;
  topics: string[];
  htmlUrl: string;
  createdAt: string;
  pushedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a repo slug from "owner/name" or a GitHub URL */
function parseRepoSlug(input: string): { owner: string; name: string } | null {
  // Try URL format: https://github.com/owner/name
  const urlMatch = input.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], name: urlMatch[2].replace(/\.git$/, '') };
  }

  // Try owner/name format
  const slashMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) {
    return { owner: slashMatch[1], name: slashMatch[2] };
  }

  return null;
}

/** Search GitHub for a repo by keyword, return the top result as owner/name */
async function searchRepo(query: string): Promise<{ owner: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+in:name&sort=stars&per_page=1`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'HashDo/2.0 (https://github.com/shauntrennery/hashdo)',
        },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const item = data.items?.[0];
    if (!item) return null;
    return { owner: item.owner?.login, name: item.name };
  } catch {
    return null;
  }
}

/** Fetch repository data from the GitHub REST API */
async function fetchRepo(owner: string, name: string): Promise<RepoData | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'HashDo/2.0 (https://github.com/shauntrennery/hashdo)',
        },
      }
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;

    return {
      fullName: data.full_name ?? `${owner}/${name}`,
      owner: data.owner?.login ?? owner,
      name: data.name ?? name,
      ownerAvatar: data.owner?.avatar_url ?? '',
      description: data.description ?? '',
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      language: data.language ?? null,
      license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION'
        ? data.license.spdx_id
        : null,
      topics: data.topics ?? [],
      htmlUrl: data.html_url ?? `https://github.com/${owner}/${name}`,
      createdAt: data.created_at ?? '',
      pushedAt: data.pushed_at ?? '',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[repo] ${detail}`);
    throw new Error(`Failed to fetch repository: ${detail}`);
  }
}

/** Format a large number compactly (1.2k, 45.3k, 1.2M) */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Relative time string from an ISO date */
function timeAgo(iso: string): string {
  if (!iso) return 'unknown';
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  } catch {
    return 'unknown';
  }
}

/** GitHub-style language color */
function languageColor(lang: string | null): string {
  if (!lang) return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';

  const colors: Record<string, string> = {
    'JavaScript': '#f1e05a',
    'TypeScript': '#3178c6',
    'Python': '#3572A5',
    'Java': '#b07219',
    'Go': '#00ADD8',
    'Rust': '#dea584',
    'C++': '#f34b7d',
    'C': '#555555',
    'C#': '#178600',
    'Ruby': '#701516',
    'PHP': '#4F5D95',
    'Swift': '#F05138',
    'Kotlin': '#A97BFF',
    'Dart': '#00B4AB',
    'Scala': '#c22d40',
    'Shell': '#89e051',
    'HTML': '#e34c26',
    'CSS': '#563d7c',
    'Vue': '#41b883',
    'Svelte': '#ff3e00',
  };

  const solid = colors[lang];
  if (solid) return `linear-gradient(135deg, ${solid} 0%, ${solid}dd 100%)`;
  return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
}
