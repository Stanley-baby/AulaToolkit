# AULA Toolkit on macOS

This fork keeps AulaToolkit's keyboard and mouse editors and adds a native Mac application experience, with physical acceptance focused on the **AULA S75 Pro**. It is unofficial and is not affiliated with AULA.

[Download 0.3.1](https://github.com/Stanley-baby/AulaToolkit/releases/tag/v0.3.1) · [Chinese homepage](../README.md) · [F108 firmware](../firmware/s75pro/README.md)

## Install

Requirements: **macOS 14.2 or newer**, a data-capable USB cable or supported 2.4 GHz receiver. Choose the `arm64` DMG for Apple Silicon or `x64` for Intel, then drag AULA Toolkit.app to Applications. Ordinary configuration does not require F108; extended hardware sleep does.

### Opening the app

The distributed Mac builds are ad-hoc signed and **not notarized**. If macOS blocks the application, attempt to open it, then use **System Settings → Privacy & Security → Open Anyway** for that application. Review the release and file checksums before approving it. Apple explains this flow in its [official guide](https://support.apple.com/en-us/102445).

Keep one installed copy. Moving to a new build or changing its code signature can require macOS permissions to be granted again; add the actual installed application, not a build-directory backup.

## What works over each connection

| Feature | USB | 2.4 GHz | Bluetooth |
| --- | :---: | :---: | :---: |
| Main/side lighting, keymaps and macros | Yes | Yes | Configure through USB/receiver first |
| Live LED readback, GIF on keys, per-key breathing | Yes | No | No |
| TFT image/GIF upload | Yes | No | No |
| F108 sleep configuration | Yes | Yes | Configure through USB/receiver first |
| Stored F108 sleep behavior | Wired idle blackout | Yes | Yes |
| Firmware update/recovery | Yes | No | No |

S75 Pro physical tests include typing, macros, side effects, TFT uploads, sleep and wake. Other inherited models (including F75 and SC900 Pro) retain their drivers and editors, but have not all been physically accepted on Mac.

## Permissions

- **Input Monitoring** may be required if macOS refuses HID access. Restart the application after changing permission. The USB vendor feature collection is preferred for S75 Pro control so the interface remains available while the display is locked.
- **Screen & System Audio Recording / System Audio Recording** is requested for system-audio lighting. Capture is local and active while the corresponding music feature runs. The microphone is not used.
- macOS music detection follows sustained audible output and restores base lighting after silence. A notification sound can activate it; this is different from Windows media-session status.
- The Windows EXE/registry Software Control page is marked Windows-only on Mac.

The window uses native Mac controls, supports resizing, returns from the Dock, and can close to the menu bar. **Command-Q** fully exits. First-run login launch defaults to off.

## F108 hardware sleep

The device page includes a firmware panel with reviewed F108 and previous F106 images, progress, configuration backup and recovery state. Updating is manual and requires wired mode. See the [firmware instructions and exact SHA-256 values](../firmware/s75pro/README.md) before flashing.

F108 retains F106 custom **1–120 minute** timeouts and three strategies:

- **Deep sleep:** original radio shutdown/wake behavior.
- **Quick wake:** lights and TFT go dark while radio communication and key scanning remain active.
- **Two-stage sleep:** for example, dark at 3 minutes and deep sleep after 5 total idle minutes. Physical input restarts the timer.

Configure through USB or the receiver, then switch to Bluetooth if desired. These settings work with the App closed. The tested Bluetooth and receiver quick stage accepted complete `abc123` input without noticeable reconnection wait; the deep stage retained the original delay. Exact latency and current draw have not been measured.

F108 adds wired idle shutdown of main LEDs, body LEDs and TFT without a resident App or helper. Host-only USB resume leaves them dark until physical key activity. On the tested unit, lights/TFT remained off during 90 seconds of Mac sleep; after manual wake there was no premature second blackout and `abc123`/`asd` remained complete. Exact latency and overnight current were not measured. Display-only sleep still uses the keyboard idle timeout; immediate display-following main/body blackout requires the App. Wired blackout is separate from wireless deep sleep.

## Lighting and screen notes

- The physically calibrated Mac effect mapping preserves logical App IDs. Recognized V1.03/F104–F108 identities use their standard wire IDs; an unrecognized older revision uses the verified alternate mapping.
- Side effects **flow**, **one-color-at-a-time cycle**, **static using the hardware-selected color**, and **off** passed wired/receiver observation. Arbitrary software RGB selection for body-side LEDs is not implemented.
- USB live readback drives the on-screen lighting preview. Effect pattern guesses are disabled on Mac rather than replacing the user's selected mode.
- Per-key breathing, key GIFs and music bars require USB. Stopping a breathing session or quitting restores its static per-key colors.
- TFT images/GIFs are uploaded over USB. Missing chunk acknowledgements are errors. There is no complete screen-content readback; an upload confirmation needs physical screen observation.
- Time sync selects the clock/date/battery view. An uploaded animation remains stored and can be selected with the knob's screen controls. On the tested keyboard, holding Fn and briefly pressing the knob switches its volume/screen navigation mode.

## Known issues in 0.3.1

- Single-key fade at `#ff4747` can turn red near the tail. Rounding and scan-dither experiments did not solve it and are **not included** in F108.
- Dynamic fade intensity can trigger an inferred brightness OSD. A proposed App-only fix remains unpublished. Notifications can be disabled temporarily in Settings.
- Sleep current, endurance and all hardware revisions have not been measured. Do not interpret a dark screen as a measured power state.

## Build and verify

```sh
npm ci
npm run typecheck
npm test
npm run dist:mac
node scripts/smoke-mac.cjs
```

The build compiles the Swift display watcher for the host architecture and writes DMG/ZIP files to `release/`. CI builds Apple Silicon and Intel separately and checks Windows compatibility. The packaged smoke test runs real Electron, preload, renderer, native HID, CLI and persistence against **simulated devices in isolated storage**, without writing to the user's keyboard.

Reproduce F108 with `python3 firmware/s75pro/build_wired.py`, or previous F106 with `python3 firmware/s75pro/build.py`. Both require exact released bytes and never flash a device. The focused MCU wake regression runs with `uv run --with unicorn==2.1.4 python firmware/s75pro/test_wired_wake.py`; hardware peripherals remain simulated.

## Command line

The bundled executable needs no separate Node.js installation:

```sh
"/Applications/AULA Toolkit.app/Contents/Resources/bin/aula" status --json
"/Applications/AULA Toolkit.app/Contents/Resources/bin/aula" light list
```

The CLI starts or talks to the installed App. Settings → General → Command line shows its actual path. Profiles, backups, diagnostics and battery history remain available. Battery-derived endurance and health are estimates, not direct battery-health measurements.

## Updates and signing

The update feed points to this fork, `Stanley-baby/AulaToolkit`. App version **0.3.1** and keyboard firmware **F108** are separate versions; installing the App does not automatically flash the keyboard.

Ad-hoc builds do not provide the same signed automatic-install path as Developer ID distribution. Treat the published DMG/ZIP as manual updates; keep update errors visible. Developer ID signing and notarization require the maintainer's Apple credentials, which are not stored in this repository.
