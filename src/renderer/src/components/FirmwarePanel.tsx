import { useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { FirmwarePhase, FirmwareState } from '@shared/ipc';
import { useStore, useT } from '../store';
import { Card } from './ui';

const labels: Partial<Record<FirmwarePhase, 'firmwarePreparing' | 'firmwareErasing' | 'firmwareWriting' | 'firmwareVerifying' | 'firmwareRestarting'>> = {
  preparing: 'firmwarePreparing', erasing: 'firmwareErasing', programming: 'firmwareWriting',
  verifying: 'firmwareVerifying', restarting: 'firmwareRestarting',
};

export const FirmwarePanel = () => {
  const t = useT();
  const device = useStore((s) => s.deviceFor('s75pro'));
  const [state, setState] = useState<FirmwareState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const off = window.aula.onFirmware((next) => { if (mounted) setState(next); });
    void window.aula.firmwareState().then((next) => { if (mounted) setState(next); }).catch(() => { if (mounted) setError(t('firmwareFailed')); });
    return () => { mounted = false; off(); };
  }, [device?.key, t]);

  const run = async (action: () => Promise<FirmwareState>, onError: string): Promise<void> => {
    setError('');
    try { setState(await action()); } catch { setError(onError); }
  };
  const label = state ? labels[state.phase] : undefined;
  const supportedVersion = ['0x0103', 'F104', 'F105', 'F106'].includes(state?.deviceVersion ?? '');
  const canStart = !!state?.selected && !state.busy && !state.recoveryRequired && device?.link === 'usb' && supportedVersion;

  return (
    <Card title={t('firmwareTitle')}>
      <p className="text-sm text-muted mb-3">{t('firmwareHint')}</p>
      <p className="text-sm">{t('firmwareCurrent')}: {state?.deviceVersion ?? '—'}</p>
      <p className="text-sm mb-3">{t('firmwareSelected')}: {state?.selected?.version ?? '—'}</p>
      <p className="text-xs text-muted mb-3">{t('firmwareBackup')}</p>
      {state?.selected && state.selected.version !== 'F106' && <p className="text-xs text-muted mb-3">{t('firmwareOlder')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!state || state.busy || state.recoveryRequired || state.selected?.source === 'bundled'} onClick={() => void run(() => window.aula.firmwareBundled(), t('firmwareNoImage'))}>{t('firmwareBundled')}</button>
        <button type="button" className="btn" disabled={!state || state.busy || state.recoveryRequired || state.selected?.source === 'previous'} onClick={() => void run(() => window.aula.firmwarePrevious(), t('firmwareNoImage'))}>{t('firmwarePrevious')}</button>
        <button type="button" className="btn" disabled={!state || state.busy || state.recoveryRequired} onClick={() => void run(() => window.aula.firmwareSelect(), t('firmwareInvalid'))}>{t('firmwareChoose')}</button>
        <button type="button" className="btn" disabled={!canStart} onClick={() => void run(async () => {
          await useStore.getState().save('s75pro');
          return window.aula.firmwareStart();
        }, t('firmwareFailed'))}><UploadCloud size={14} />{t('firmwareStart')}</button>
      </div>
      {!state?.selected && <p className="text-xs text-muted mt-3">{t('firmwareNoImage')}</p>}
      {device?.link !== 'usb' && <p className="text-xs text-muted mt-3">{t('firmwareUsb')}</p>}
      {device?.link === 'usb' && state && !state.busy && !state.recoveryRequired && !supportedVersion && <p className="text-xs text-muted mt-3">{t('firmwareUnsupported')}</p>}
      {state?.busy && (
        <div className="mt-3">
          <p className="text-sm mb-1">{label ? t(label) : t('firmwarePreparing')}</p>
          <progress className="w-full" aria-label={t('firmwareTitle')} max={100} {...(state.phase === 'programming' ? { value: state.progress } : {})} />
          {state.phase === 'programming' && <span className="text-xs text-muted">{state.progress}%</span>}
        </div>
      )}
      {state?.phase === 'success' && <p className="text-sm mt-3" role="status">{t('firmwareSuccess')}</p>}
      {(error || state?.phase === 'error') && (
        <p className="text-sm mt-3" role="alert" style={{ color: 'var(--color-danger)' }}>
          {state?.recoveryRequired ? t('firmwareRecovery') : error || t('firmwareFailed')}
        </p>
      )}
      {state?.recoveryRequired && <button type="button" className="btn mt-3" disabled={state.busy} onClick={() => void run(() => window.aula.firmwareRecheck(), t('firmwareRecovery'))}>{t('firmwareRecheck')}</button>}
    </Card>
  );
};
