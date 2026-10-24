import { contextBridge, ipcRenderer } from 'electron';
import { CH, type AulaApi } from '@shared/ipc';
import type { DeviceStatus, LogEntry } from '@shared/types';
import type { CliRequest, CliResult, DevNavigate, DisplayPowerState, HwEvent, LiveLight, OsdPayload, UpdateState } from '@shared/ipc';

const api: AulaApi = {
  getDevices: () => ipcRenderer.invoke(CH.DEVICES),
  onDevices: (cb) => {
    const h = (_e: unknown, d: DeviceStatus[]): void => cb(d);
    ipcRenderer.on(CH.DEVICES_EVENT, h);
    return () => ipcRenderer.off(CH.DEVICES_EVENT, h);
  },
  call: (key, method, ...args) => ipcRenderer.invoke(CH.DEVICE_CALL, key, method, args),
  getLog: () => ipcRenderer.invoke(CH.LOG_GET),
  onLog: (cb) => {
    const h = (_e: unknown, d: LogEntry): void => cb(d);
    ipcRenderer.on(CH.LOG_EVENT, h);
    return () => ipcRenderer.off(CH.LOG_EVENT, h);
  },
  clearLog: () => ipcRenderer.invoke(CH.LOG_CLEAR),
  loadSettings: (modelId) => ipcRenderer.invoke(CH.SETTINGS_LOAD, modelId),
  saveSettings: (modelId, data) => ipcRenderer.invoke(CH.SETTINGS_SAVE, modelId, data),
  loadPrefs: () => ipcRenderer.invoke(CH.APP_PREFS_LOAD),
  savePrefs: (p) => ipcRenderer.invoke(CH.APP_PREFS_SAVE, p),
  minimize: () => ipcRenderer.send(CH.APP_MINIMIZE),
  maximize: () => ipcRenderer.send(CH.APP_MAXIMIZE),
  close: () => ipcRenderer.send(CH.APP_CLOSE),
  version: () => ipcRenderer.invoke(CH.APP_VERSION),
  openExternal: (url) => ipcRenderer.send(CH.APP_OPEN_EXTERNAL, url),
  exportJson: (name, data) => ipcRenderer.invoke(CH.APP_EXPORT_JSON, name, data),
  importJson: () => ipcRenderer.invoke(CH.APP_IMPORT_JSON),
  pickImage: () => ipcRenderer.invoke(CH.APP_PICK_IMAGE),
  rescan: () => ipcRenderer.invoke(CH.APP_RESCAN),
  openFolder: (kind) => ipcRenderer.invoke(CH.APP_OPEN_FOLDER, kind),
  buildInfo: () => ipcRenderer.invoke(CH.APP_BUILD_INFO),
  systemAccent: () => ipcRenderer.invoke(CH.APP_ACCENT),
  saveDiagnostics: () => ipcRenderer.invoke(CH.APP_DIAGNOSTICS),
  fullReset: () => ipcRenderer.invoke(CH.APP_FULL_RESET),
  backup: () => ipcRenderer.invoke(CH.APP_BACKUP),
  restore: () => ipcRenderer.invoke(CH.APP_RESTORE),
  vendorStatus: () => ipcRenderer.invoke(CH.VENDOR_STATUS),
  vendorKill: () => ipcRenderer.invoke(CH.VENDOR_KILL),
  updateCheck: () => ipcRenderer.invoke(CH.UPDATE_CHECK),
  updateDownload: () => ipcRenderer.invoke(CH.UPDATE_DOWNLOAD),
  updateInstall: () => ipcRenderer.send(CH.UPDATE_INSTALL),
  updateState: () => ipcRenderer.invoke(CH.UPDATE_STATE),
  batteryStats: (id) => ipcRenderer.invoke(CH.BATTERY_STATS, id),
  batteryClear: (id) => ipcRenderer.invoke(CH.BATTERY_CLEAR, id),
  onUpdate: (cb) => {
    const h = (_e: unknown, s: UpdateState): void => cb(s);
    ipcRenderer.on(CH.UPDATE_EVENT, h);
    return () => ipcRenderer.off(CH.UPDATE_EVENT, h);
  },
  onLiveLight: (cb) => {
    const h = (_e: unknown, l: LiveLight): void => cb(l);
    ipcRenderer.on(CH.DEVICE_LIVE_LIGHT, h);
    return () => ipcRenderer.off(CH.DEVICE_LIVE_LIGHT, h);
  },
  onDisplayPower: (cb) => {
    const h = (_e: unknown, state: DisplayPowerState): void => cb(state);
    ipcRenderer.on(CH.DISPLAY_POWER, h);
    return () => ipcRenderer.off(CH.DISPLAY_POWER, h);
  },
  onHwEvent: (cb) => {
    const h = (_e: unknown, ev: HwEvent): void => cb(ev);
    ipcRenderer.on(CH.DEVICE_HW_EVENT, h);
    return () => ipcRenderer.off(CH.DEVICE_HW_EVENT, h);
  },
  onOsd: (cb) => {
    const h = (_e: unknown, p: OsdPayload): void => cb(p);
    ipcRenderer.on(CH.OSD_SHOW, h);
    return () => ipcRenderer.off(CH.OSD_SHOW, h);
  },
  onCliRequest: (cb) => {
    const h = (_e: unknown, id: number, req: CliRequest): void => cb(id, req);
    ipcRenderer.on(CH.CLI_REQUEST, h);
    return () => ipcRenderer.off(CH.CLI_REQUEST, h);
  },
  cliReply: (id: number, res: CliResult) => ipcRenderer.send(CH.CLI_REPLY, id, res),
  cliReady: () => ipcRenderer.send(CH.CLI_READY),
  flyoutSize: (h: number) => ipcRenderer.send(CH.FLYOUT_SIZE, h),
  onFlyoutRefresh: (cb) => {
    const h = (): void => cb();
    ipcRenderer.on(CH.FLYOUT_REFRESH, h);
    return () => ipcRenderer.off(CH.FLYOUT_REFRESH, h);
  },
  showOsd: (p: OsdPayload) => ipcRenderer.send(CH.OSD_SHOW, p),
  onDevNavigate: (cb) => {
    const h = (_e: unknown, n: DevNavigate): void => cb(n);
    ipcRenderer.on(CH.DEV_NAVIGATE, h);
    return () => ipcRenderer.off(CH.DEV_NAVIGATE, h);
  },
};

contextBridge.exposeInMainWorld('aula', api);
