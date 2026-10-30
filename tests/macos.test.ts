import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('macOS distribution contract', () => {
  it('builds a Mac app with native helpers and audio capture declarations', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    const config = readFileSync(resolve('electron-builder.yml'), 'utf8');
    expect(pkg.scripts['dist:mac']).toContain('electron-builder --mac');
    expect(config).toContain('NSAudioCaptureUsageDescription');
    expect(config).toContain('minimumSystemVersion: "14.2"');
    expect(config).toContain('resources/mac');
  });
});
