# iOS Widget Setup (Littra One Touch)

This project now prepares widget data from React Native automatically in `HomeScreen`.  
To finish iOS widget support, complete the Xcode wiring below once.

## 1. Add App Group capability

1. Open `ios/Reflekt.xcworkspace` in Xcode.
2. Select app target `Reflekt` -> `Signing & Capabilities`.
3. Add `App Groups`.
4. Create/use: `group.com.littra.reflekt`.

## 2. Add Widget Extension target

1. `File` -> `New` -> `Target...` -> `Widget Extension`.
2. Product name: `ReflektWidget` (or any name you prefer).
3. Use SwiftUI, no intent configuration.
4. Ensure deployment target is iOS 14+ for the widget target.

## 3. Replace generated widget code

1. Replace generated widget Swift files with:
2. `widget/ios/ReflektWidgetBundle.swift`
3. `widget/ios/ReflektWidget.swift`

Important:
1. If you rename the widget kind, keep `kind` synced with `app.json` -> `expo.extra.widget.kind`.
2. If your App Group differs, update `app.json` -> `expo.extra.widget.iosAppGroup` and `appGroupId` inside `ReflektWidget.swift`.

## 4. Add RN native bridge to app target

1. Add file `widget/ios/WidgetBridge.m` to the `Reflekt` app target.
2. Confirm target membership is app target only (not widget extension).

This bridge stores JSON in shared App Group defaults and triggers `WidgetCenter` timeline reload.

## 5. Build and run

1. Build the app target once and open Home screen to populate snapshot data.
2. Add the widget from iOS home screen widget picker.
3. Re-open app/Home after changing rooms or switchboards to refresh widget data.

## 6. Current payload source

Data is synced from `screens/HomeScreen.tsx` through:
1. `utils/widgetSync.ts`
2. `syncHomeWidgetSnapshot(roomsWithBoards)`

The payload key used by app + widget is:
1. `home_widget_snapshot_v1`

## 7. Troubleshooting

1. Widget shows placeholder only:
   app group mismatch, or app target did not include `WidgetBridge.m`.
2. Widget not updating:
   open Home screen once, then remove/re-add widget.
3. Kind mismatch:
   `expo.extra.widget.kind` must match Swift `widgetKind`.
