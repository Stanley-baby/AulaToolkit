import { useEffect, useState } from 'react';
import { AlertTriangle, Power } from 'lucide-react';
import { useStore, useT } from '../store';

/** Shown on device pages while an official AULA driver app is running alongside AULA Toolkit. */
export const VendorWarning = () => {
  const t = useT();
  const toast = useStore((s) => s.toast);
  const setPrefs = useStore((s) => s.setPrefs);
  const [names, setNames] = useState<string[]>([]);
  const load = (): Promise<void> => window.aula.vendorStatus().then((s) => setNames(s.running.map((r) => r.name)));
  useEffect(() => { void load(); const id = setInterval(() => void load(), 8000); return () => clearInterval(id); }, []);
  const block = async (): Promise<void> => {
    if (!(await window.aula.vendorSetBlock(true))) return;
    await setPrefs({ blockVendorSoftware: true });
    const n = await window.aula.vendorKill();
    toast(t('vendorKilled').replace('{n}', String(n)), 'ok');
    void load();
  };
  if (!names.length) return null;
  // Centred band on the bottom edge, with slanted ends (clip-path), floating above the content.
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 z-40 flex items-center gap-2 text-xs" style={{ height: 28, padding: '0 28px', background: 'color-mix(in srgb, var(--color-warn) 22%, var(--color-bg))', borderTop: '1px solid color-mix(in srgb, var(--color-warn) 60%, transparent)', clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 100%, 0 100%)', maxWidth: 'calc(100% - 32px)', whiteSpace: 'nowrap' }}>
      <AlertTriangle size={13} className="text-warn shrink-0" />
      <span className="truncate">{t('vendorConflict').replace('{apps}', names.join(', '))}</span>
      <button className="underline shrink-0 flex items-center gap-1 ml-2" style={{ color: 'var(--color-warn)' }} onClick={() => void block()}><Power size={12} />{t('vendorBlock')}</button>
    </div>
  );
};
