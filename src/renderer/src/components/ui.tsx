import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';

export const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) => (
  <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
    {label && (
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    )}
    <button type="button" className="switch" data-on={on} onClick={() => onChange(!on)} aria-pressed={on} />
  </label>
);

export const Slider = ({ value, min, max, step = 1, onChange, label, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label?: string; format?: (v: number) => string }) => (
  <div className="py-2">
    {label && (
      <div className="flex justify-between mb-2">
        <span className="text-sm">{label}</span>
        <span className="text-xs font-mono text-muted">{format ? format(value) : value}</span>
      </div>
    )}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>
);

/** Custom dropdown: styled trigger + floating list, keyboard accessible. */
export const Dropdown = <T extends string | number>({ value, options, onChange, className = '', minWidth = 176 }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; className?: string; minWidth?: number }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 0, up: false });
  const cur = options.find((o) => o.value === value);
  const place = (): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const est = Math.min(280, options.length * 36 + 12);
    const up = r.bottom + est + 8 > window.innerHeight;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, up });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    const re = (): void => place();
    window.addEventListener('mousedown', close); window.addEventListener('keydown', key);
    window.addEventListener('resize', re); window.addEventListener('scroll', re, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`} style={{ minWidth }}>
      <button type="button" className="dd-trigger" data-open={open} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{cur?.label ?? String(value)}</span>
        <ChevronDown size={14} className="shrink-0 opacity-70 transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && createPortal(
        <ul ref={menuRef} className="dd-menu fade-in" role="listbox" style={{ position: 'fixed', left: pos.left, top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, minWidth: pos.width, zIndex: 1000 }}>
          {options.map((o) => (
            <li key={String(o.value)} role="option" aria-selected={o.value === value} className="dd-item" data-active={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-[11px] text-muted">{o.hint}</span>}
              {o.value === value && <Check size={14} />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
};

export const Select = <T extends string | number>({ value, options, onChange, label, className = '' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string; className?: string }) => (
  <div className={`flex items-center justify-between gap-4 py-2 ${className}`}>
    {label && <span className="text-sm">{label}</span>}
    <Dropdown value={value} options={options} onChange={onChange} />
  </div>
);

export const Card = ({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) => (
  <section className={`panel p-5 ${className}`}>
    {(title || right) && (
      <header className="flex items-center justify-between mb-4">
        <h3 className="h2">{title}</h3>
        {right}
      </header>
    )}
    {children}
  </section>
);

/** Centred dialog over a dimmed backdrop; closes on Escape, the X button or a click outside. */
export const Modal = ({ title, onClose, children, width = 520 }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) => {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(5,7,12,0.7)', backdropFilter: 'blur(4px)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel w-full max-h-full flex flex-col fade-in" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3 className="h2">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm !px-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="px-5 pb-5 overflow-y-auto flex flex-col gap-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

/** A settings entry that opens a dialog: icon, title, hint and a chevron. */
export const NavRow = ({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint?: string; onClick: () => void }) => (
  <button type="button" className="panel w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:brightness-110" onClick={onClick}>
    <span className="text-accent-2 shrink-0">{icon}</span>
    <span className="flex flex-col flex-1 min-w-0">
      <span className="text-sm font-semibold">{title}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </span>
    <ChevronRight size={16} className="text-muted shrink-0" />
  </button>
);

/** One bordered option block inside a dialog. */
export const OptionRow = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl px-4 py-2" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>{children}</div>
);

export const Segmented =<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) => (
  <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        style={value === o.value ? { background: 'var(--color-panel-2)', boxShadow: 'inset 0 0 0 1px var(--color-line-2)' } : { color: 'var(--color-muted)' }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const rgbToHex = (c: [number, number, number]): string => '#' + c.map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join('');
export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const PRESET_COLORS: [number, number, number][] = [
  [255, 255, 255], [255, 90, 31], [255, 0, 0], [255, 160, 0], [255, 230, 0], [0, 255, 80], [0, 220, 255], [0, 90, 255], [160, 0, 255], [255, 0, 200],
];

export const ColorField = ({ value, onChange, label }: { value: [number, number, number]; onChange: (c: [number, number, number]) => void; label?: string }) => (
  <div className="py-2">
    {label && <div className="text-sm mb-2">{label}</div>}
    <div className="flex items-center gap-2 flex-wrap">
      <input type="color" value={rgbToHex(value)} onChange={(e) => onChange(hexToRgb(e.target.value))} />
      {PRESET_COLORS.map((c) => (
        <button
          key={c.join()}
          type="button"
          onClick={() => onChange(c)}
          className="h-6 w-6 rounded-full border transition-transform hover:scale-110"
          style={{ background: rgbToHex(c), borderColor: rgbToHex(value) === rgbToHex(c) ? '#fff' : 'rgba(0,0,0,.4)' }}
          aria-label={rgbToHex(c)}
        />
      ))}
      <span className="font-mono text-xs text-muted ml-1">{rgbToHex(value)}</span>
    </div>
  </div>
);

export const Empty = ({ icon, title, hint, children }: { icon?: ReactNode; title: string; hint?: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
    {icon && <div className="text-muted opacity-70">{icon}</div>}
    <div className="text-lg font-semibold">{title}</div>
    {hint && <div className="text-sm text-muted max-w-md">{hint}</div>}
    {children}
  </div>
);
