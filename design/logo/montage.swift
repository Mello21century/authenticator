import AppKit
let a = Array(CommandLine.arguments.dropFirst()); let out = a[0]; let ins = Array(a.dropFirst())
let s = 400.0, W = s * Double(ins.count)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(s + 50), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.white.setFill(); NSRect(x: 0, y: 0, width: W, height: s + 50).fill()
for (i, p) in ins.enumerated() {
  NSImage(contentsOfFile: p)!.draw(in: NSRect(x: Double(i) * s, y: 50, width: s, height: s))
  let label = "\(i + 1)  #" + (p.components(separatedBy: "-").last!.replacingOccurrences(of: ".png", with: ""))
  label.draw(at: NSPoint(x: Double(i) * s + 140, y: 14), withAttributes: [.font: NSFont.systemFont(ofSize: 22, weight: .semibold)])
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
