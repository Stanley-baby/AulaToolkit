# macOS support

The macOS port keeps the existing device drivers, all keyboard and mouse editors,
profiles, macros, screen/GIF library, backups, diagnostics, battery history,
notifications, OSD, tray view and CLI. It does not replace them with a sleep-only utility.

## Requirements and building

- macOS 14.2 or newer (system audio capture requires this version).
- Node.js 22.15+ or 24, npm, and Xcode Command Line Tools.
- A data-capable USB cable or a supported 2.4 GHz receiver for device configuration.

```sh
npm ci
npm run typecheck
npm test
npm run dist:mac
```

The build compiles the Swift display watcher for the current host architecture,
then creates a DMG and ZIP in `release/`. CI builds Apple Silicon and Intel separately.
Electron 45 is used for native macOS system-audio loopback. Windows remains supported.

## Permissions and platform differences

- Grant **Input Monitoring** to AULA Toolkit if macOS refuses HID access. Restart
  the app after changing this permission. Ordinary keyboard input needs no driver.
- Enable a music effect in Lighting, then grant **Screen & System Audio Recording**
  / **System Audio Recording** when macOS asks. Capture is local and is only active
  while a music effect is enabled. Microphone audio is not requested.
- macOS has no public equivalent of Windows' global media-session status reader.
  The port activates music effects after sustained audible system output and restores
  the base lighting after three seconds of silence. Notifications can also activate it.
  Rhythm, colour schemes, sensitivity, backgrounds and wireless fallback effects are retained.
- Display blackout uses native `NSWorkspace` screen sleep/wake notifications, not
  a PowerShell process or a polling approximation.
- The Software Control panel manages Windows EXEs and registry entries. It is
  explicitly marked Windows-only on macOS; no macOS process is disabled by that panel.
- Closing the main window can hide it to the menu bar. Clicking the Dock icon restores
  it, and Command-Q exits. First-run macOS login launch defaults to off; the app's
  existing login-launch setting uses the native macOS Login Items API.
- Bluetooth can display pairing status and battery when macOS supplies it. It does
  not expose the keyboard configuration interface. Settings are changed over USB/2.4 GHz.
- S75 Pro settings, macros and screen images do not have a complete device readback.
  Preserve your original profiles before replacing settings; the app never applies a
  whole default profile just because the device connected.

## Command line

The bundled executable needs no separate Node.js installation:

```sh
"/Applications/AULA Toolkit.app/Contents/Resources/bin/aula" status --json
"/Applications/AULA Toolkit.app/Contents/Resources/bin/aula" light list
```

It starts the app if needed and uses the existing CLI commands. Add a user-owned
symlink to this executable if you want the short `aula` command.

## Updates, signing and publication

The update feed points to this fork, `Stanley-baby/AulaToolkit`, rather than the
upstream Windows-only releases. Update errors are visible in Settings. A compatible
Mac release and its `latest-mac.yml` must be published before update checks can find it.
Publishing releases is separate from building a branch artifact.

Local and default CI builds are unsigned/ad-hoc development builds. Signed,
notarized distribution and automatic installation of future updates require the
maintainer's Apple Developer signing identity and notarization credentials. The
Mac entitlements and privacy descriptions are included. To sign a distribution,
override `mac.identity` with your Developer ID identity and use
electron-builder's `CSC_LINK` / `CSC_KEY_PASSWORD` and supported Apple notarization credentials. Do not add credentials to the repository.

## S75 Pro single-colour static mode

On the tested Mac/S75 Pro revision, firmware effect 1 still animates. For USB,
the single-colour Static option therefore writes the same colour to all keys
using the verified per-key protocol. Windows, wireless, dynamic effects and the
colourful variant retain their original paths; those are not covered by this fix.

## Verification boundaries

Automated protocol tests validate packet formats and preserve all device features.
The packaged-app smoke test exercises the real Electron main process, preload,
renderer, CLI, native HID module and display helper with simulated devices.
Real-device read-only validation does not overwrite unknown onboard macros,
keymaps or screen content. Every supported mouse/receiver model needs its own
hardware acceptance; successful S75 Pro enumeration is not proof for other models.
