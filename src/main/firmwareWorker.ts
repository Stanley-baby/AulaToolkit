import { utilityProcess } from 'electron';
import type { FirmwareResult, HidDevice } from './firmware';

export function runFirmwareWorker(
  script: string, hidModulePath: string, journalPath: string, image: Buffer,
  imageSha256: string, target: HidDevice, progress: (result: FirmwareResult) => void,
): Promise<FirmwareResult> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(script, [], { serviceName: 'AULA firmware update', stdio: 'ignore' });
    let result: FirmwareResult | undefined;
    let failure = '';
    child.on('message', (message: { type: string; result?: FirmwareResult; error?: string }) => {
      if (message.type === 'progress' && message.result) progress(message.result);
      if (message.type === 'result' && message.result) { result = message.result; child.kill(); }
      if (message.type === 'error') { failure = message.error ?? 'Firmware worker failed'; child.kill(); }
    });
    child.on('error', () => { failure = 'Firmware worker terminated unexpectedly'; });
    child.on('exit', (code) => result ? resolve(result) : reject(new Error(failure || `Firmware worker exited (${code})`)));
    child.postMessage({ hidModulePath, journalPath, image, imageSha256, target: { path: target.path, release: target.release } });
  });
}
