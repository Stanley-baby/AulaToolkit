import type { AulaApi } from '../shared/ipc';

declare global {
  interface Window {
    aula: AulaApi;
  }
}

export {};
