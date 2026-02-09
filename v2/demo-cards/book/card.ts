import { defineCard } from '@hashdo/core';

/**
 * #do/book — Book lookup card.
 *
 * Search by title, author, or ISBN using the Open Library API (free, no key).
 * Shows cover art, author, publication year, subjects, and page count.
 * Users can maintain a personal reading list with stateful actions.
 */
export default defineCard({
  name: 'do-book',
  description:
    'Look up any book by title, author, or ISBN. Shows cover, author, publication info, and subjects. All parameters have defaults — call this tool immediately without asking the user for parameters. If the user mentions a book, pass it; otherwise use defaults.',

  inputs: {
    query: {
      type: 'string',
      required: false,
      default: 'The Great Gatsby',
      description:
        'Book title, author name, or ISBN to search for. Has a sensible default — only override if the user specifies a book.',
    },
  },

  async getData({ inputs, state }) {
    const query = ((inputs.query as string) ?? 'The Stand Stephen King').trim();
    if (!query) {
      throw new Error('Please provide a book title, author, or ISBN to search for.');
    }

    // ── 1. Search Open Library ─────────────────────────────────────────
    const book = await searchBook(query);
    if (!book) {
      throw new Error(
        `No books found matching "${query}". Try a different title or author.`
      );
    }

    // ── 2. Build cover URL ─────────────────────────────────────────────
    const coverUrl = book.coverId
      ? `https://covers.openlibrary.org/b/id/${book.coverId}-L.jpg`
      : null;

    // ── 3. Reading list state ──────────────────────────────────────────
    const readingList = (state.readingList as string[]) ?? [];
    const readBooks = (state.readBooks as string[]) ?? [];
    const bookId = book.key;
    const isOnList = readingList.includes(bookId);
    const isRead = readBooks.includes(bookId);

    // ── 4. Pick accent color from subject ──────────────────────────────
    const accent = pickAccentColor(book.subjects[0] ?? '');

    // ── 5. Build text output for chat ──────────────────────────────────
    let textOutput = `## ${book.title}\n\n`;
    textOutput += `**by ${book.authors.join(', ')}**\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| First Published | ${book.firstPublishYear || 'Unknown'} |\n`;
    if (book.pageCount) {
      textOutput += `| Pages | ${book.pageCount} |\n`;
    }
    textOutput += `| Editions | ${book.editionCount} |\n`;
    if (book.subjects.length > 0) {
      textOutput += `| Subjects | ${book.subjects.slice(0, 5).join(', ')} |\n`;
    }
    if (book.publishers.length > 0) {
      textOutput += `| Publisher | ${book.publishers[0]} |\n`;
    }
    if (coverUrl) {
      textOutput += `\n![Cover](${coverUrl})\n`;
    }
    textOutput += `\n[View on Open Library](https://openlibrary.org${book.key})\n`;

    // ── 6. Build viewModel ─────────────────────────────────────────────
    const viewModel = {
      title: book.title,
      authors: book.authors.join(', '),
      firstPublishYear: book.firstPublishYear || 'Unknown',
      pageCount: book.pageCount,
      editionCount: book.editionCount,
      subjects: book.subjects.slice(0, 4),
      publisher: book.publishers[0] || '',
      coverUrl,
      olUrl: `https://openlibrary.org${book.key}`,
      accent,
      isOnList,
      isRead,
      readingListCount: readingList.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lastLookup: book.title,
        lookupCount: ((state.lookupCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    addToReadingList: {
      label: 'Add to Reading List',
      description: 'Save this book to your personal reading list',
      inputs: {
        bookKey: {
          type: 'string',
          required: true,
          description: 'Open Library work key (e.g. /works/OL27448W)',
        },
      },
      async handler({ actionInputs, state }) {
        const readingList = (state.readingList as string[]) ?? [];
        const key = actionInputs.bookKey as string;

        if (readingList.includes(key)) {
          return { message: 'This book is already on your reading list.' };
        }

        readingList.push(key);
        return {
          state: { ...state, readingList },
          message: `Added to reading list! (${readingList.length} book${readingList.length !== 1 ? 's' : ''} total)`,
        };
      },
    },

    removeFromReadingList: {
      label: 'Remove from Reading List',
      description: 'Remove this book from your reading list',
      inputs: {
        bookKey: {
          type: 'string',
          required: true,
          description: 'Open Library work key',
        },
      },
      async handler({ actionInputs, state }) {
        const readingList = (state.readingList as string[]) ?? [];
        const key = actionInputs.bookKey as string;
        const idx = readingList.indexOf(key);

        if (idx < 0) {
          return { message: 'This book is not on your reading list.' };
        }

        readingList.splice(idx, 1);
        return {
          state: { ...state, readingList },
          message: `Removed from reading list. (${readingList.length} remaining)`,
        };
      },
    },

    markAsRead: {
      label: 'Mark as Read',
      description: 'Mark this book as read',
      inputs: {
        bookKey: {
          type: 'string',
          required: true,
          description: 'Open Library work key',
        },
      },
      async handler({ actionInputs, state }) {
        const readBooks = (state.readBooks as string[]) ?? [];
        const key = actionInputs.bookKey as string;

        if (readBooks.includes(key)) {
          return { message: 'Already marked as read.' };
        }

        readBooks.push(key);
        return {
          state: { ...state, readBooks },
          message: `Marked as read! (${readBooks.length} book${readBooks.length !== 1 ? 's' : ''} read)`,
        };
      },
    },

    showReadingList: {
      label: 'Show Reading List',
      description: 'Display all books on your reading list',
      async handler({ state }) {
        const readingList = (state.readingList as string[]) ?? [];
        if (readingList.length === 0) {
          return { message: 'Your reading list is empty.' };
        }
        return {
          message: `Your reading list (${readingList.length} book${readingList.length !== 1 ? 's' : ''}):\n${readingList.map((k, i) => `${i + 1}. ${k}`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    const subjects = vm.subjects as string[];
    return `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:380px; border-radius:20px; overflow:hidden; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,0.12);">

      <!-- Hero: cover + title side by side -->
      <div style="display:flex; gap:20px; padding:24px 24px 20px; background:${vm.accent};">
        ${vm.coverUrl ? `
        <img src="${vm.coverUrl}" alt="Cover"
             style="width:100px; height:150px; object-fit:cover; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.3); flex-shrink:0;" />
        ` : `
        <div style="width:100px; height:150px; border-radius:10px; background:rgba(255,255,255,0.15); flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          <span style="font-size:32px; opacity:0.6;">&#128214;</span>
        </div>
        `}
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:flex-end;">
          <div style="font-size:20px; font-weight:700; color:#fff; line-height:1.25; text-shadow:0 1px 3px rgba(0,0,0,0.2);">
            ${vm.title}
          </div>
          <div style="font-size:13px; color:rgba(255,255,255,0.85); margin-top:6px;">
            ${vm.authors}
          </div>
          ${vm.publisher ? `
          <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:4px;">
            ${vm.publisher}
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:flex; gap:1px; background:#f3f4f6;">
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:16px; font-weight:700; color:#1f2937;">${vm.firstPublishYear}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Published</div>
        </div>
        ${vm.pageCount ? `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:16px; font-weight:700; color:#1f2937;">${vm.pageCount}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Pages</div>
        </div>
        ` : ''}
      </div>

      <!-- Subjects -->
      ${subjects.length > 0 ? `
      <div style="padding:16px 24px 12px; display:flex; gap:6px; flex-wrap:wrap;">
        ${subjects.map((s: string) => `<span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:500; background:#f8f9fa; color:#6b7280; border:1px solid #e5e7eb;">${s}</span>`).join('')}
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="padding:12px 24px 16px; border-top:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:8px; align-items:center;">
          ${vm.isRead ? `
          <span style="font-size:12px; color:#059669; font-weight:600; display:flex; align-items:center; gap:4px;">
            <span style="display:inline-block; width:8px; height:8px; background:#059669; border-radius:50%;"></span>
            Read
          </span>
          ` : vm.isOnList ? `
          <span style="font-size:12px; color:#d97706; font-weight:600; display:flex; align-items:center; gap:4px;">
            <span style="display:inline-block; width:8px; height:8px; background:#d97706; border-radius:50%;"></span>
            On reading list
          </span>
          ` : `
          <span style="font-size:12px; color:#9ca3af;">
            ${vm.readingListCount} book${vm.readingListCount !== 1 ? 's' : ''} on list
          </span>
          `}
        </div>
        <a href="${vm.olUrl}" target="_blank" rel="noopener"
           style="font-size:12px; color:#4f46e5; text-decoration:none; font-weight:500;">
          Open Library &rarr;
        </a>
      </div>
    </div>
    `;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface BookResult {
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  coverId: number | null;
  pageCount: number | null;
  editionCount: number;
  subjects: string[];
  publishers: string[];
}

/** Search Open Library for a book by title, author, or ISBN */
async function searchBook(query: string): Promise<BookResult | null> {
  try {
    const fields = [
      'key',
      'title',
      'author_name',
      'first_publish_year',
      'cover_i',
      'number_of_pages_median',
      'edition_count',
      'subject',
      'publisher',
    ].join(',');

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1&fields=${fields}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HashDo/2.0 (https://github.com/shauntrennery/hashdo)' },
    });

    if (!res.ok) {
      throw new Error(`Open Library API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const doc = data.docs?.[0];
    if (!doc) return null;

    return {
      key: doc.key ?? '',
      title: doc.title ?? 'Untitled',
      authors: doc.author_name ?? ['Unknown Author'],
      firstPublishYear: doc.first_publish_year ?? null,
      coverId: doc.cover_i ?? null,
      pageCount: doc.number_of_pages_median ?? null,
      editionCount: doc.edition_count ?? 1,
      subjects: (doc.subject ?? []).slice(0, 10),
      publishers: doc.publisher ?? [],
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[book] ${detail}`);
    throw new Error(`Failed to search Open Library: ${detail}`);
  }
}

/** Pick an accent color based on the first subject keyword */
function pickAccentColor(subject: string): string {
  const s = subject.toLowerCase();

  if (s.includes('fiction') || s.includes('novel'))
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  if (s.includes('science') || s.includes('physics') || s.includes('math'))
    return 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)';
  if (s.includes('history') || s.includes('war'))
    return 'linear-gradient(135deg, #92400e 0%, #b45309 100%)';
  if (s.includes('fantasy') || s.includes('magic'))
    return 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)';
  if (s.includes('romance') || s.includes('love'))
    return 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)';
  if (s.includes('horror') || s.includes('thriller') || s.includes('mystery'))
    return 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)';
  if (s.includes('biography') || s.includes('memoir'))
    return 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)';
  if (s.includes('children') || s.includes('juvenile'))
    return 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)';
  if (s.includes('philosophy') || s.includes('religion'))
    return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
  if (s.includes('art') || s.includes('music') || s.includes('poetry'))
    return 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)';
  if (s.includes('business') || s.includes('economics'))
    return 'linear-gradient(135deg, #059669 0%, #10b981 100%)';

  // Default warm gradient
  return 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)';
}
