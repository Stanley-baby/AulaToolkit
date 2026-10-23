import { RotateCcw, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { defaultKeyboardProfile } from '@shared/defaults';
import { modelById } from '@shared/models';
import { imageFor } from '../assets';
import { useStore, useT, useTn } from '../store';
import { Card } from './ui';

/** Per-device preferences that are not part of a profile: colourway, removal from the device list. */
export const DeviceSettingsPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const variant = useStore((s) => s.settings[modelId]?.variant);
  const setVariant = useStore((s) => s.setVariant);
  const forget = useStore((s) => s.forgetDevice);
  const online = useStore((s) => !!s.deviceFor(modelId));
  const call = useStore((s) => s.call);
  const update = useStore((s) => s.updateProfile);
  const toast = useStore((s) => s.toast);
  const busy = useStore((s) => !!s.busy[`${modelId}:resetKeyboard`] || !!s.busy[`${modelId}:factoryReset`]);
  const reset = async (method: 'resetKeyboard' | 'factoryReset'): Promise<void> => {
    if (!confirm(t(method === 'factoryReset' ? 'factoryResetConfirm' : 'resetKeyboardConfirm'))) return;
    await call(modelId, method);
    update(modelId, (p) => { p.keyboard = defaultKeyboardProfile(model); }, null);
    toast(t('resetDone'), 'ok');
  };
  const nickname = useStore((s) => s.settings[modelId]?.nickname ?? '');
  const setNickname = useStore((s) => s.setNickname);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {model.variants && (
        <Card title={t('colour')}>
          <div className="flex gap-3">
            {model.variants.map((v) => {
              const sel = (variant ?? model.variants![0].id) === v.id;
              return (
                <button key={v.id} onClick={() => setVariant(modelId, v.id)} className="flex flex-col items-center gap-2">
                  <div className="h-24 w-24 rounded-2xl overflow-hidden transition-all p-2" style={{ boxShadow: sel ? '0 0 0 2px var(--color-accent)' : '0 0 0 1px var(--color-line)', background: 'var(--color-bg-2)' }}>
                    <img src={imageFor(v.image)} alt="" className="h-full w-full object-contain" draggable={false} />
                  </div>
                  <span className="text-xs" style={{ color: sel ? 'var(--color-accent-2)' : 'var(--color-muted)' }}>{tn(v.name)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      <Card title={t('nickname')}>
        <input className="input w-full" placeholder={model.name} value={nickname} maxLength={24} onChange={(e) => setNickname(modelId, e.target.value)} />
        <div className="text-xs text-muted mt-2">{t('nicknameHint')}</div>
      </Card>
      {model.kind === 'keyboard' && (
        <Card title={t('resetKeyboard')}>
          <p className="text-sm text-muted mb-3">{t('resetKeyboardHint')}</p>
          <button className="btn" disabled={!online || busy} onClick={() => void reset('resetKeyboard')}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}{t('resetKeyboard')}</button>
        </Card>
      )}
      {model.kind === 'keyboard' && (
        <Card title={t('factoryReset')}>
          <p className="text-sm text-muted mb-3">{t('factoryResetHint')}</p>
          <button className="btn" disabled={!online || busy} style={{ color: 'var(--color-danger)' }} onClick={() => void reset('factoryReset')}><AlertTriangle size={14} />{t('factoryReset')}</button>
        </Card>
      )}
      <Card title={t('removeDevice')}>
        <p className="text-sm text-muted mb-3">{t('removeDeviceHint')}</p>
        <button className="btn" disabled={online} style={{ color: 'var(--color-danger)' }} onClick={() => { if (confirm(t('removeDeviceConfirm'))) forget(modelId); }}><Trash2 size={14} />{t('removeDevice')}</button>
        {online && <div className="text-xs text-muted mt-2">{t('removeDeviceOnline')}</div>}
      </Card>
    </div>
  );
};
