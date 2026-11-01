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
  a PowerShell process or a polling approximation. The helper initializes AppKit and
  runs its application event loop; a bare Foundation run loop missed notifications
  on the tested Mac.
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

## S75 Pro side-light protocol correction

The vendor S75Pro Driver Beta 1.0.0.1 executable (SHA256
`e92e83b8466fa35bf370f8bc1092f2a851ec303c41893e62d96073ba4d620e3e`)
places `AA 55` at payload offsets 14/15 in `FUN_00433fd0` (instruction
`0x434047`), before the transport prepends report ID 0. The remaining bytes
are padding; the main-light payload still uses offsets 62/63.
`FUN_00433e20` maps ten language IDs 661..670 to item data 0x20..0x29.
The corrected table includes Yellow, Green, Ice Blue, Pink and White;
Blue is 0x25, Neon is 0x28 and Off is 0x29.
These are shipped-code observations; physical acceptance is tracked separately.

## Current physical acceptance notes

On the tested S75 Pro, the vendor-style side-light commands have not passed
visual acceptance: the bar keeps cycling colours despite successful transfers.
Hardware Fn controls work. The packet/table correction above documents the
vendor program, not proof of successful control on this keyboard revision.
The screen uploader now rejects missing/empty chunk acknowledgements and sends
END even on transfer failure; it never reports completion after a timeout.
Successful transfer still needs separate confirmation of the physical display.

The tested S75 Pro displays both static images and two-frame screen animations,
and music lighting starts with system audio and restores the base red lighting
after silence. These have passed user visual confirmation. On macOS, S75 USB
control prefers the vendor feature collection (usage page 0xFF13): unlike the
ordinary keyboard collection, it remains accessible while the screen is locked.
Windows and other models retain their previous collection preference.
The fixed helper and vendor interface also passed real display sleep/wake
automation: 80 main LEDs read back black while the display was off and red after
wake, without HID errors. On the tested USB connection, the side bar stays lit during
Mac display sleep; its software blackout has not passed physical acceptance.

## Macro event timing and playback count

The AULA04 encoder inserts the vendor minimum 10 ms gap between adjacent
key/mouse events without an explicit delay. Existing explicit delays are
preserved. Only Repeat N mode carries a repeat count; other modes use zero,
matching the official action encoder. The shared USB/wireless encoder has
regression coverage. On the tested Mac/S75 Pro receiver, both a one-key macro
and `abc123` now play once and release correctly after the previous repeating-key
failure. The corrected `abc123` one-shot macro also passed USB physical
acceptance. Test macros were cleared and the default base keymap was restored.

## Sleep settings and TFT state after reconnect

On the tested S75 Pro over 2.4 GHz, the 1-minute setting turned off the main
lights, side lights and screen at a manually recorded 61 seconds; a space tap
woke them. With Never selected, all three remained on during a 90-second idle
comparison with the app closed. This verifies that observation window, not
unlimited runtime.

### Verified receiver side-light switch

On the tested S75 Pro receiver, mode `0x24` turns the side lights off and
`0x21` turns them on with multicolour cycling, not static red. Mode `0x22`
did not produce the expected blue. These results do not establish the USB
mapping or arbitrary colour control.

On macOS over 2.4 GHz, the side-light panel therefore offers an On/Off switch
instead of unverified colour names. Profiles retain the existing semantic
Off value `0x29`; the driver sends `0x24` for Off and `0x21` for any enabled
profile mode. This also covers display-off and wake restoration without
rewriting saved profiles. Windows, Linux, other devices and USB framing are
unchanged. The integrated Mac display-sleep/wake flow still needs physical
acceptance; the two raw receiver commands have passed user observation.

Time synchronization restores the time/date/battery view over both USB and
2.4 GHz. With the app closed, the stored test animation reappears after wireless
sleep/wake and after USB reconnect. Time synchronization must not be described
as permanently replacing an uploaded animation. With the app running, USB
reattach triggers the existing automatic time sync; both its TIME reply and the
restored clock view passed acceptance. Wireless wake while the app remains
attached has not been tested. No periodic clock writes or speculative firmware
persistence commands were added.
