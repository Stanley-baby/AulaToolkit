import { useEffect, useState } from 'react';
import { Bug, ExternalLink, FolderOpen, Link2, MessagesSquare, Package, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { MODELS } from '@shared/models';
import { useStore, useT, useTn } from '../store';
import logo from '../assets/logo.svg';
import { Wordmark } from './Wordmark';

// Empty strings hide the rows.
export const LINKS = {
  github: 'https://github.com/Stanley-baby/AulaToolkit',
  releases: 'https://github.com/Stanley-baby/AulaToolkit/releases',
  issues: 'https://github.com/Stanley-baby/AulaToolkit/issues',
  discord: 'https://discord.gg/u9FbaJGtCe',
  aula: 'https://www.aulastar.com/driver/',
};

const LIBRARIES: [string, string][] = [
  ['Electron', 'https://www.electronjs.org/'], ['React', 'https://react.dev/'], ['node-hid', 'https://github.com/node-hid/node-hid'],
  ['Tailwind CSS', 'https://tailwindcss.com/'], ['Zustand', 'https://github.com/pmndrs/zustand'], ['Lucide', 'https://lucide.dev/'],
  ['Vite', 'https://vite.dev/'], ['electron-vite', 'https://electron-vite.org/'], ['Vitest', 'https://vitest.dev/'], ['electron-builder', 'https://www.electron.build/'],
];
const CREDITS: [string, string][] = [
  ['open-aula', 'https://github.com/paulcoding810/open-aula'], ['OpenMouse', 'https://github.com/OpenMouse-Project/mouse-protocol'],
  ['IncottHIDApp', 'https://github.com/romkazor/IncottHIDApp'], ['AulaSofwareLinux', 'https://github.com/thought-train/AulaSofwareLinux'],
];

export const About = () => {
  const t = useT();
  const tn = useTn();
  const toast = useStore((s) => s.toast);
  const [info, setInfo] = useState<{ version: string; build: string; electron: string; chrome: string } | null>(null);
  useEffect(() => { void window.aula.buildInfo().then(setInfo); }, []);

  const Row = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-2 text-sm py-1.5 hover:underline" style={{ color: 'var(--color-accent-2)' }}>{icon}{label}</button>
  );
  const Pill = ({ name, url }: { name: string; url: string }) => (
    <button onClick={() => window.aula.openExternal(url)} className="chip hover:border-current" style={{ color: 'var(--color-accent-2)' }}>{name}</button>
  );

  return (
    <div className="flex flex-col gap-7 fade-in">
      <section className="flex items-start gap-5">
        <img src={logo} alt="" className="h-16 w-16" draggable={false} />
        <div className="flex flex-col gap-1">
          <Wordmark size={22} className="mb-1" />
          <div className="text-sm text-muted">{t('version')} {info?.version ?? '…'}</div>
          <div className="text-sm text-muted">{t('build')} {info?.build ?? '…'} · Electron {info?.electron ?? ''}</div>
          <div className="text-sm text-muted mt-2">© {new Date().getFullYear()} <button className="hover:underline" style={{ color: 'var(--color-accent-2)' }} onClick={() => window.aula.openExternal('https://github.com/Livvaa')}>Livvaa</button> · {t('licence')}</div>
          <div className="text-xs text-muted">{t('notAffiliated')}</div>
        </div>
      </section>

      <section>
        <h3 className="label mb-2">{t('links')}</h3>
        <div className="flex flex-col">
          {LINKS.github ? <Row icon={<Link2 size={14} />} label={t('projectPage')} onClick={() => window.aula.openExternal(LINKS.github)} /> : <div className="text-sm text-muted py-1.5 flex items-center gap-2"><Link2 size={14} />{t('projectPage')} · {t('comingSoon')}</div>}
          {LINKS.releases && <Row icon={<Package size={14} />} label={t('latestRelease')} onClick={() => window.aula.openExternal(LINKS.releases)} />}
          {LINKS.issues && <Row icon={<Bug size={14} />} label={t('reportIssue')} onClick={() => window.aula.openExternal(LINKS.issues)} />}
          {LINKS.discord && <Row icon={<MessagesSquare size={14} />} label={t('discord')} onClick={() => window.aula.openExternal(LINKS.discord)} />}
          <Row icon={<ExternalLink size={14} />} label={t('officialDrivers')} onClick={() => window.aula.openExternal(LINKS.aula)} />
          {LINKS.github && <Row icon={<Link2 size={14} />} label={t('contributeTranslation')} onClick={() => window.aula.openExternal(`${LINKS.github}/tree/main/src/shared/locales`)} />}
        </div>
      </section>

      <section>
        <h3 className="label mb-2">{t('supportedDevices')}</h3>
        <div className="flex flex-col gap-1.5">
          {MODELS.map((m) => (
            <div key={m.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium">{m.brand} {m.name}</span>
              <span className="text-muted">{tn(m.tagline)}</span>
              {m.verified
                ? <span className="chip chip-ok ml-auto"><ShieldCheck size={12} />{t('verifiedHw')}</span>
                : <span className="chip chip-warn ml-auto"><ShieldQuestion size={12} />{t('untestedHw')}</span>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="label mb-2">{t('libraries')}</h3>
        <div className="flex flex-wrap gap-2">{LIBRARIES.map(([n, u]) => <Pill key={n} name={n} url={u} />)}</div>
      </section>

      <section>
        <h3 className="label mb-2">{t('protocolCredits')}</h3>
        <div className="flex flex-wrap gap-2">{CREDITS.map(([n, u]) => <Pill key={n} name={n} url={u} />)}</div>
      </section>

      <section>
        <h3 className="label mb-2">{t('folders')}</h3>
        <div className="flex flex-col">
          <Row icon={<FolderOpen size={14} />} label={t('folderData')} onClick={() => void window.aula.openFolder('data')} />
          <Row icon={<FolderOpen size={14} />} label={t('folderLogs')} onClick={() => void window.aula.openFolder('logs')} />
          <Row icon={<FolderOpen size={14} />} label={t('folderBackups')} onClick={() => void window.aula.openFolder('backups')} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn" onClick={() => void window.aula.saveDiagnostics().then((ok) => ok && toast(t('saved'), 'ok'))}><Bug size={14} />{t('diagnostics')}</button>
          <span className="text-xs text-muted">{t('diagnosticsHint')}</span>
        </div>
      </section>
    </div>
  );
};
