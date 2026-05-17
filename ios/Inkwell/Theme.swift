import SwiftUI

extension Color {
    static let inkBackground = Color(red: 0.965, green: 0.953, blue: 0.929)
    static let inkForeground = Color(red: 0.165, green: 0.149, blue: 0.133)
    static let inkMuted = Color(red: 0.42, green: 0.396, blue: 0.376)
    static let inkSurface = Color(red: 1.0, green: 0.988, blue: 0.969)
    static let inkAccent = Color(red: 0.604, green: 0.482, blue: 0.361)
    static let inkBorder = Color(red: 0.867, green: 0.839, blue: 0.796)
}

struct InkwellFont {
    static func serif(_ size: CGFloat) -> Font {
        .custom("CormorantGaramond-Regular", size: size)
    }
}
