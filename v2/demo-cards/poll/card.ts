import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'do-poll',
  description:
    'Create an interactive poll or survey. Users vote on options and see live results with percentages.',

  inputs: {
    question: {
      type: 'string',
      required: true,
      description: 'The poll question to ask (e.g. "What is your favorite language?")',
    },
    options: {
      type: 'string',
      required: true,
      description:
        'Comma-separated list of options (e.g. "TypeScript, Python, Rust, Go")',
    },
    allowMultiple: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow voters to select multiple options',
    },
  },

  async getData({ inputs, state }) {
    const question = inputs.question as string;
    const optionNames = (inputs.options as string)
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
    let textOutput = `## Poll: ${question}\n\n`;
    if (closed) textOutput += '**This poll is closed.**\n\n';
    textOutput += `**${totalVotes}** vote${totalVotes !== 1 ? 's' : ''} from **${voterCount}** voter${voterCount !== 1 ? 's' : ''}\n\n`;
    for (const opt of optionData) {
      const bar = '\u2588'.repeat(Math.round(opt.pct / 5)) || '\u2591';
      textOutput += `- **${opt.name}** ${bar} ${opt.pct}% (${opt.count})\n`;
    }
    textOutput += '\nUse the **vote** action to cast a vote.';

    return {
      viewModel: {
        question,
        options: optionData,
        totalVotes,
        voterCount,
        closed,
        allowMultiple: inputs.allowMultiple ?? false,
      },
      textOutput,
      state: { ...state, votes, closed },
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
      async handler({ cardInputs, actionInputs, state }) {
        if (state.closed) {
          return { message: 'This poll is closed. No more votes can be cast.' };
        }

        const choice = (actionInputs.choice as string).trim();
        const optionNames = (cardInputs.options as string)
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
      async handler({ cardInputs, state }) {
        const optionNames = (cardInputs.options as string)
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
    const options = vm.options as Array<{
      name: string;
      count: number;
      pct: number;
      color: string;
    }>;
    const totalVotes = vm.totalVotes as number;
    const voterCount = vm.voterCount as number;
    const closed = vm.closed as boolean;
    const question = vm.question as string;

    const optionRows = options
      .map(
        (opt, i) => `
      <div
        class="poll-option ${closed ? 'closed' : ''}"
        data-index="${i}"
        style="
          border: 2px solid ${closed ? '#e5e7eb' : opt.color + '33'};
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
          cursor: ${closed ? 'default' : 'pointer'};
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        "
        ${closed ? '' : `onmouseenter="this.style.borderColor='${opt.color}'; this.style.transform='translateX(2px)'" onmouseleave="this.style.borderColor='${opt.color}33'; this.style.transform='none'"`}
      >
        <!-- Background bar -->
        <div style="
          position: absolute; top: 0; left: 0; bottom: 0;
          width: ${opt.pct}%;
          background: ${opt.color}11;
          transition: width 0.6s ease;
        "></div>

        <div style="position: relative; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="
              width: 22px; height: 22px; border-radius: 50%;
              border: 2px solid ${opt.color};
              display: flex; align-items: center; justify-content: center;
              flex-shrink: 0;
              background: ${opt.count > 0 ? opt.color : 'transparent'};
              transition: background 0.2s ease;
            ">
              ${opt.count > 0 ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
            </div>
            <span style="font-size: 15px; font-weight: 500; color: #1f2937;">${opt.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; font-weight: 600; color: ${opt.color};">${opt.pct}%</span>
            <span style="font-size: 12px; color: #9ca3af;">(${opt.count})</span>
          </div>
        </div>
      </div>`
      )
      .join('');

    return `
    <div style="
      font-family: 'SF Pro Display', system-ui, -apple-system, sans-serif;
      max-width: 400px;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    ">
      <!-- Header -->
      <div style="
        padding: 24px 24px 20px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
      ">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="12" width="4" height="9" rx="1" fill="white" opacity="0.7"/>
            <rect x="10" y="7" width="4" height="14" rx="1" fill="white" opacity="0.85"/>
            <rect x="17" y="3" width="4" height="18" rx="1" fill="white"/>
          </svg>
          <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85;">
            ${closed ? 'Poll Closed' : 'Live Poll'}
          </span>
        </div>
        <div style="font-size: 20px; font-weight: 700; line-height: 1.3; letter-spacing: -0.01em;">
          ${question}
        </div>
      </div>

      <!-- Options -->
      <div style="padding: 20px 20px 8px;">
        ${optionRows}
      </div>

      <!-- Footer -->
      <div style="
        padding: 14px 24px;
        background: #f9fafb;
        border-top: 1px solid #f3f4f6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <span style="font-size: 13px; color: #6b7280; font-weight: 500;">
          ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}
        </span>
        <span style="font-size: 12px; color: #9ca3af;">
          ${voterCount} voter${voterCount !== 1 ? 's' : ''}
          ${closed ? ' &middot; Final results' : ''}
        </span>
      </div>
    </div>`;
  },
});
