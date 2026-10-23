// Settings that open in a dialog from the settings page, Legion Toolkit style.
import { Download, FolderOpen, Play, Upload } from 'lucide-react';
import type { AppPrefs, OsdPosition } from '@shared/ipc';
import { useStore, useT } from '../store';
import { Dropdown, Modal, OptionRow, Toggle } from './ui';

export const NotificationSettings = ({ onClose }: { onClose: () => void }) => {
  const t = useT();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const positions: { value: OsdPosition; label: string }[] = [
    { value: 'top-left', label: t('posTopLeft') }, { value: 'top-center', label: t('posTopCenter') }, { value: 'top-right', label: t('posTopRight') },
    { value: 'center', label: t('posCenter') },
    { value: 'bottom-left', label: t('posBottomLeft') }, { value: 'bottom-center', label: t('posBottomCenter') }, { value: 'bottom-right', label: t('posBottomRight') },
  ];
  const durations: { value: AppPrefs['osdDuration']; label: string }[] = [{ value: 'short', label: t('durShort') }, { value: 'normal', label: t('durNormal') }, { value: 'long', label: t('durLong') }];
  const preview = (): void => window.aula.showOsd({ device: 'AULA Toolkit', kind: 'dpi', value: '1600', unit: 'DPI', stage: 1, count: 4 });

  return (
    <Modal title={t('notifTitle')} onClose={onClose}>
      <OptionRow><Toggle label={t('osdToggle')} hint={t('osdToggleHint')} on={prefs.osd} onChange={(v) => void setPrefs({ osd: v })} /></OptionRow>
      <div className="flex flex-col gap-2 transition-opacity" style={prefs.osd ? undefined : { opacity: 0.45, pointerEvents: 'none' }}>
        <OptionRow><Toggle label={t('osdOnTop')} hint={t('osdOnTopHint')} on={prefs.osdOnTop} onChange={(v) => void setPrefs({ osdOnTop: v })} /></OptionRow>
        <OptionRow><Toggle label={t('osdAllDisplays')} hint={t('osdAllDisplaysHint')} on={prefs.osdAllDisplays} onChange={(v) => void setPrefs({ osdAllDisplays: v })} /></OptionRow>
        <OptionRow>
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm">{t('osdPosition')}</span>
            <Dropdown value={prefs.osdPosition} options={positions} onChange={(v) => void setPrefs({ osdPosition: v })} />
          </div>
        </OptionRow>
        <OptionRow>
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm">{t('osdDuration')}</span>
            <Dropdown value={prefs.osdDuration} options={durations} onChange={(v) => void setPrefs({ osdDuration: v })} />
          </div>
        </OptionRow>
        <button className="btn self-end mt-1" onClick={preview}><Play size={14} />{t('osdPreview')}</button>
      </div>
    </Modal>
  );
};

export const BackupSettings = ({ onClose }: { onClose: () => void }) => {
  const t = useT();
  const toast = useStore((s) => s.toast);
  const backup = async (): Promise<void> => { if (await window.aula.backup()) toast(t('backupSaved'), 'ok'); };
  const restore = async (): Promise<void> => {
    if (!confirm(t('backupRestoreConfirm'))) return;
    if ((await window.aula.restore()) === 'invalid') toast(t('backupInvalid'), 'error');
  };

  return (
    <Modal title={t('backupTitle')} onClose={onClose}>
      <OptionRow>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="flex flex-col"><span className="text-sm">{t('backupCreate')}</span><span className="text-xs text-muted">{t('backupCreateHint')}</span></span>
          <button className="btn shrink-0" onClick={() => void backup()}><Download size={14} />{t('backupCreate')}</button>
        </div>
      </OptionRow>
      <OptionRow>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="flex flex-col"><span className="text-sm">{t('backupRestore')}</span><span className="text-xs text-muted">{t('backupRestoreHint')}</span></span>
          <button className="btn shrink-0" onClick={() => void restore()}><Upload size={14} />{t('backupRestore')}</button>
        </div>
      </OptionRow>
      <button className="btn btn-ghost self-start mt-1" onClick={() => void window.aula.openFolder('backups')}><FolderOpen size={14} />{t('folderBackups')}</button>
    </Modal>
  );
};
