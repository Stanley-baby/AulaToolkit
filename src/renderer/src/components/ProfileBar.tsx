import { useState } from 'react';
import { Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { modelById } from '@shared/models';
import type { DeviceSettingsFile, Profile } from '@shared/types';
import { useStore, useT } from '../store';
import { Dropdown } from './ui';

export const ProfileBar = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const s = useStore();
  const file = s.settings[modelId];
  const model = modelById(modelId)!;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  if (!file) return null;
  const active = file.profiles.find((p) => p.id === file.activeProfile)!;

  const startRename = (): void => { setName(active.name); setRenaming(true); };
  const commitRename = (): void => { if (name.trim()) s.renameProfile(modelId, active.id, name.trim()); setRenaming(false); };

  const doImport = async (): Promise<void> => {
    const r = await window.aula.importJson();
    if (!r) return;
    const d = r.data as Profile | DeviceSettingsFile;
    if ('profiles' in d) s.replaceSettings(modelId, d);
    else if ('id' in d) {
      const p: Profile = { ...d, id: `${Date.now().toString(36)}` };
      s.replaceSettings(modelId, { ...file, profiles: [...file.profiles, p], activeProfile: p.id });
    }
    s.toast(t('saved'), 'ok');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label">{t('profile')}</span>
      {renaming ? (
        <input autoFocus className="input w-48" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }} />
      ) : (
        <Dropdown value={file.activeProfile} options={file.profiles.map((p) => ({ value: p.id, label: p.name }))} onChange={(id) => s.setActiveProfile(modelId, id)} minWidth={200} />
      )}
      <button className="btn btn-ghost btn-icon" title={t('rename')} onClick={startRename}><Pencil size={15} /></button>
      <button className="btn btn-ghost btn-icon" title={t('newProfile')} onClick={() => s.addProfile(modelId, `${t('profile')} ${file.profiles.length + 1}`)}><Plus size={15} /></button>
      <button className="btn btn-ghost btn-icon" title={t('duplicate')} onClick={() => s.duplicateProfile(modelId, active.id)}><Copy size={15} /></button>
      <button className="btn btn-ghost btn-icon" title={t('delete')} disabled={file.profiles.length <= 1} onClick={() => { if (confirm(t('confirmDelete'))) s.removeProfile(modelId, active.id); }}><Trash2 size={15} /></button>
      <span className="w-px h-5 mx-1" style={{ background: 'var(--color-line)' }} />
      <button className="btn btn-ghost btn-sm" onClick={() => void window.aula.exportJson(`${model.name}-${active.name}`, active)}><Download size={14} />{t('export')}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => void doImport()}><Upload size={14} />{t('import')}</button>
      <div className="flex-1" />
    </div>
  );
};
