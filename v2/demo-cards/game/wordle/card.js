import { defineCard } from '@hashdo/core';
/**
 * #do/game/wordle — Word-guessing game card.
 *
 * Guess a 5-letter word in 6 tries. Green = correct position,
 * yellow = wrong position, gray = not in word.
 * Includes an on-screen keyboard and persists win stats.
 */
export default defineCard({
    name: 'do-game-wordle',
    description: 'Play a Wordle word-guessing game. Guess the 5-letter word in 6 tries. Call this when the user types #do/game/wordle or wants to play a word game.',
    inputs: {
        seed: {
            type: 'string',
            required: false,
            description: 'Seed for deterministic word selection (e.g. "2026-02-10" or a phrase). Same seed = same puzzle. Defaults to today\'s date for a daily puzzle.',
        },
    },
    async getData({ inputs, state }) {
        const seed = inputs.seed || new Date().toISOString().slice(0, 10);
        const wins = state.wins ?? 0;
        const played = state.played ?? 0;
        const streak = state.streak ?? 0;
        const bestStreak = state.bestStreak ?? 0;
        const seedNote = seed ? ` (seed: "${seed}")` : '';
        const textOutput = [
            '## Wordle',
            '',
            `Guess the 5-letter word in 6 tries.${seedNote}`,
            '',
            `**Stats:** ${wins}/${played} wins, streak: ${streak}, best: ${bestStreak}`,
            '',
            'Green = right letter, right spot',
            'Yellow = right letter, wrong spot',
            'Gray = letter not in word',
        ].join('\n');
        return {
            viewModel: { wins, played, streak, bestStreak, seed },
            textOutput,
            state: { ...state, wins, played, streak, bestStreak },
        };
    },
    actions: {
        resetStats: {
            label: 'Reset Stats',
            description: 'Clear all win/loss statistics',
            async handler({ state }) {
                return {
                    state: { ...state, wins: 0, played: 0, streak: 0, bestStreak: 0 },
                    message: 'Stats have been reset.',
                };
            },
        },
    },
    template: (vm) => `
    <div id="wordle-root" style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:380px; border-radius:20px; overflow:hidden; background:#0f172a; box-shadow:0 8px 32px rgba(0,0,0,0.25); user-select:none;">

      <!-- Header -->
      <div style="padding:14px 20px 10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b;">
        <div style="font-size:18px; font-weight:700; color:#e2e8f0; letter-spacing:0.05em;">WORDLE</div>
        <div style="display:flex; gap:16px; align-items:center;">
          <div style="text-align:center;">
            <div id="w-wins" style="font-size:14px; font-weight:700; color:#4ade80;">${vm.wins}</div>
            <div style="font-size:8px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b;">Wins</div>
          </div>
          <div style="text-align:center;">
            <div id="w-streak" style="font-size:14px; font-weight:700; color:#fbbf24;">${vm.streak}</div>
            <div style="font-size:8px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b;">Streak</div>
          </div>
          <div style="text-align:center;">
            <div id="w-played" style="font-size:14px; font-weight:700; color:#94a3b8;">${vm.played}</div>
            <div style="font-size:8px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b;">Played</div>
          </div>
        </div>
      </div>

      <!-- Board -->
      <div id="w-board" style="padding:16px 20px 8px; display:flex; flex-direction:column; align-items:center; gap:6px;"></div>

      <!-- Message -->
      <div id="w-msg" style="text-align:center; min-height:24px; padding:0 20px; font-size:13px; font-weight:600; color:#e2e8f0;"></div>

      <!-- Keyboard -->
      <div id="w-kb" style="padding:8px 8px 16px; display:flex; flex-direction:column; align-items:center; gap:6px;"></div>

      <script>
      (function() {
        var SEED = ${JSON.stringify(vm.seed || '')};

        // Simple string hash for deterministic word selection
        function hashSeed(s) {
          var h = 0;
          for (var i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
          }
          return Math.abs(h);
        }

        // ── Word list (common 5-letter words) ──────────────────────────────
        var WORDS = [
          'apple','beach','brain','brave','brick','bring','brush','build','candy','chain',
          'chair','charm','chase','cheap','check','chess','chief','child','claim','class',
          'clean','clear','climb','clock','close','cloud','coach','coast','could','count',
          'court','cover','craft','crash','crazy','cream','crime','cross','crowd','crown',
          'dance','death','demon','diary','dirty','doubt','draft','drain','drama','dream',
          'dress','drift','drink','drive','earth','eight','enemy','enjoy','enter','equal',
          'error','event','every','exact','exist','extra','faith','false','fault','feast',
          'fence','field','fight','final','flame','flash','flesh','float','flood','floor',
          'flour','fluid','focus','force','forge','forth','found','frame','frank','fresh',
          'front','fruit','ghost','giant','given','glass','globe','gloom','grace','grade',
          'grain','grand','grant','grape','grasp','grass','grave','great','green','grind',
          'gross','group','grove','grown','guard','guess','guide','guilt','habit','happy',
          'harry','harsh','heart','heavy','hence','horse','hotel','house','human','humor',
          'hurry','ideal','image','imply','index','inner','input','issue','ivory','japan',
          'jimmy','joint','jones','judge','juice','knife','knock','known','label','large',
          'laser','later','laugh','layer','learn','least','leave','legal','level','light',
          'limit','linux','liver','local','logic','loose','lover','lower','lucky','lunch',
          'lying','magic','major','maker','manor','maple','march','match','maybe','mayor',
          'media','mercy','metal','might','minor','minus','model','money','month','moral',
          'motor','mount','mouse','mouth','movie','music','naive','nerve','never','night',
          'noble','noise','north','novel','nurse','occur','ocean','offer','often','olive',
          'order','other','outer','owner','oxide','panel','panic','paper','party','paste',
          'patch','pause','peace','pearl','penny','phase','phone','photo','piano','pilot',
          'pitch','pixel','place','plain','plane','plant','plate','plaza','plead','point',
          'polar','pound','power','press','price','pride','prime','prince','print','prior',
          'prize','proof','proud','prove','psalm','punch','pupil','queen','quest','queue',
          'quiet','quote','radar','radio','raise','range','rapid','ratio','reach','react',
          'ready','realm','rebel','reign','relax','reply','rider','ridge','rifle','right',
          'rigid','rival','river','robin','robot','rocky','roger','roman','rouge','rough',
          'round','route','royal','rugby','ruler','rural','saint','salad','sauce','scale',
          'scene','scope','score','sense','serve','seven','shade','shaft','shake','shall',
          'shame','shape','share','shark','sharp','sheet','shelf','shell','shift','shine',
          'shirt','shock','shoot','shore','short','shout','sight','sigma','since','sixth',
          'sixty','skill','skull','slash','sleep','slice','slide','slope','smart','smell',
          'smile','smoke','snake','solar','solid','solve','sorry','sound','south','space',
          'spare','speak','speed','spend','spice','spine','split','spoon','sport','spray',
          'squad','stack','staff','stage','stain','stake','stale','stall','stamp','stand',
          'stare','stark','start','state','stays','steady','steam','steel','steep','steer',
          'stern','stick','stiff','still','stock','stone','stood','store','storm','story',
          'stove','strap','straw','strip','stuck','stuff','style','sugar','suite','super',
          'surge','swamp','swear','sweet','swept','swift','swing','sword','syrup','table',
          'taste','teeth','tempo','thank','theme','there','thick','thing','think','third',
          'thorn','those','three','throw','thumb','tiger','tight','timer','tired','title',
          'today','token','total','touch','tough','tower','toxic','trace','track','trade',
          'trail','train','trait','trash','treat','trend','trial','tribe','trick','tried',
          'troop','truck','truly','trump','trunk','trust','truth','tumor','twice','twist',
          'ultra','uncle','under','union','unity','until','upper','upset','urban','usage',
          'usual','valid','value','vapor','verse','video','vigor','virus','visit','vital',
          'vivid','vocal','vodka','voice','voter','waste','watch','water','weave','weigh',
          'weird','wheat','wheel','where','which','while','white','whole','whose','width',
          'witch','woman','world','worry','worse','worst','worth','would','wound','wrath',
          'write','wrong','wrote','yacht','yield','young','youth','zebra'
        ];

        var VALID = new Set(WORDS.map(function(w) { return w.toUpperCase(); }));
        var target, guesses, currentRow, currentCol, gameOver, board, keys;
        var ROWS = 6, COLS = 5;

        var GREEN  = '#538d4e';
        var YELLOW = '#b59f3b';
        var GRAY   = '#3a3a3c';
        var EMPTY  = '#1e293b';
        var BORDER = '#334155';

        var boardEl = document.getElementById('w-board');
        var msgEl   = document.getElementById('w-msg');
        var kbEl    = document.getElementById('w-kb');

        function init() {
          target = SEED
            ? WORDS[hashSeed(SEED) % WORDS.length].toUpperCase()
            : WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();
          guesses = [];
          currentRow = 0;
          currentCol = 0;
          gameOver = false;
          board = [];
          keys = {};
          msgEl.textContent = '';
          renderBoard();
          renderKeyboard();
        }

        function renderBoard() {
          boardEl.innerHTML = '';
          board = [];
          for (var r = 0; r < ROWS; r++) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:6px;';
            var rowCells = [];
            for (var c = 0; c < COLS; c++) {
              var cell = document.createElement('div');
              cell.style.cssText = 'width:52px; height:52px; border:2px solid ' + BORDER + '; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; color:#e2e8f0; background:' + EMPTY + '; transition:all 0.15s;';
              row.appendChild(cell);
              rowCells.push(cell);
            }
            boardEl.appendChild(row);
            board.push(rowCells);
          }
        }

        function renderKeyboard() {
          kbEl.innerHTML = '';
          var rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
          for (var r = 0; r < rows.length; r++) {
            var rowDiv = document.createElement('div');
            rowDiv.style.cssText = 'display:flex; gap:4px; justify-content:center;';

            if (r === 2) {
              var enterKey = makeKey('ENT', 'ENTER');
              enterKey.style.fontSize = '11px';
              enterKey.style.width = '48px';
              rowDiv.appendChild(enterKey);
            }

            for (var c = 0; c < rows[r].length; c++) {
              var letter = rows[r][c];
              rowDiv.appendChild(makeKey(letter, letter));
            }

            if (r === 2) {
              var delKey = makeKey('DEL', 'BACKSPACE');
              delKey.style.fontSize = '11px';
              delKey.style.width = '48px';
              rowDiv.appendChild(delKey);
            }

            kbEl.appendChild(rowDiv);
          }
        }

        function makeKey(label, action) {
          var btn = document.createElement('div');
          btn.style.cssText = 'min-width:30px; height:42px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:#e2e8f0; background:#334155; cursor:pointer; padding:0 4px; transition:background 0.15s;';
          btn.textContent = label;
          btn.dataset.action = action;
          btn.addEventListener('click', function() { handleInput(action); });
          if (label.length === 1) keys[label] = btn;
          return btn;
        }

        function handleInput(action) {
          if (gameOver) {
            if (action === 'ENTER') init();
            return;
          }

          if (action === 'BACKSPACE') {
            if (currentCol > 0) {
              currentCol--;
              board[currentRow][currentCol].textContent = '';
              board[currentRow][currentCol].style.borderColor = BORDER;
            }
            return;
          }

          if (action === 'ENTER') {
            if (currentCol < COLS) {
              showMsg('Not enough letters');
              return;
            }
            var attempt = '';
            for (var i = 0; i < COLS; i++) attempt += board[currentRow][i].textContent;
            if (!VALID.has(attempt)) {
              showMsg('Not in word list');
              return;
            }
            submitGuess();
            return;
          }

          // Letter
          if (currentCol < COLS) {
            board[currentRow][currentCol].textContent = action;
            board[currentRow][currentCol].style.borderColor = '#64748b';
            currentCol++;
          }
        }

        function submitGuess() {
          var guess = '';
          for (var c = 0; c < COLS; c++) {
            guess += board[currentRow][c].textContent;
          }
          guesses.push(guess);

          // Score: green, yellow, gray
          var targetArr = target.split('');
          var result = new Array(COLS);
          var used = new Array(COLS);

          // First pass: greens
          for (var i = 0; i < COLS; i++) {
            if (guess[i] === targetArr[i]) {
              result[i] = GREEN;
              used[i] = true;
            }
          }
          // Second pass: yellows
          for (var i = 0; i < COLS; i++) {
            if (result[i]) continue;
            var found = false;
            for (var j = 0; j < COLS; j++) {
              if (!used[j] && guess[i] === targetArr[j]) {
                result[i] = YELLOW;
                used[j] = true;
                found = true;
                break;
              }
            }
            if (!found) result[i] = GRAY;
          }

          // Animate reveal
          for (var i = 0; i < COLS; i++) {
            (function(idx, color) {
              setTimeout(function() {
                board[currentRow][idx].style.background = color;
                board[currentRow][idx].style.borderColor = color;
                // Update keyboard colors
                var letter = guess[idx];
                if (keys[letter]) {
                  var cur = keys[letter].style.background;
                  if (color === GREEN || (color === YELLOW && cur !== GREEN)) {
                    keys[letter].style.background = color;
                  } else if (cur !== GREEN && cur !== YELLOW) {
                    keys[letter].style.background = color;
                  }
                }
              }, idx * 120);
            })(i, result[i]);
          }

          setTimeout(function() {
            if (guess === target) {
              var msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
              showMsg(msgs[currentRow] || 'Nice!');
              gameOver = true;
              showMsg(msgs[currentRow] + ' Press Enter to play again.');
              return;
            }

            currentRow++;
            currentCol = 0;

            if (currentRow >= ROWS) {
              showMsg(target + ' \u2014 Press Enter to play again.');
              gameOver = true;
            }
          }, COLS * 120 + 100);
        }

        function showMsg(text) {
          msgEl.textContent = text;
        }

        // Keyboard input
        document.addEventListener('keydown', function(e) {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key === 'Enter') { handleInput('ENTER'); e.preventDefault(); }
          else if (e.key === 'Backspace') { handleInput('BACKSPACE'); e.preventDefault(); }
          else if (/^[a-zA-Z]$/.test(e.key)) { handleInput(e.key.toUpperCase()); e.preventDefault(); }
        });

        init();
      })();
      <\/script>
    </div>
  `,
});
