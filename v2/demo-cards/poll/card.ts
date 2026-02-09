import { createHash } from 'node:crypto';
import { defineCard } from '@hashdo/core';

/** Derive a deterministic poll ID from question + options (6 hex chars). */
function derivePollId(question: string, options: string): string {
  return createHash('sha256')
    .update(`${question}|${options}`)
    .digest('hex')
    .slice(0, 6);
}

export default defineCard({
  name: 'do-poll',
  description:
    'Create or open an interactive poll. Usage: "#do/poll" with question + options creates a new poll. "#do/poll <id>" (e.g. "#do/poll 71a1bc") opens an existing poll by its 6-character hex ID — pass the ID as the "id" parameter, do NOT pass question or options when opening by ID.',

  inputs: {
    id: {
      type: 'string',
      required: false,
      description:
        'Poll ID (6-character hex string). When the user types "#do/poll 71a1bc", map "71a1bc" to this parameter. Omit only when creating a brand-new poll.',
    },
    question: {
      type: 'string',
      required: false,
      default: 'What is your favorite option?',
      description: 'The poll question (required when creating a new poll)',
    },
    options: {
      type: 'string',
      required: false,
      default: 'Option A, Option B, Option C',
      description:
        'Comma-separated list of options (required when creating, e.g. "TypeScript, Python, Rust")',
    },
    allowMultiple: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow voters to select multiple options',
    },
  },

  stateKey: (inputs) => {
    const id = inputs.id as string | undefined;
    if (id) return `id:${id}`;
    const question = inputs.question as string | undefined;
    const options = inputs.options as string | undefined;
    if (question && options) return `id:${derivePollId(question, options)}`;
    return undefined;
  },

  async getData({ inputs, state }) {
    const inputId = inputs.id as string | undefined;
    const inputQuestion = inputs.question as string | undefined;
    const inputOptions = inputs.options as string | undefined;

    // Determine poll ID — use explicit id, stored id, or derive from question+options
    const pollId =
      inputId ||
      (state.pollId as string) ||
      (inputQuestion && inputOptions
        ? derivePollId(inputQuestion, inputOptions)
        : undefined);

    if (!pollId) {
      throw new Error(
        'Cannot determine poll ID. Provide an id, or both question and options.'
      );
    }

    // When opening by ID, prefer state (input values may just be schema defaults).
    // When creating, prefer inputs.
    const question = inputId
      ? (state.pollQuestion as string) || inputQuestion || undefined
      : inputQuestion || (state.pollQuestion as string) || undefined;
    const optionsRaw = inputId
      ? (state.pollOptions as string) || inputOptions || undefined
      : inputOptions || (state.pollOptions as string) || undefined;

    if (!question || !optionsRaw) {
      if (inputId) {
        throw new Error(
          `Poll "${inputId}" not found. It may have expired or never existed.`
        );
      }
      throw new Error(
        'A new poll requires both "question" and "options" inputs.'
      );
    }

    const optionNames = optionsRaw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (optionNames.length < 2) {
      throw new Error('A poll needs at least 2 options (comma-separated).');
    }

    // Restore or initialize vote tallies
    const votes = (state.votes as Record<string, number>) ?? {};
    for (const name of optionNames) {
      if (votes[name] === undefined) votes[name] = 0;
    }

    const totalVotes = Object.values(votes).reduce((sum, n) => sum + n, 0);
    const closed = (state.closed as boolean) ?? false;
    const voterCount = (state.voterCount as number) ?? 0;

    // Build per-option view data
    const colors = [
      '#6366f1', '#f59e0b', '#10b981', '#ef4444',
      '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    ];

    const optionData = optionNames.map((name, i) => {
      const count = votes[name] ?? 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return {
        name,
        count,
        pct,
        color: colors[i % colors.length],
      };
    });

    // Text output for AI chat clients
    let textOutput = `## Poll: ${question}\n`;
    textOutput += `**Poll ID:** \`${pollId}\`\n\n`;
    if (closed) textOutput += '**This poll is closed.**\n\n';
    textOutput += `**${totalVotes}** vote${totalVotes !== 1 ? 's' : ''} from **${voterCount}** voter${voterCount !== 1 ? 's' : ''}\n\n`;
    for (const opt of optionData) {
      const bar = '\u2588'.repeat(Math.round(opt.pct / 5)) || '\u2591';
      textOutput += `- **${opt.name}** ${bar} ${opt.pct}% (${opt.count})\n`;
    }
    textOutput += `\nTo vote: use the **vote** action with this poll's id (\`${pollId}\`).`;
    textOutput += `\nTo reopen later: \`#do/poll ${pollId}\``;

    return {
      viewModel: {
        pollId,
        question,
        options: optionData,
        totalVotes,
        voterCount,
        closed,
        allowMultiple: inputs.allowMultiple ?? false,
        apiBaseUrl: process.env['BASE_URL'] ?? '',
      },
      textOutput,
      state: {
        ...state,
        pollId,
        pollQuestion: question,
        pollOptions: optionsRaw,
        votes,
        closed,
        voterCount,
      },
    };
  },

  actions: {
    vote: {
      label: 'Vote',
      description:
        'Cast a vote for one (or more) options. Use the exact option name.',
      inputs: {
        choice: {
          type: 'string',
          required: true,
          description: 'The option name to vote for (must match an existing option exactly)',
        },
      },
      async handler({ state, actionInputs }) {
        if (state.closed) {
          return { message: 'This poll is closed. No more votes can be cast.' };
        }

        const choice = (actionInputs.choice as string).trim();
        const optionNames = ((state.pollOptions as string) ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

        if (!optionNames.includes(choice)) {
          return {
            message: `"${choice}" is not a valid option. Choose from: ${optionNames.join(', ')}`,
          };
        }

        const votes = (state.votes as Record<string, number>) ?? {};
        votes[choice] = (votes[choice] ?? 0) + 1;
        const voterCount = ((state.voterCount as number) ?? 0) + 1;

        const totalVotes = Object.values(votes).reduce((sum, n) => sum + n, 0);
        const pct = Math.round((votes[choice] / totalVotes) * 100);

        return {
          state: { ...state, votes, voterCount },
          message: `Vote recorded for "${choice}". It now has ${votes[choice]} vote${votes[choice] !== 1 ? 's' : ''} (${pct}%).`,
        };
      },
    },

    close: {
      label: 'Close Poll',
      description: 'Close the poll so no more votes can be cast',
      permission: 'confirm',
      async handler({ state }) {
        if (state.closed) {
          return { message: 'Poll is already closed.' };
        }
        return {
          state: { ...state, closed: true },
          message: 'Poll has been closed. No further votes will be accepted.',
        };
      },
    },

    reopen: {
      label: 'Reopen Poll',
      description: 'Reopen a closed poll to accept votes again',
      async handler({ state }) {
        if (!state.closed) {
          return { message: 'Poll is already open.' };
        }
        return {
          state: { ...state, closed: false },
          message: 'Poll has been reopened. Votes are being accepted again.',
        };
      },
    },

    reset: {
      label: 'Reset Votes',
      description: 'Clear all votes and start fresh',
      permission: 'confirm',
      async handler({ state }) {
        const optionNames = ((state.pollOptions as string) ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        const votes: Record<string, number> = {};
        for (const name of optionNames) votes[name] = 0;

        return {
          state: { ...state, votes, voterCount: 0 },
          message: 'All votes have been reset to zero.',
        };
      },
    },
  },

  template: (vm) => {
    const pollId = vm.pollId as string;
    const options = vm.options as Array<{
      name: string;
      count: number;
      pct: number;
      color: string;
    }>;
    const closed = vm.closed as boolean;
    const question = vm.question as string;
    const checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const optionRows = options
      .map(
        (opt, i) => `
      <div class="poll-option" data-index="${i}" data-color="${opt.color}" data-name="${opt.name}">
        <div class="poll-bar" data-bar></div>
        <div class="poll-content">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="poll-dot" data-dot>${checkSvg}</div>
            <span style="font-size:15px;font-weight:500;color:#1f2937">${opt.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="poll-pct" data-pct style="color:${opt.color}">0%</span>
            <span class="poll-count" data-count style="font-size:12px;color:#9ca3af">(0)</span>
          </div>
        </div>
      </div>`
      )
      .join('');

    return `
    <div class="poll-card" data-closed="${closed}" data-poll-id="${pollId}" data-api="${vm.apiBaseUrl as string}">
      <style>
        .poll-card{font-family:'SF Pro Display',system-ui,-apple-system,sans-serif;max-width:400px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
        .poll-header{padding:24px 24px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
        .poll-id{display:inline-block;font-family:'SF Mono',monospace;font-size:11px;font-weight:500;background:rgba(255,255,255,.2);padding:3px 8px;border-radius:6px;letter-spacing:.04em}
        .poll-option{border:2px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
        .poll-option:hover{transform:translateX(2px)}
        .poll-card[data-closed="true"] .poll-option{cursor:default}
        .poll-card[data-closed="true"] .poll-option:hover{transform:none}
        .poll-bar{position:absolute;top:0;left:0;bottom:0;width:0;transition:width .6s ease}
        .poll-content{position:relative;display:flex;align-items:center;justify-content:space-between}
        .poll-dot{width:22px;height:22px;border-radius:50%;border:2px solid #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:transparent;transition:background .2s}
        .poll-dot svg{opacity:0;transition:opacity .2s}
        .poll-dot.voted{background:var(--c);border-color:var(--c)}
        .poll-dot.voted svg{opacity:1}
        .poll-pct{font-size:14px;font-weight:600}
        .poll-footer{padding:14px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center}
        .poll-footer span{font-size:13px;color:#6b7280;font-weight:500}
        .poll-footer .poll-voters{font-size:12px;color:#9ca3af;font-weight:400}
      </style>
      <div class="poll-header">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="12" width="4" height="9" rx="1" fill="white" opacity="0.7"/>
              <rect x="10" y="7" width="4" height="14" rx="1" fill="white" opacity="0.85"/>
              <rect x="17" y="3" width="4" height="18" rx="1" fill="white"/>
            </svg>
            <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;opacity:.85" data-status>
              ${closed ? 'Poll Closed' : 'Live Poll'}
            </span>
          </div>
          <span class="poll-id">${pollId}</span>
        </div>
        <div style="font-size:20px;font-weight:700;line-height:1.3;letter-spacing:-.01em">${question}</div>
      </div>
      <div style="padding:20px 20px 8px" data-options>${optionRows}</div>
      <div class="poll-footer">
        <span data-total>0 votes</span>
        <span class="poll-voters"><span data-voters>0</span> voter${closed ? ' &middot; Final results' : ''}</span>
      </div>
      <script>
        (function(){
          var cards = document.querySelectorAll('.poll-card');
          var root = cards[cards.length - 1];
          var isClosed = root.dataset.closed === 'true';
          var opts = root.querySelectorAll('.poll-option');
          var colors = [];
          var counts = [];
          var voters = 0;

          opts.forEach(function(el, i) {
            colors[i] = el.dataset.color;
            counts[i] = 0;
            el.style.borderColor = colors[i] + '33';
            var dot = el.querySelector('[data-dot]');
            dot.style.borderColor = colors[i];
            dot.style.setProperty('--c', colors[i]);
          });

          function render() {
            var total = counts.reduce(function(s, n) { return s + n; }, 0);
            opts.forEach(function(el, i) {
              var pct = total > 0 ? Math.round(counts[i] / total * 100) : 0;
              el.querySelector('[data-bar]').style.width = pct + '%';
              el.querySelector('[data-bar]').style.background = colors[i] + '11';
              el.querySelector('[data-pct]').textContent = pct + '%';
              el.querySelector('[data-count]').textContent = '(' + counts[i] + ')';
              var dot = el.querySelector('[data-dot]');
              if (counts[i] > 0) dot.classList.add('voted');
              else dot.classList.remove('voted');
            });
            root.querySelector('[data-total]').textContent = total + ' vote' + (total !== 1 ? 's' : '');
            root.querySelector('[data-voters]').textContent = voters;
          }

          render();

          if (!isClosed) {
            var apiBase = root.dataset.api || '';
            var pollId = root.dataset.pollId;
            opts.forEach(function(el, i) {
              el.addEventListener('click', function() {
                // Optimistic update
                counts[i]++;
                voters++;
                render();
                // Persist vote to server
                var optName = el.dataset.name;
                fetch(apiBase + '/api/cards/do-poll/action/vote', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pollId, choice: optName })
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                  if (data.error) { counts[i]--; voters--; render(); return; }
                  if (data.state && data.state.votes) {
                    opts.forEach(function(o, j) {
                      var n = o.dataset.name;
                      if (data.state.votes[n] !== undefined) counts[j] = data.state.votes[n];
                    });
                    if (data.state.voterCount !== null) voters = data.state.voterCount;
                    render();
                  }
                })
                .catch(function() { counts[i]--; voters--; render(); });
              });
            });
          }
        })();
      </script>
    </div>`;
  },
});
