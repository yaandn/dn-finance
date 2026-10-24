import AppKit
import SwiftUI

/// Cores do app web (globals.css), convertidas de oklch para sRGB.
enum Theme {
    static let fixed = Color(light: 0x00A3B4, dark: 0x3DC4D1)     // --chart-2
    static let bills = Color(light: 0x6544C9, dark: 0x9C86F0)     // --chart-1
    static let loans = Color(light: 0xC058A8, dark: 0xE07CC0)     // --chart-4
    static let savings = Color(light: 0x1E8E5A, dark: 0x4CC98A)   // --positive
    static let free = Color(light: 0x6B7180, dark: 0xA4A9B6)      // --muted-foreground
    static let positive = savings
    static let negative = Color(light: 0xD9433A, dark: 0xF07A6A)  // --negative
    static let badge = Color(light: 0xF6E7D4, dark: 0x4A3B26)
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light)
        })
    }
}

extension NSColor {
    convenience init(hex: UInt32) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Double {
    /// R$ 1.234,56
    var brl: String {
        formatted(.currency(code: "BRL").locale(Locale(identifier: "pt_BR")))
    }
}
