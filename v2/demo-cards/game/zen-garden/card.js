import { defineCard } from '@hashdo/core';
/**
 * #do/game/zen-garden — Japanese dry garden (karesansui) raking game.
 *
 * Rake sand patterns around stones in a serene zen garden.
 * The garden resets daily with a new stone arrangement.
 * Collaborative: everyone shares the same daily garden.
 */
export default defineCard({
    name: 'do-game-zen-garden',
    description: 'Rake a Japanese zen garden. Drag to create sand patterns around stones. The garden resets daily with new stones. Call this when the user types #do/game/zen-garden or wants a relaxing zen activity.',
    shareable: true,
    inputs: {
        seed: {
            type: 'string',
            required: false,
            description: 'Seed for deterministic stone placement (e.g. "2026-02-10"). Same seed = same garden layout. Defaults to today\'s date for a daily garden.',
        },
    },
    stateKey: (inputs, userId) => {
        const seed = inputs.seed ||
            new Date().toISOString().slice(0, 10);
        return userId ? `garden:${seed}:${userId}` : `garden:${seed}`;
    },
    async getData({ inputs, state }) {
        const seed = inputs.seed ||
            new Date().toISOString().slice(0, 10);
        const strokes = state.strokes ?? [];
        const strokeCount = strokes.length;
        const textOutput = [
            '## Zen Garden',
            '',
            `A Japanese dry garden (karesansui) for ${seed}.`,
            `${strokeCount} rake stroke${strokeCount !== 1 ? 's' : ''} placed.`,
            '',
            'Drag across the sand to rake patterns around the stones.',
            'The garden resets each day with a new stone arrangement.',
        ].join('\n');
        return {
            viewModel: {
                seed,
                strokes: JSON.stringify(strokes),
                strokeCount,
            },
            textOutput,
            state: { ...state, strokes },
        };
    },
    actions: {
        saveStrokes: {
            label: 'Save Garden',
            description: 'Save the current rake strokes to the garden state',
            inputs: {
                strokes: {
                    type: 'json',
                    required: true,
                    description: 'JSON array of stroke arrays, each stroke is an array of {x,y} normalized points',
                },
            },
            async handler({ state, actionInputs }) {
                const newStrokes = actionInputs.strokes;
                return {
                    state: { ...state, strokes: newStrokes },
                    message: 'Garden saved.',
                };
            },
        },
        clearGarden: {
            label: 'Clear Garden',
            description: 'Remove all rake strokes and start fresh',
            async handler({ state }) {
                return {
                    state: { ...state, strokes: [] },
                    message: 'Garden cleared.',
                };
            },
        },
    },
    template: (vm) => {
        const formattedDate = (() => {
            const [y, m, d] = String(vm.seed).split('-');
            const months = [
                'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
            ];
            return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
        })();
        return `
<div id="zen-root" style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:380px; border-radius:20px; overflow:hidden; background:#e8dcc8; box-shadow:0 8px 32px rgba(0,0,0,0.18); user-select:none;">

  <!-- Header -->
  <div style="padding:14px 20px 10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(139,115,85,0.2);">
    <div style="display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5c4a32" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="14"/>
        <line x1="6" y1="14" x2="18" y2="14"/>
        <line x1="6" y1="14" x2="6" y2="18"/>
        <line x1="10" y1="14" x2="10" y2="18"/>
        <line x1="14" y1="14" x2="14" y2="18"/>
        <line x1="18" y1="14" x2="18" y2="18"/>
      </svg>
      <span style="font-size:16px; font-weight:700; color:#5c4a32; letter-spacing:-0.01em;">Zen Garden</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px; font-weight:600; color:#8B7355;">${formattedDate}</div>
      <div id="zen-count" style="font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#a89880;">${vm.strokeCount} strokes</div>
    </div>
  </div>

  <!-- Canvas -->
  <div style="padding:8px 12px; position:relative;">
    <canvas id="zen-canvas" width="712" height="712"
            style="display:block; width:100%; aspect-ratio:1/1; border-radius:6px; cursor:crosshair; touch-action:none;"></canvas>
  </div>

  <!-- Footer -->
  <div style="padding:6px 20px 14px; display:flex; justify-content:space-between; align-items:center;">
    <div style="font-size:11px; color:#a89880; font-style:italic;">Drag to rake</div>
    <div style="display:flex; gap:14px; align-items:center;">
      <div id="zen-undo" style="font-size:11px; color:#8B7355; cursor:pointer; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">Undo</div>
      <div id="zen-clear" style="font-size:11px; color:#8B7355; cursor:pointer; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">Clear</div>
    </div>
  </div>

  <script>
  (function() {
    var SEED = ${JSON.stringify(vm.seed)};
    var initialStrokes = ${vm.strokes};
    var MAX_STROKES = 100;
    var RAKE_TINES = 9;
    var TINE_SPACING = 8;
    var TINE_WIDTH = 2;
    var MIN_POINT_DIST = 10;

    var canvas = document.getElementById('zen-canvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;

    var strokes = initialStrokes.slice();
    var currentStroke = [];
    var isDrawing = false;
    var saveTimer = null;

    /* ── Seeded PRNG (mulberry32) ── */
    function mulberry32(s) {
      return function() {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        var t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    function hashStr(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      }
      // Avalanche finalizer — ensures similar strings produce very different seeds
      h ^= h >>> 16;
      h = Math.imul(h, 0x45d9f3b);
      h ^= h >>> 16;
      h = Math.imul(h, 0x45d9f3b);
      h ^= h >>> 16;
      return h >>> 0;
    }

    /* ── Rock generation ── */
    var rng = mulberry32(hashStr(SEED));
    var sandRng = mulberry32(hashStr(SEED + ':sand'));

    function generateRocks() {
      var pad = 60;
      var count = 3 + Math.floor(rng() * 4); // 3–6 rocks
      var rocks = [];
      for (var i = 0; i < count; i++) {
        var attempts = 0;
        var rock;
        do {
          var rx = pad + rng() * (W - pad * 2);
          var ry = pad + rng() * (H - pad * 2);
          var size = 18 + rng() * 28;
          var aspect = 0.6 + rng() * 0.6;
          var rot = rng() * Math.PI;
          rock = { x: rx, y: ry, rx: size, ry: size * aspect, rotation: rot };
          attempts++;
        } while (attempts < 50 && overlaps(rock, rocks, 24));
        rocks.push(rock);
      }
      return rocks;
    }

    function overlaps(cand, list, gap) {
      for (var i = 0; i < list.length; i++) {
        var dx = cand.x - list[i].x;
        var dy = cand.y - list[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < cand.rx + list[i].rx + gap) return true;
      }
      return false;
    }

    var rocks = generateRocks();

    function isInsideRock(px, py, padding) {
      padding = padding || 8;
      for (var i = 0; i < rocks.length; i++) {
        var r = rocks[i];
        var cos = Math.cos(-r.rotation);
        var sin = Math.sin(-r.rotation);
        var dx = px - r.x;
        var dy = py - r.y;
        var lx = dx * cos - dy * sin;
        var ly = dx * sin + dy * cos;
        var ex = lx / (r.rx + padding);
        var ey = ly / (r.ry + padding);
        if (ex * ex + ey * ey <= 1) return true;
      }
      return false;
    }

    /* ── Drawing ── */
    function drawSand() {
      ctx.fillStyle = '#d4c5a9';
      ctx.fillRect(0, 0, W, H);
      // Subtle grain texture
      var sr = mulberry32(hashStr(SEED + ':grain'));
      ctx.fillStyle = 'rgba(0,0,0,0.015)';
      for (var i = 0; i < 3000; i++) {
        ctx.fillRect(sr() * W, sr() * H, 1, 1);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      for (var i = 0; i < 1500; i++) {
        ctx.fillRect(sr() * W, sr() * H, 1, 1);
      }
    }

    function drawRock(r) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rotation);

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
      var grad = ctx.createRadialGradient(-r.rx * 0.3, -r.ry * 0.3, 0, 0, 0, Math.max(r.rx, r.ry));
      grad.addColorStop(0, '#6a6a6a');
      grad.addColorStop(0.4, '#4a4a4a');
      grad.addColorStop(0.8, '#333');
      grad.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle highlight
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(-r.rx * 0.2, -r.ry * 0.25, r.rx * 0.35, r.ry * 0.3, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();

      ctx.restore();
    }

    function drawStroke(points) {
      if (points.length < 2) return;

      // Eraser pass: paint fresh sand under this stroke so it covers previous ones
      var rakeW = (RAKE_TINES - 1) * TINE_SPACING + TINE_WIDTH + 8;
      ctx.beginPath();
      ctx.strokeStyle = '#d4c5a9';
      ctx.lineWidth = rakeW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Draw grooves (dark lines)
      for (var t = 0; t < RAKE_TINES; t++) {
        var offset = (t - (RAKE_TINES - 1) / 2) * TINE_SPACING;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = TINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        var moved = false;
        for (var i = 0; i < points.length; i++) {
          var p = points[i];
          var nx, ny;
          if (i < points.length - 1) {
            var dx = points[i + 1].x - p.x;
            var dy = points[i + 1].y - p.y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            nx = -dy / len; ny = dx / len;
          } else {
            var dx = p.x - points[i - 1].x;
            var dy = p.y - points[i - 1].y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            nx = -dy / len; ny = dx / len;
          }
          var ox = p.x + nx * offset;
          var oy = p.y + ny * offset;

          if (isInsideRock(ox, oy, 4)) { moved = false; continue; }

          if (!moved) { ctx.moveTo(ox, oy); moved = true; }
          else { ctx.lineTo(ox, oy); }
        }
        ctx.stroke();
      }

      // Draw ridges (light highlights between grooves)
      for (var t = 0; t < RAKE_TINES - 1; t++) {
        var offset = (t - (RAKE_TINES - 1) / 2) * TINE_SPACING + TINE_SPACING / 2;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = TINE_SPACING - TINE_WIDTH - 0.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        var moved = false;
        for (var i = 0; i < points.length; i++) {
          var p = points[i];
          var nx, ny;
          if (i < points.length - 1) {
            var dx = points[i + 1].x - p.x;
            var dy = points[i + 1].y - p.y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            nx = -dy / len; ny = dx / len;
          } else {
            var dx = p.x - points[i - 1].x;
            var dy = p.y - points[i - 1].y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            nx = -dy / len; ny = dx / len;
          }
          var ox = p.x + nx * offset;
          var oy = p.y + ny * offset;

          if (isInsideRock(ox, oy, 4)) { moved = false; continue; }

          if (!moved) { ctx.moveTo(ox, oy); moved = true; }
          else { ctx.lineTo(ox, oy); }
        }
        ctx.stroke();
      }
    }

    function drawBorder() {
      var bw = 4;
      ctx.strokeStyle = '#8B7355';
      ctx.lineWidth = bw;
      ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
      // Inner shadow line
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bw + 1, bw + 1, W - bw * 2 - 2, H - bw * 2 - 2);
    }

    function denorm(pts) {
      return pts.map(function(p) { return { x: p.x * W, y: p.y * H }; });
    }
    function norm(pts) {
      return pts.map(function(p) { return { x: p.x / W, y: p.y / H }; });
    }

    function redraw() {
      drawSand();
      for (var i = 0; i < strokes.length; i++) {
        drawStroke(denorm(strokes[i]));
      }
      if (currentStroke.length > 1) {
        drawStroke(currentStroke);
      }
      for (var i = 0; i < rocks.length; i++) {
        drawRock(rocks[i]);
      }
      drawBorder();
    }

    function updateCount() {
      var el = document.getElementById('zen-count');
      if (el) el.textContent = strokes.length + ' strokes';
    }

    /* ── Stroke assist: snaps to straight lines and circles/arcs ── */
    function assistStroke(pts) {
      if (pts.length < 2) return pts;
      var line = fitLine(pts);
      if (line) return line;
      var arc = fitArc(pts);
      if (arc) return arc;
      return heavySmooth(pts);
    }

    function heavySmooth(pts) {
      if (pts.length < 3) return pts;
      // Two passes of 3-point averaging for a very smooth result
      var a = pts;
      for (var pass = 0; pass < 3; pass++) {
        var b = [a[0]];
        for (var i = 1; i < a.length - 1; i++) {
          b.push({ x: (a[i-1].x + a[i].x + a[i+1].x) / 3, y: (a[i-1].y + a[i].y + a[i+1].y) / 3 });
        }
        b.push(a[a.length - 1]);
        a = b;
      }
      return a;
    }

    function fitLine(pts) {
      var first = pts[0];
      var last = pts[pts.length - 1];
      var dx = last.x - first.x;
      var dy = last.y - first.y;
      var lineLen = Math.sqrt(dx * dx + dy * dy);
      if (lineLen < 30) return null;

      // Max perpendicular deviation from first→last
      var maxDev = 0;
      for (var i = 1; i < pts.length - 1; i++) {
        var px = pts[i].x - first.x;
        var py = pts[i].y - first.y;
        var dev = Math.abs(px * dy - py * dx) / lineLen;
        if (dev > maxDev) maxDev = dev;
      }

      // Generous threshold: snap if wobble < 8% of length or < 45px
      if (maxDev > Math.max(lineLen * 0.08, 45)) return null;

      var numPts = Math.max(2, Math.round(lineLen / 12));
      var result = [];
      for (var i = 0; i <= numPts; i++) {
        var t = i / numPts;
        result.push({ x: first.x + dx * t, y: first.y + dy * t });
      }
      return result;
    }

    function fitArc(pts) {
      if (pts.length < 6) return null;

      // Use 3 well-spaced points to find a candidate circle
      var i1 = 0;
      var i2 = Math.floor(pts.length / 2);
      var i3 = pts.length - 1;
      var circle = circumCircle(pts[i1], pts[i2], pts[i3]);
      if (!circle) return null;
      if (circle.r < 25 || circle.r > W * 1.5) return null;

      // Check all points fit the circle (max deviation < 20% of radius)
      var maxDev = 0;
      for (var i = 0; i < pts.length; i++) {
        var d = Math.abs(Math.sqrt((pts[i].x - circle.cx) * (pts[i].x - circle.cx) + (pts[i].y - circle.cy) * (pts[i].y - circle.cy)) - circle.r);
        if (d > maxDev) maxDev = d;
      }
      if (maxDev > circle.r * 0.2) return null;

      // Compute start/end angles and direction
      var startA = Math.atan2(pts[0].y - circle.cy, pts[0].x - circle.cx);
      var midA = Math.atan2(pts[i2].y - circle.cy, pts[i2].x - circle.cx);
      var endA = Math.atan2(pts[i3].y - circle.cy, pts[i3].x - circle.cx);

      // Determine sweep direction using the midpoint
      var sweep = angleSweep(startA, midA, endA);
      if (Math.abs(sweep) < Math.PI / 4) return null; // too small an arc

      var numPts = Math.max(12, Math.round(Math.abs(sweep) * circle.r / 10));
      var result = [];
      for (var i = 0; i <= numPts; i++) {
        var t = i / numPts;
        var angle = startA + sweep * t;
        result.push({ x: circle.cx + Math.cos(angle) * circle.r, y: circle.cy + Math.sin(angle) * circle.r });
      }
      return result;
    }

    function circumCircle(p1, p2, p3) {
      var ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
      var D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(D) < 1e-6) return null;
      var ux = ((ax*ax+ay*ay)*(by-cy) + (bx*bx+by*by)*(cy-ay) + (cx*cx+cy*cy)*(ay-by)) / D;
      var uy = ((ax*ax+ay*ay)*(cx-bx) + (bx*bx+by*by)*(ax-cx) + (cx*cx+cy*cy)*(bx-ax)) / D;
      return { cx: ux, cy: uy, r: Math.sqrt((ax-ux)*(ax-ux) + (ay-uy)*(ay-uy)) };
    }

    function angleSweep(start, mid, end) {
      // Find the sweep from start→end that passes through mid
      function normA(a) { return ((a % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); }
      var s = normA(start), m = normA(mid), e = normA(end);

      // Try positive (CCW) sweep
      var posSweep = normA(e - s);
      var posMid = normA(m - s);
      if (posMid < posSweep) return posSweep;

      // Otherwise negative (CW) sweep
      return posSweep - Math.PI * 2;
    }

    /* ── Pointer events ── */
    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    }

    canvas.addEventListener('pointerdown', function(e) {
      if (strokes.length >= MAX_STROKES) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawing = true;
      var p = getPos(e);
      currentStroke = [p];
    });

    canvas.addEventListener('pointermove', function(e) {
      if (!isDrawing) return;
      e.preventDefault();
      var p = getPos(e);
      var last = currentStroke[currentStroke.length - 1];
      var dx = p.x - last.x;
      var dy = p.y - last.y;
      if (dx * dx + dy * dy < MIN_POINT_DIST * MIN_POINT_DIST) return;
      currentStroke.push(p);
      redraw();
    });

    canvas.addEventListener('pointerup', function(e) {
      if (!isDrawing) return;
      isDrawing = false;
      if (currentStroke.length >= 2) {
        var assisted = assistStroke(currentStroke);
        strokes.push(norm(assisted));
        updateCount();
        scheduleSave();
      }
      currentStroke = [];
      redraw();
    });

    canvas.addEventListener('pointercancel', function() {
      isDrawing = false;
      currentStroke = [];
      redraw();
    });

    /* ── Save to server ── */
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToServer, 1500);
    }

    function saveToServer() {
      var body = JSON.stringify({ seed: SEED, strokes: strokes });
      fetch('/api/cards/do-game-zen-garden/action/saveStrokes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      }).catch(function() { /* silent – strokes live in memory, will retry */ });
    }

    /* ── Undo ── */
    document.getElementById('zen-undo').addEventListener('click', function() {
      if (strokes.length === 0) return;
      strokes.pop();
      updateCount();
      redraw();
      scheduleSave();
    });

    /* ── Clear ── */
    document.getElementById('zen-clear').addEventListener('click', function() {
      if (strokes.length === 0) return;
      strokes = [];
      updateCount();
      redraw();
      scheduleSave();
    });

    /* ── Initial render ── */
    redraw();
  })();
  </script>
</div>`;
    },
});
