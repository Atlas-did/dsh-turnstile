# Capturing without taking over the screen

Testing on the user's desktop is rude: windows pop up, focus jumps, and a slide deck in the
background ends up in the screenshot. Three ways out, cheapest first.

## 1. Headless Chromium (already the default for web UI)

Every panel/E2E test in this repo runs `chromium.launch({ channel: 'msedge', headless: true })`.
Nothing is drawn on the physical screen; Playwright renders off-screen and screenshots the page.
This covers everything we build, because our UI *is* web UI.

## 2. PrintWindow (for native Windows apps)

```bash
powershell -File tools/capture-window.ps1 -Name Everything -Out state/cap.png
```

It finds the process's main window, asks the OS to render it into a bitmap (`PrintWindow` with
`PW_RENDERFULLCONTENT`), and saves that. The window is **not** activated, moved, or resized, so the
user sees nothing. Verified on Everything: `captured 1613x965 ok=True`.

Two traps found the hard way:

1. **Single-instance apps.** `Start-Process Everything.exe` returns a process that exits immediately,
   so `MainWindowHandle` stays 0 and the capture dies. Attach to the *running* process by name instead.
   (This is why two earlier attempts failed.)
2. **Tray-only apps** have no main window at all until opened; the tool exits 3 and says so.

## 3. A real second desktop (only when we truly need one)

Options, in order of what they cost:

| Option | What it gives | Cost |
|---|---|---|
| `VirtualDisplayDriver` (VirtualDrivers, MIT) | an extra monitor the desktop can move onto | needs driver install + signing on Windows 11 |
| `IddSampleDriver` (Microsoft sample) | same idea, reference code | driver signing |
| `usbmmidd` | indirect display, no signing hassle | closed-source freeware |
| Windows Sandbox | a whole separate desktop | heavy, needs virtualization |
| RDP loopback session | its own session and display | needs an RDP listener |

This machine already has a **MuMu Virtual Display Adapter** (installed by the MuMu emulator). It is a
real extra display, but it belongs to the emulator; using it for our tests would be borrowing someone
else's driver and could break MuMu. Not adopted.

## Decision

We do not need a virtual display driver for this project:

- Web UI (panel, settings page) -> headless Chromium, already in use;
- Native app study -> `PrintWindow`, verified, no screen involvement;
- Anything that must drive real input events -> still headless Chromium, because our targets are
  browser surfaces. The one thing a virtual display would add is *screenshotting an app that only
  draws when visible*, and `PrintWindow` already covers the apps we study.

If a future target refuses `PrintWindow` (a few Electron apps return black frames), the fallback is
`VirtualDisplayDriver` on a second desktop - documented here so it is a decision, not a discovery.
