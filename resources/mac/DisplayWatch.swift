import AppKit
import CoreGraphics
import Darwin

func emit(_ state: String) {
    print(state)
    fflush(stdout)
}

// NSWorkspace screen notifications need the AppKit application event loop.
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

emit(CGDisplayIsAsleep(CGMainDisplayID()) != 0 ? "off" : "on")
if CommandLine.arguments.contains("--once") { exit(0) }
let center = NSWorkspace.shared.notificationCenter
let asleep = center.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { _ in emit("off") }
let awake = center.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { _ in emit("on") }
app.run()
