import { useId, useRef } from 'react';
import type { KeyDef } from '@shared/types';

interface Props {
  keys: KeyDef[];
  colors?: Record<number, [number, number, number]>;
  selected?: Set<number>;
  labels?: Record<number, string>;
  onKey?: (code: number, drag: boolean) => void;
  /** Background glow colour for the whole board. */
  glow?: string;
  dimUnpainted?: boolean;
  /** Render the lights over a top-down photo instead of the vector board. */
  photo?: { src: string; width: number; height: number };
}

/** Vector keyboard rendered from the vendor layout; coordinates are in the 800x300 image space. */
export const KeyboardView = ({ keys, colors = {}, selected, labels = {}, onKey, glow, dimUnpainted, photo }: Props) => {
  const dragging = useRef(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (photo) {
    // Frame the keys, not the photo: every keyboard then shows at the same scale regardless of the
    // margins baked into its image. Padding leaves room for the case around the outermost keys.
    const kx0 = Math.min(...keys.map((k) => k.x)), ky0 = Math.min(...keys.map((k) => k.y));
    const kx1 = Math.max(...keys.map((k) => k.x + k.w)), ky1 = Math.max(...keys.map((k) => k.y + k.h));
    const padX = (kx1 - kx0) * 0.075, padY = (ky1 - ky0) * 0.16;
    const vb = `${kx0 - padX} ${ky0 - padY} ${kx1 - kx0 + padX * 2} ${ky1 - ky0 + padY * 2}`;
    return (
      <svg viewBox={vb} className="w-full select-none" onMouseLeave={() => (dragging.current = false)} onMouseUp={() => (dragging.current = false)}>
        <defs>
          <filter id="kblur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.5" /></filter>
          {/* Keycaps are opaque: the glow is only visible in the gaps between caps. */}
          <mask id="kgaps">
            <rect x="0" y="0" width={photo.width} height={photo.height} fill="#fff" />
            {keys.map((k) => <rect key={k.code} x={k.x + 1} y={k.y + 1} width={k.w - 2} height={k.h - 2} rx="3" fill="#000" />)}
          </mask>
        </defs>
        <image href={photo.src} width={photo.width} height={photo.height} />
        {/* Light spilling between the caps: one LED under each switch, towards the bottom of the cap. */}
        <g mask="url(#kgaps)">
          {keys.map((k) => {
            const c = colors[k.code];
            if (!c) return null;
            const v = Math.max(c[0], c[1], c[2]) / 255;
            return <ellipse key={k.code} cx={k.x + k.w / 2} cy={k.y + k.h * 0.82} rx={k.w * 0.46 + 1} ry={k.h * 0.34 + 1} style={{ fill: `rgb(${c[0]},${c[1]},${c[2]})`, opacity: 0.3 + v * 0.45, mixBlendMode: 'screen' }} filter="url(#kblur)" />;
          })}
        </g>
        {/* The same light faintly tinting the lower edge of each cap, as on the real (white) keycaps. */}
        <g>
          {keys.map((k) => {
            const c = colors[k.code];
            if (!c) return null;
            const v = Math.max(c[0], c[1], c[2]) / 255;
            return <rect key={k.code} x={k.x + 1} y={k.y + 1} width={k.w - 2} height={k.h - 2} rx="3" fill={`url(#kcap-${uid}-${k.code})`} style={{ opacity: v < 0.04 ? 0 : 0.12 + v * 0.2, mixBlendMode: 'multiply' }} />;
          })}
        </g>
        <defs>
          {keys.map((k) => {
            const c = colors[k.code];
            if (!c) return null;
            return (
              <linearGradient key={k.code} id={`kcap-${uid}-${k.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.6" stopColor="#fff" />
                <stop offset="1" stopColor={`rgb(${c[0]},${c[1]},${c[2]})`} />
              </linearGradient>
            );
          })}
        </defs>
        {keys.map((k) => (
          <rect key={k.code} className="key" data-selected={selected?.has(k.code) ? 'true' : 'false'} x={k.x} y={k.y} width={k.w} height={k.h} rx="4" fill="transparent" stroke={selected?.has(k.code) ? 'var(--color-accent)' : 'transparent'} strokeWidth="2"
            onMouseDown={(e) => { e.preventDefault(); dragging.current = true; onKey?.(k.code, false); }}
            onMouseEnter={() => { if (dragging.current) onKey?.(k.code, true); }} />
        ))}
      </svg>
    );
  }
  // Vendor layouts describe the cap top only, with different gaps per model. Normalise so each cap
  // fills its pitch minus a fixed 4-unit gap, keeping the key centre; the board then looks the same for every model.
  const norm = (() => {
    const rows = new Map<number, KeyDef[]>();
    for (const k of keys) { const r = Math.round(k.y / 10); rows.set(r, [...(rows.get(r) ?? []), k]); }
    const pitches: number[] = [];
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) { const d = sorted[i].x - sorted[i - 1].x; if (d > 0 && d < 60 && Math.abs(sorted[i].w - sorted[i - 1].w) < 4) pitches.push(d - sorted[i - 1].w); }
    }
    pitches.sort((a, b) => a - b);
    const gap = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 7;
    const grow = Math.max(0, gap - 4);
    return (k: KeyDef) => ({ x: k.x - grow / 2, y: k.y - grow / 2, w: k.w + grow, h: k.h + grow });
  })();
  const boxes = new Map(keys.map((k) => [k.code, norm(k)]));
  const minX = Math.min(...[...boxes.values()].map((b) => b.x)) - 14;
  const maxX = Math.max(...[...boxes.values()].map((b) => b.x + b.w)) + 14;
  const minY = Math.min(...[...boxes.values()].map((b) => b.y)) - 14;
  const maxY = Math.max(...[...boxes.values()].map((b) => b.y + b.h)) + 14;

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="w-full select-none"
      onMouseLeave={() => (dragging.current = false)}
      onMouseUp={() => (dragging.current = false)}
    >
      <defs>
        <filter id="kglow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx="18" fill="var(--color-bg-2)" stroke="var(--color-line)" />
      {glow && <rect x={minX + 6} y={minY + 6} width={maxX - minX - 12} height={maxY - minY - 12} rx="14" fill={glow} opacity="0.12" filter="url(#kglow)" />}
      {keys.map((kk) => {
        const k = { ...kk, ...boxes.get(kk.code)! };
        const c = colors[k.code];
        const fill = c ? `rgb(${c[0]},${c[1]},${c[2]})` : 'var(--color-panel-2)';
        const lum = c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 0;
        const label = labels[k.code] ?? k.name.replace('_L', '').replace('_R', '');
        const small = label.length > 4;
        return (
          <g
            key={k.code}
            className="key"
            data-selected={selected?.has(k.code) ? 'true' : 'false'}
            onMouseDown={(e) => { e.preventDefault(); dragging.current = true; onKey?.(k.code, false); }}
            onMouseEnter={() => { if (dragging.current) onKey?.(k.code, true); }}
          >
            {c && <rect x={k.x - 2} y={k.y - 2} width={k.w + 4} height={k.h + 4} rx="7" fill={fill} opacity="0.55" filter="url(#kglow)" />}
            <rect x={k.x} y={k.y} width={k.w} height={k.h} rx="5" fill={fill} stroke="var(--color-line-2)" opacity={dimUnpainted && !c ? 0.5 : 1} />
            <text
              x={k.x + k.w / 2}
              y={k.y + k.h / 2 + (small ? 2.5 : 3.5)}
              textAnchor="middle"
              fontSize={small ? 7 : 10}
              fontWeight="600"
              fill={c ? (lum > 0.6 ? '#111' : '#fff') : 'var(--color-text)'}
              style={{ pointerEvents: 'none', fontFamily: 'var(--font-sans)' }}
            >
              {label.length > 9 ? label.slice(0, 8) + '…' : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
