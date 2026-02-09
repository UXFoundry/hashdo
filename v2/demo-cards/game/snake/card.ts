import { defineCard } from '@hashdo/core';

/**
 * #do/game/snake — Classic Snake game card.
 *
 * A fully playable Snake game rendered on a canvas element.
 * Supports keyboard (arrow keys + WASD) and touch/swipe controls.
 * Persists high score across renders via card state.
 */
export default defineCard({
  name: 'do-game-snake',
  description:
    'Play a classic Snake game. Control the snake to eat food and grow without hitting walls or yourself. Call this when the user types #do/game/snake or wants to play a game.',

  inputs: {
    speed: {
      type: 'string',
      required: false,
      default: 'normal',
      description: 'Game speed: "normal", "fast", or "insane"',
      enum: ['normal', 'fast', 'insane'] as const,
    },
  },

  async getData({ inputs, state }) {
    const speed = (inputs.speed as string) ?? 'normal';
    const highScore = (state.highScore as number) ?? 0;

    const tickMs: Record<string, number> = {
      normal: 140,
      fast: 90,
      insane: 50,
    };
    const interval = tickMs[speed] ?? 140;

    const textOutput = [
      '## Snake Game',
      '',
      `**Speed:** ${speed}`,
      `**High Score:** ${highScore}`,
      '',
      'Use arrow keys or WASD to control the snake.',
      'Eat the food to grow. Don\'t hit the walls or yourself!',
    ].join('\n');

    return {
      viewModel: { speed, highScore, interval },
      textOutput,
      state: { ...state, highScore },
    };
  },

  actions: {
    resetHighScore: {
      label: 'Reset High Score',
      description: 'Clear the persisted high score back to 0',
      async handler({ state }) {
        return {
          state: { ...state, highScore: 0 },
          message: 'High score has been reset to 0.',
        };
      },
    },
  },

  template: (vm) => `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:380px; border-radius:20px; overflow:hidden; background:#0f172a; box-shadow:0 8px 32px rgba(0,0,0,0.25);">

      <!-- Header -->
      <div style="padding:16px 20px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:16px; font-weight:700; color:#e2e8f0; letter-spacing:-0.01em;">Snake</div>
        <div style="display:flex; gap:16px; align-items:center;">
          <div style="text-align:center;">
            <div id="snake-score" style="font-size:18px; font-weight:700; color:#4ade80; font-variant-numeric:tabular-nums;">0</div>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b;">Score</div>
          </div>
          <div style="text-align:center;">
            <div id="snake-high" style="font-size:18px; font-weight:700; color:#fbbf24; font-variant-numeric:tabular-nums;">${vm.highScore}</div>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b;">Best</div>
          </div>
        </div>
      </div>

      <!-- Canvas -->
      <div style="padding:0 20px; position:relative;">
        <canvas id="snake-canvas" width="340" height="340"
                style="display:block; width:100%; border-radius:12px; background:#1e293b; image-rendering:pixelated;"></canvas>

        <!-- Overlay -->
        <div id="snake-overlay" style="position:absolute; inset:0 20px; border-radius:12px; background:rgba(15,23,42,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;">
          <div style="font-size:32px; margin-bottom:8px;">&#127918;</div>
          <div style="font-size:16px; font-weight:600; color:#e2e8f0;">Tap to Play</div>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">Arrow keys / WASD / Swipe</div>
        </div>
      </div>

      <!-- Speed indicator -->
      <div style="padding:12px 20px 16px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:11px; color:#64748b;">
          Speed: <span style="color:#94a3b8; font-weight:500;">${vm.speed}</span>
        </div>
        <div id="snake-status" style="font-size:11px; color:#64748b;">Ready</div>
      </div>

      <script>
      (function() {
        var COLS = 17, ROWS = 17;
        var canvas = document.getElementById('snake-canvas');
        var ctx = canvas.getContext('2d');
        var overlay = document.getElementById('snake-overlay');
        var scoreEl = document.getElementById('snake-score');
        var highEl = document.getElementById('snake-high');
        var statusEl = document.getElementById('snake-status');

        var cellW = canvas.width / COLS;
        var cellH = canvas.height / ROWS;
        var interval = ${vm.interval};
        var highScore = ${vm.highScore};

        var snake, dir, nextDir, food, score, running, timer;

        function init() {
          var mid = Math.floor(COLS / 2);
          snake = [{x: mid, y: Math.floor(ROWS / 2)}];
          dir = {x: 1, y: 0};
          nextDir = {x: 1, y: 0};
          score = 0;
          scoreEl.textContent = '0';
          statusEl.textContent = 'Playing';
          statusEl.style.color = '#4ade80';
          placeFood();
          running = true;
          overlay.style.display = 'none';
          if (timer) clearInterval(timer);
          timer = setInterval(tick, interval);
          draw();
        }

        function placeFood() {
          var empty = [];
          for (var y = 0; y < ROWS; y++) {
            for (var x = 0; x < COLS; x++) {
              var occupied = false;
              for (var i = 0; i < snake.length; i++) {
                if (snake[i].x === x && snake[i].y === y) { occupied = true; break; }
              }
              if (!occupied) empty.push({x: x, y: y});
            }
          }
          food = empty[Math.floor(Math.random() * empty.length)];
        }

        function tick() {
          dir = nextDir;
          var head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

          // Wall collision
          if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
            return gameOver();
          }
          // Self collision
          for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === head.x && snake[i].y === head.y) return gameOver();
          }

          snake.unshift(head);

          if (head.x === food.x && head.y === food.y) {
            score++;
            scoreEl.textContent = score;
            if (score > highScore) {
              highScore = score;
              highEl.textContent = highScore;
            }
            placeFood();
          } else {
            snake.pop();
          }

          draw();
        }

        function gameOver() {
          running = false;
          clearInterval(timer);
          statusEl.textContent = 'Game Over';
          statusEl.style.color = '#f87171';
          overlay.innerHTML = '<div style="font-size:32px; margin-bottom:8px;">&#128128;</div>'
            + '<div style="font-size:16px; font-weight:600; color:#e2e8f0;">Game Over</div>'
            + '<div style="font-size:24px; font-weight:700; color:#4ade80; margin-top:8px;">' + score + '</div>'
            + '<div style="font-size:11px; color:#64748b; margin-top:2px;">points</div>'
            + '<div style="font-size:12px; color:#94a3b8; margin-top:12px;">Tap to play again</div>';
          overlay.style.display = 'flex';
        }

        function draw() {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Grid dots
          ctx.fillStyle = '#253347';
          for (var y = 0; y < ROWS; y++) {
            for (var x = 0; x < COLS; x++) {
              ctx.beginPath();
              ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Food
          if (food) {
            ctx.fillStyle = '#ef4444';
            roundRect(ctx, food.x * cellW + 2, food.y * cellH + 2, cellW - 4, cellH - 4, 4);
            ctx.fill();
            // Food glow
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          // Snake
          for (var i = 0; i < snake.length; i++) {
            var s = snake[i];
            var isHead = i === 0;
            ctx.fillStyle = isHead ? '#4ade80' : '#22c55e';
            if (!isHead) {
              // Fade tail slightly
              var alpha = 1 - (i / snake.length) * 0.4;
              ctx.globalAlpha = alpha;
            }
            roundRect(ctx, s.x * cellW + 1, s.y * cellH + 1, cellW - 2, cellH - 2, isHead ? 6 : 4);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Eyes on head
            if (isHead) {
              ctx.fillStyle = '#0f172a';
              var cx = s.x * cellW + cellW / 2;
              var cy = s.y * cellH + cellH / 2;
              var ex = dir.x * 3;
              var ey = dir.y * 3;
              ctx.beginPath();
              ctx.arc(cx + ex - 3, cy + ey - 3, 2, 0, Math.PI * 2);
              ctx.arc(cx + ex + 3, cy + ey - 3, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        function roundRect(c, x, y, w, h, r) {
          c.beginPath();
          c.moveTo(x + r, y);
          c.lineTo(x + w - r, y);
          c.quadraticCurveTo(x + w, y, x + w, y + r);
          c.lineTo(x + w, y + h - r);
          c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          c.lineTo(x + r, y + h);
          c.quadraticCurveTo(x, y + h, x, y + h - r);
          c.lineTo(x, y + r);
          c.quadraticCurveTo(x, y, x + r, y);
          c.closePath();
        }

        // Keyboard
        document.addEventListener('keydown', function(e) {
          if (!running) return;
          switch(e.key) {
            case 'ArrowUp': case 'w': case 'W':
              if (dir.y !== 1) nextDir = {x: 0, y: -1}; e.preventDefault(); break;
            case 'ArrowDown': case 's': case 'S':
              if (dir.y !== -1) nextDir = {x: 0, y: 1}; e.preventDefault(); break;
            case 'ArrowLeft': case 'a': case 'A':
              if (dir.x !== 1) nextDir = {x: -1, y: 0}; e.preventDefault(); break;
            case 'ArrowRight': case 'd': case 'D':
              if (dir.x !== -1) nextDir = {x: 1, y: 0}; e.preventDefault(); break;
          }
        });

        // Touch / swipe
        var touchStart = null;
        canvas.addEventListener('touchstart', function(e) {
          var t = e.touches[0];
          touchStart = {x: t.clientX, y: t.clientY};
        }, {passive: true});

        canvas.addEventListener('touchend', function(e) {
          if (!touchStart || !running) return;
          var t = e.changedTouches[0];
          var dx = t.clientX - touchStart.x;
          var dy = t.clientY - touchStart.y;
          touchStart = null;
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0 && dir.x !== -1) nextDir = {x: 1, y: 0};
            else if (dx < 0 && dir.x !== 1) nextDir = {x: -1, y: 0};
          } else {
            if (dy > 0 && dir.y !== -1) nextDir = {x: 0, y: 1};
            else if (dy < 0 && dir.y !== 1) nextDir = {x: 0, y: -1};
          }
        }, {passive: true});

        // Click overlay to start/restart
        overlay.addEventListener('click', function() { init(); });

        // Initial draw
        snake = [{x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2)}];
        dir = {x: 1, y: 0};
        nextDir = dir;
        food = {x: Math.floor(COLS / 2) + 4, y: Math.floor(ROWS / 2)};
        running = false;
        draw();
      })();
      <\/script>
    </div>
  `,
});
