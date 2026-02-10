/**
 * Gallery HTML template helper — vanilla HTML/CSS/JS implementation
 * inspired by https://www.tool-ui.com/docs/gallery
 *
 * Produces a responsive image grid with lightbox, suitable for embedding
 * inside any HashDo card template.
 */

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  title?: string;
  caption?: string;
  source?: { label: string; url?: string };
}

export interface GalleryConfig {
  images: GalleryImage[];
  title?: string;
  description?: string;
  /** Max images visible before showing "+N" overflow. Defaults to 8. */
  maxVisible?: number;
}

/**
 * Generate a self-contained gallery HTML block (grid + lightbox).
 * Uses a unique ID per invocation to avoid collisions when multiple
 * galleries appear on the same page.
 */
export function galleryHtml(config: GalleryConfig): string {
  const { images, title, description, maxVisible = 8 } = config;
  if (!images.length) return '';

  const uid = 'g' + Math.random().toString(36).slice(2, 8);
  const visible = images.slice(0, maxVisible);
  const hiddenCount = Math.max(0, images.length - maxVisible);

  const header =
    title || description
      ? `<div style="padding:0 0 10px;">
          ${title ? `<div style="font-size:15px;font-weight:600;color:#1f2937;letter-spacing:-0.01em;">${esc(title)}</div>` : ''}
          ${description ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;line-height:1.4;">${esc(description)}</div>` : ''}
        </div>`
      : '';

  const cells = visible
    .map((img, i) => {
      const isPortrait = img.width / img.height < 0.9;
      const isOverflow = hiddenCount > 0 && i === visible.length - 1;
      const overflowOverlay = isOverflow
        ? `<div style="position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(0,0,0,0.6);">
            <span style="font-size:22px;font-weight:600;color:#fff;">+${hiddenCount + 1}</span>
          </div>`
        : '';

      return `<div
        style="position:relative;cursor:pointer;${isPortrait ? 'grid-row:span 2;' : 'aspect-ratio:1/1;'}overflow:hidden;border-radius:10px;background:#f3f4f6;"
        onclick="${uid}_open(${i})"
        role="listitem"
      >
        <img
          src="${esc(img.src)}"
          alt="${esc(img.alt)}"
          width="${img.width}" height="${img.height}"
          loading="lazy" decoding="async" draggable="false"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          style="width:100%;height:100%;object-fit:cover;transition:transform .2s cubic-bezier(.4,0,.2,1);"
          onmouseover="this.style.transform='scale(1.04)'"
          onmouseout="this.style.transform='scale(1)'"
        />
        <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:4px;color:#9ca3af;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          <span style="font-size:11px;text-align:center;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(img.alt)}</span>
        </div>
        ${overflowOverlay}
      </div>`;
    })
    .join('');

  const lightbox = `
    <div id="${uid}_lb" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);align-items:center;justify-content:center;flex-direction:column;padding:24px;"
         onclick="if(event.target===this)${uid}_close()">
      <button onclick="${uid}_close()" aria-label="Close"
        style="position:absolute;top:16px;right:16px;z-index:10;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;transition:background .15s;"
        onmouseover="this.style.background='rgba(255,255,255,0.2)'"
        onmouseout="this.style.background='rgba(255,255,255,0.1)'"
      >&times;</button>

      <div style="display:flex;align-items:center;gap:12px;max-width:100%;max-height:100%;">
        <button onclick="${uid}_prev()" aria-label="Previous"
          style="flex-shrink:0;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;"
          onmouseover="this.style.background='rgba(255,255,255,0.2)'"
          onmouseout="this.style.background='rgba(255,255,255,0.1)'"
        >&#8249;</button>

        <img id="${uid}_lbimg" src="" alt=""
          style="max-height:80vh;max-width:calc(100vw - 120px);border-radius:10px;object-fit:contain;box-shadow:0 8px 32px rgba(0,0,0,0.4);" />

        <button onclick="${uid}_next()" aria-label="Next"
          style="flex-shrink:0;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;"
          onmouseover="this.style.background='rgba(255,255,255,0.2)'"
          onmouseout="this.style.background='rgba(255,255,255,0.1)'"
        >&#8250;</button>
      </div>

      <div id="${uid}_lbmeta" style="text-align:center;margin-top:12px;max-width:600px;"></div>
    </div>`;

  const script = `
    <script>
    (function(){
      var imgs = ${JSON.stringify(images.map(i => ({ src: i.src, alt: i.alt, title: i.title, caption: i.caption, source: i.source })))};
      var idx = 0;
      var lb = document.getElementById('${uid}_lb');
      var lbImg = document.getElementById('${uid}_lbimg');
      var lbMeta = document.getElementById('${uid}_lbmeta');

      function show(i) {
        idx = i;
        var img = imgs[i];
        if (!img) return;
        lbImg.src = img.src;
        lbImg.alt = img.alt;
        var meta = '';
        if (img.title) meta += '<div style="font-size:15px;font-weight:500;color:#fff;">' + img.title + '</div>';
        var sub = [];
        if (img.caption) sub.push(img.caption);
        if (img.source && img.source.label) {
          sub.push(img.source.url
            ? '<a href="' + img.source.url + '" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.6);text-decoration:underline;">' + img.source.label + '</a>'
            : img.source.label);
        }
        if (sub.length) meta += '<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">' + sub.join(' &middot; ') + '</div>';
        lbMeta.innerHTML = meta;
        lb.style.display = 'flex';
      }
      window['${uid}_open'] = show;
      window['${uid}_close'] = function(){ lb.style.display = 'none'; };
      window['${uid}_prev'] = function(){ show((idx - 1 + imgs.length) % imgs.length); };
      window['${uid}_next'] = function(){ show((idx + 1) % imgs.length); };
    })();
    </script>`;

  return `
    ${header}
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;" role="list">
      ${cells}
    </div>
    ${lightbox}
    ${script}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
