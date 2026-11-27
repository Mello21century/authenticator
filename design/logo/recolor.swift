import AppKit
// Two-colour recolour: each pixel's mix between background and glyph is kept, only the glyph colour changes.
// usage: swift recolor.swift in.png out.png RRGGBB
let a = CommandLine.arguments
let rep = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: a[1])))!
let hex = Int(a[3], radix: 16)!
let new = [Double((hex >> 16) & 255), Double((hex >> 8) & 255), Double(hex & 255)]
let bg = [21.0, 18.0, 29.0]          // #15121d
let old = [139.0, 108.0, 255.0]      // #8b6cff
let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: rep.pixelsWide, pixelsHigh: rep.pixelsHigh, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
for y in 0..<rep.pixelsHigh { for x in 0..<rep.pixelsWide {
  let c = rep.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
  let p = [c.redComponent * 255, c.greenComponent * 255, c.blueComponent * 255]
  let t = max(0, min(1, (p[2] - bg[2]) / (old[2] - bg[2])))   // blue channel separates glyph from bg best
  let q = (0..<3).map { (bg[$0] + t * (new[$0] - bg[$0])) / 255 }
  out.setColor(NSColor(deviceRed: q[0], green: q[1], blue: q[2], alpha: 1), atX: x, y: y)
}}
try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
