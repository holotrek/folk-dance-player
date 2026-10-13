// THROWAWAY spike helper: switch macOS displays between mirrored and extended.
// Usage: swift display-mode.swift status | extend | mirror
// Changes are made "for session" (revert at logout).
import CoreGraphics
import Foundation

func onlineDisplays() -> [CGDirectDisplayID] {
    var count: UInt32 = 0
    CGGetOnlineDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetOnlineDisplayList(count, &ids, &count)
    return ids
}

func describe(_ id: CGDirectDisplayID) -> String {
    let b = CGDisplayBounds(id)
    let mirrorOf = CGDisplayMirrorsDisplay(id)
    return "id=\(id) builtin=\(CGDisplayIsBuiltin(id) != 0) main=\(CGDisplayIsMain(id) != 0) "
        + "bounds=\(Int(b.origin.x)),\(Int(b.origin.y)) \(Int(b.width))x\(Int(b.height)) "
        + "mirrors=\(mirrorOf == kCGNullDirectDisplay ? "-" : String(mirrorOf))"
}

func configure(_ body: (CGDisplayConfigRef) -> CGError) -> CGError {
    var config: CGDisplayConfigRef?
    var err = CGBeginDisplayConfiguration(&config)
    guard err == .success, let cfg = config else { return err }
    err = body(cfg)
    if err != .success { CGCancelDisplayConfiguration(cfg); return err }
    return CGCompleteDisplayConfiguration(cfg, .forSession)
}

let displays = onlineDisplays()
let cmd = CommandLine.arguments.dropFirst().first ?? "status"

switch cmd {
case "extend":
    let err = configure { cfg in
        for id in displays {
            let e = CGConfigureDisplayMirrorOfDisplay(cfg, id, kCGNullDirectDisplay)
            if e != .success { return e }
        }
        return .success
    }
    print("extend -> \(err)")
case "laptop-main":
    // Extended, with the built-in display at (0,0) (= main, gets menu bar/Dock) and the
    // external display placed to its right. Two transactions: bounds change after un-mirroring.
    let unmirror = configure { cfg in
        for id in displays {
            let e = CGConfigureDisplayMirrorOfDisplay(cfg, id, kCGNullDirectDisplay)
            if e != .success { return e }
        }
        return .success
    }
    print("unmirror -> \(unmirror)")
    usleep(1_500_000)
    guard let builtin = displays.first(where: { CGDisplayIsBuiltin($0) != 0 }) else {
        print("no built-in display"); exit(1)
    }
    let width = Int32(CGDisplayBounds(builtin).width)
    let err = configure { cfg in
        var e = CGConfigureDisplayOrigin(cfg, builtin, 0, 0)
        if e != .success { return e }
        for id in displays where id != builtin {
            e = CGConfigureDisplayOrigin(cfg, id, width, 0)
            if e != .success { return e }
        }
        return .success
    }
    print("laptop-main -> \(err)")
case "mirror":
    // Built-in mirrors the first external display (the arrangement macOS picked on connect).
    guard let builtin = displays.first(where: { CGDisplayIsBuiltin($0) != 0 }),
          let external = displays.first(where: { CGDisplayIsBuiltin($0) == 0 }) else {
        print("need a built-in and an external display"); exit(1)
    }
    let err = configure { cfg in CGConfigureDisplayMirrorOfDisplay(cfg, builtin, external) }
    print("mirror -> \(err)")
default:
    break
}
usleep(1_500_000)
for id in onlineDisplays() { print(describe(id)) }
