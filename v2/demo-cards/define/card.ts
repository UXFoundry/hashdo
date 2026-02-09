import { defineCard } from '@hashdo/core';

/**
 * #do/define — Dictionary word lookup card.
 *
 * Uses the Free Dictionary API (dictionaryapi.dev) — free, no key required.
 * Shows phonetics, definitions by part of speech, examples, synonyms, and antonyms.
 * Users can build a personal vocabulary list with stateful actions.
 */
export default defineCard({
  name: 'do-define',
  description:
    'Look up the definition of any English word. Shows phonetics, meanings, examples, synonyms, and antonyms. All parameters have defaults — call this tool immediately without asking the user for parameters. If the user mentions a word, pass it; otherwise use defaults.',

  inputs: {
    word: {
      type: 'string',
      required: false,
      default: 'serendipity',
      description:
        'The English word to define. Has a sensible default — only override if the user specifies a word.',
    },
  },

  async getData({ inputs, state }) {
    const word = (inputs.word as string).trim().toLowerCase();
    if (!word) {
      throw new Error('Please provide a word to look up.');
    }

    // ── 1. Fetch from Free Dictionary API ──────────────────────────────
    const entry = await lookupWord(word);
    if (!entry) {
      throw new Error(
        `No definition found for "${word}". Check the spelling and try again.`
      );
    }

    // ── 2. Vocabulary list state ───────────────────────────────────────
    const vocabList = (state.vocabList as string[]) ?? [];
    const isSaved = vocabList.includes(word);

    // ── 3. Pick accent color from part of speech ───────────────────────
    const primaryPos = entry.meanings[0]?.partOfSpeech ?? '';
    const accent = posColor(primaryPos);

    // ── 4. Build text output for chat ──────────────────────────────────
    let textOutput = `## ${entry.word}`;
    if (entry.phonetic) {
      textOutput += `  ${entry.phonetic}`;
    }
    textOutput += '\n\n';

    for (const meaning of entry.meanings) {
      textOutput += `### *${meaning.partOfSpeech}*\n`;
      for (let i = 0; i < meaning.definitions.length; i++) {
        const def = meaning.definitions[i];
        textOutput += `${i + 1}. ${def.definition}\n`;
        if (def.example) {
          textOutput += `   > "${def.example}"\n`;
        }
      }
      if (meaning.synonyms.length > 0) {
        textOutput += `\n**Synonyms:** ${meaning.synonyms.slice(0, 6).join(', ')}\n`;
      }
      if (meaning.antonyms.length > 0) {
        textOutput += `**Antonyms:** ${meaning.antonyms.slice(0, 6).join(', ')}\n`;
      }
      textOutput += '\n';
    }

    // ── 5. Build viewModel ─────────────────────────────────────────────
    const viewModel = {
      word: entry.word,
      phonetic: entry.phonetic,
      audioUrl: entry.audioUrl,
      meanings: entry.meanings.map((m) => ({
        partOfSpeech: m.partOfSpeech,
        definitions: m.definitions.slice(0, 3),
        synonyms: m.synonyms.slice(0, 5),
        antonyms: m.antonyms.slice(0, 5),
      })),
      accent,
      isSaved,
      vocabCount: vocabList.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lastWord: word,
        lookupCount: ((state.lookupCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    addToVocab: {
      label: 'Save to Vocabulary',
      description: 'Add this word to your personal vocabulary list',
      inputs: {
        word: { type: 'string', required: true, description: 'The word to save' },
      },
      async handler({ actionInputs, state }) {
        const vocabList = (state.vocabList as string[]) ?? [];
        const word = (actionInputs.word as string).trim().toLowerCase();

        if (vocabList.includes(word)) {
          return { message: `"${word}" is already in your vocabulary list.` };
        }

        vocabList.push(word);
        return {
          state: { ...state, vocabList },
          message: `Added "${word}" to vocabulary! (${vocabList.length} word${vocabList.length !== 1 ? 's' : ''} saved)`,
        };
      },
    },

    removeFromVocab: {
      label: 'Remove from Vocabulary',
      description: 'Remove this word from your vocabulary list',
      inputs: {
        word: { type: 'string', required: true, description: 'The word to remove' },
      },
      async handler({ actionInputs, state }) {
        const vocabList = (state.vocabList as string[]) ?? [];
        const word = (actionInputs.word as string).trim().toLowerCase();
        const idx = vocabList.indexOf(word);

        if (idx < 0) {
          return { message: `"${word}" is not in your vocabulary list.` };
        }

        vocabList.splice(idx, 1);
        return {
          state: { ...state, vocabList },
          message: `Removed "${word}". (${vocabList.length} remaining)`,
        };
      },
    },

    showVocab: {
      label: 'Show Vocabulary List',
      description: 'Display all saved vocabulary words',
      async handler({ state }) {
        const vocabList = (state.vocabList as string[]) ?? [];
        if (vocabList.length === 0) {
          return { message: 'Your vocabulary list is empty.' };
        }
        return {
          message: `Your vocabulary (${vocabList.length} word${vocabList.length !== 1 ? 's' : ''}):\n${vocabList.map((w, i) => `${i + 1}. ${w}`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    const meanings = vm.meanings as MeaningVM[];

    const meaningBlocks = meanings.map((m) => {
      const defs = (m.definitions as DefinitionVM[]).map((d, i) =>
        `<div style="margin-bottom:10px;">
          <div style="font-size:14px; color:#1f2937; line-height:1.5;">
            <span style="color:#9ca3af; font-weight:600; margin-right:6px;">${i + 1}.</span>
            ${d.definition}
          </div>
          ${d.example ? `<div style="font-size:13px; color:#6b7280; font-style:italic; margin:4px 0 0 18px; padding-left:10px; border-left:2px solid #e5e7eb;">"${d.example}"</div>` : ''}
        </div>`
      ).join('');

      const synRow = m.synonyms.length > 0
        ? `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;">${m.synonyms.map((s: string) => `<span style="padding:2px 8px; border-radius:12px; font-size:11px; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">${s}</span>`).join('')}</div>`
        : '';

      const antRow = m.antonyms.length > 0
        ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">${m.antonyms.map((a: string) => `<span style="padding:2px 8px; border-radius:12px; font-size:11px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">${a}</span>`).join('')}</div>`
        : '';

      return `
        <div style="margin-bottom:16px;">
          <div style="display:inline-block; padding:3px 10px; border-radius:6px; font-size:12px; font-weight:600; font-style:italic; background:${posColor(m.partOfSpeech)}20; color:${posColor(m.partOfSpeech)};">
            ${m.partOfSpeech}
          </div>
          <div style="margin-top:10px;">${defs}</div>
          ${synRow}
          ${antRow}
        </div>`;
    }).join('<div style="border-top:1px solid #f3f4f6; margin:4px 0 16px;"></div>');

    return `
      <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:400px; border-radius:20px; overflow:hidden; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,0.12);">
        <!-- Header -->
        <div style="padding:24px 24px 16px; background:${vm.accent};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-size:28px; font-weight:700; color:#fff; letter-spacing:-0.02em;">
                ${vm.word}
              </div>
              ${vm.phonetic ? `<div style="font-size:15px; color:rgba(255,255,255,0.85); margin-top:4px; font-style:italic;">${vm.phonetic}</div>` : ''}
            </div>
            ${vm.isSaved ? `
            <span style="padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(255,255,255,0.2); color:#fff;">
              Saved
            </span>
            ` : ''}
          </div>
        </div>

        <!-- Meanings -->
        <div style="padding:20px 24px;">
          ${meaningBlocks}
        </div>

        <!-- Footer -->
        <div style="padding:12px 24px 16px; border-top:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; color:#9ca3af;">
            ${vm.vocabCount} word${vm.vocabCount !== 1 ? 's' : ''} in vocabulary
          </span>
          <span style="font-size:11px; color:#d1d5db;">
            Free Dictionary API
          </span>
        </div>
      </div>
    `;
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface DictionaryEntry {
  word: string;
  phonetic: string | null;
  audioUrl: string | null;
  meanings: Meaning[];
}

interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
  synonyms: string[];
  antonyms: string[];
}

interface Definition {
  definition: string;
  example: string | null;
}

interface MeaningVM {
  partOfSpeech: string;
  definitions: DefinitionVM[];
  synonyms: string[];
  antonyms: string[];
}

interface DefinitionVM {
  definition: string;
  example: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Look up a word using the Free Dictionary API */
async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Dictionary API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any[];
    const entry = data[0];
    if (!entry) return null;

    // Find best phonetic with audio
    const phonetics = entry.phonetics ?? [];
    const withAudio = phonetics.find((p: any) => p.audio && p.text);
    const phonetic = withAudio?.text ?? entry.phonetic ?? phonetics[0]?.text ?? null;
    const audioUrl = withAudio?.audio ?? phonetics.find((p: any) => p.audio)?.audio ?? null;

    // Parse meanings
    const meanings: Meaning[] = (entry.meanings ?? []).map((m: any) => {
      // Collect synonyms/antonyms from both meaning level and definition level
      const synSet = new Set<string>(m.synonyms ?? []);
      const antSet = new Set<string>(m.antonyms ?? []);

      const definitions: Definition[] = (m.definitions ?? []).map((d: any) => {
        for (const s of d.synonyms ?? []) synSet.add(s);
        for (const a of d.antonyms ?? []) antSet.add(a);
        return {
          definition: d.definition ?? '',
          example: d.example ?? null,
        };
      });

      return {
        partOfSpeech: m.partOfSpeech ?? 'unknown',
        definitions,
        synonyms: [...synSet],
        antonyms: [...antSet],
      };
    });

    return { word: entry.word ?? word, phonetic, audioUrl, meanings };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[define] ${detail}`);
    throw new Error(`Failed to look up "${word}": ${detail}`);
  }
}

/** Get accent color for a part of speech */
function posColor(pos: string): string {
  switch (pos.toLowerCase()) {
    case 'noun': return '#2563eb';
    case 'verb': return '#dc2626';
    case 'adjective': return '#7c3aed';
    case 'adverb': return '#0891b2';
    case 'pronoun': return '#059669';
    case 'preposition': return '#d97706';
    case 'conjunction': return '#be185d';
    case 'interjection': return '#ea580c';
    default: return '#6366f1';
  }
}
