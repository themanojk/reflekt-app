import Foundation

#if canImport(WidgetKit)
import WidgetKit
#endif

@objcMembers
final class WidgetKitReloader: NSObject {
  @objc static func reload(kind: String?) {
#if canImport(WidgetKit)
    guard #available(iOS 14.0, *) else { return }
    if let kind, !kind.isEmpty {
      WidgetCenter.shared.reloadTimelines(ofKind: kind)
    } else {
      WidgetCenter.shared.reloadAllTimelines()
    }
#endif
  }
}
