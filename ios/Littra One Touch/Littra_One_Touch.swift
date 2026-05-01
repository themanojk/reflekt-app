import WidgetKit
import SwiftUI
import AppIntents

private let widgetKind = "expo.extra.widget.kind"
private let appGroupId = "group.com.littra.reflekt"
private let snapshotKey = "home_widget_snapshot_v1"
private let snapshotFileName = "home_widget_snapshot_v1.json"

struct HomeWidgetSnapshot: Codable {
  struct FavoriteSwitch: Codable {
    let id: String
    let deviceMac: String?
    let pin: Int?
    let serviceId: String?
    let roomName: String?
    let boardName: String?
    let switchName: String
    let switchType: String?
    let isOn: Bool?
    let updatedAtISO: String?
  }

  struct Room: Codable {
    let id: String
    let name: String
    let icon: String
    let switchboardCount: Int
    let onlineCount: Int
  }

  let appName: String
  let updatedAtISO: String
  let totalRooms: Int
  let totalBoards: Int
  let onlineBoards: Int
  let rooms: [Room]
  var favorites: [FavoriteSwitch]?
  let apiBaseURL: String?
  let authToken: String?
  var lastActionMessage: String?
  var lastActionAtISO: String?
}

private func snapshotFileURL() -> URL? {
  FileManager.default
    .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
    .appendingPathComponent(snapshotFileName)
}

private func decodeHomeWidgetSnapshot(_ raw: String?) -> HomeWidgetSnapshot? {
  guard let raw, let data = raw.data(using: .utf8) else {
    return nil
  }
  return try? JSONDecoder().decode(HomeWidgetSnapshot.self, from: data)
}

private func readHomeWidgetSnapshot() -> HomeWidgetSnapshot? {
  if let defaultsSnapshot = decodeHomeWidgetSnapshot(
    UserDefaults(suiteName: appGroupId)?.string(forKey: snapshotKey)
  ) {
    return defaultsSnapshot
  }

  guard
    let url = snapshotFileURL(),
    let raw = try? String(contentsOf: url, encoding: .utf8)
  else {
    return nil
  }
  return decodeHomeWidgetSnapshot(raw)
}

private func writeHomeWidgetSnapshotRaw(_ raw: String) {
  UserDefaults(suiteName: appGroupId)?.set(raw, forKey: snapshotKey)
  if let url = snapshotFileURL() {
    try? raw.write(to: url, atomically: true, encoding: .utf8)
  }
}

private func widgetEndpointURL(baseURL: String, path: String, queryItems: [URLQueryItem] = []) -> URL? {
  let trimmedBase = baseURL
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  var components = URLComponents(string: "\(trimmedBase)\(path)")
  components?.queryItems = queryItems.isEmpty ? nil : queryItems
  return components?.url
}

private func boolFromPinValue(_ value: Any?) -> Bool? {
  if let bool = value as? Bool {
    return bool
  }
  if let number = value as? NSNumber {
    return number.intValue != 0
  }
  if let string = value as? String {
    let normalized = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if ["1", "true", "on"].contains(normalized) {
      return true
    }
    if ["0", "false", "off"].contains(normalized) {
      return false
    }
  }
  return nil
}

private func currentPinState(baseURL: String, token: String, deviceMac: String, pin: Int) async -> Bool? {
  guard let url = widgetEndpointURL(
    baseURL: baseURL,
    path: "/devices/macAddress",
    queryItems: [URLQueryItem(name: "mac_address", value: deviceMac.uppercased())]
  ) else {
    return nil
  }

  var request = URLRequest(url: url)
  request.httpMethod = "GET"
  request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

  do {
    let (data, response) = try await URLSession.shared.data(for: request)
    guard
      let httpResponse = response as? HTTPURLResponse,
      (200..<300).contains(httpResponse.statusCode),
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let status = root["status"] as? [String: Any],
      let pins = status["pins"] as? [String: Any]
    else {
      return nil
    }

    return boolFromPinValue(pins[String(pin)])
  } catch {
    return nil
  }
}

private func sendPresenceCommand(baseURL: String, token: String, deviceMac: String, pin: Int, isOn: Bool) async -> Bool {
  guard let url = widgetEndpointURL(baseURL: baseURL, path: "/presence") else {
    return false
  }

  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

  let payload: [String: Any] = [
    "mac_address": deviceMac.uppercased(),
    "data": [
      "cmd": isOn ? "on" : "off",
      "pin": pin,
    ],
  ]
  request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

  do {
    let (data, response) = try await URLSession.shared.data(for: request)
    guard
      let httpResponse = response as? HTTPURLResponse,
      (200..<300).contains(httpResponse.statusCode)
    else {
      return false
    }

    if let rawBool = try? JSONSerialization.jsonObject(with: data) as? Bool {
      return rawBool
    }
    if let rawNumber = try? JSONSerialization.jsonObject(with: data) as? NSNumber {
      return rawNumber.boolValue
    }
    if let rawObject = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let success = rawObject["success"] ?? rawObject["status"] {
      return boolFromPinValue(success) ?? true
    }
    return true
  } catch {
    return false
  }
}

struct LittraOneTouchEntry: TimelineEntry {
  let date: Date
  let snapshot: HomeWidgetSnapshot?
}

enum ToggleTargetState: String, AppEnum {
  case on
  case off

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Switch State"
  static var caseDisplayRepresentations: [ToggleTargetState: DisplayRepresentation] = [
    .on: "On",
    .off: "Off",
  ]
}

@available(iOS 17.0, *)
struct ToggleFavoriteSwitchIntent: AppIntent {
  static var title: LocalizedStringResource = "Toggle Favorite Switch"

  @Parameter(title: "Favorite ID")
  var favoriteId: String

  @Parameter(title: "Target State")
  var targetState: ToggleTargetState

  init() {}

  init(favoriteId: String, targetState: ToggleTargetState) {
    self.favoriteId = favoriteId
    self.targetState = targetState
  }

  func perform() async throws -> some IntentResult {
    guard var snapshot = readHomeWidgetSnapshot() else {
      return .result()
    }

    guard
      let favorites = snapshot.favorites,
      let idx = favorites.firstIndex(where: { $0.id == favoriteId }),
      let deviceMac = favorites[idx].deviceMac,
      let pin = favorites[idx].pin,
      let token = snapshot.authToken,
      let baseURL = snapshot.apiBaseURL
    else {
      return .result()
    }

    guard let currentState = await currentPinState(
      baseURL: baseURL,
      token: token,
      deviceMac: String(deviceMac),
      pin: pin
    ) else {
      snapshot.lastActionMessage = "Could not read current switch state."
      snapshot.lastActionAtISO = ISO8601DateFormatter().string(from: Date())
      let encoder = JSONEncoder()
      if let updatedData = try? encoder.encode(snapshot),
         let updatedRaw = String(data: updatedData, encoding: .utf8) {
        writeHomeWidgetSnapshotRaw(updatedRaw)
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
      }
      return .result()
    }

    let nextState = !currentState
    let commandSent = await sendPresenceCommand(
      baseURL: baseURL,
      token: token,
      deviceMac: String(deviceMac),
      pin: pin,
      isOn: nextState
    )

    if commandSent {
      var nextFavorites = favorites
      let current = nextFavorites[idx]
      nextFavorites[idx] = HomeWidgetSnapshot.FavoriteSwitch(
        id: current.id,
        deviceMac: current.deviceMac,
        pin: current.pin,
        serviceId: current.serviceId,
        roomName: current.roomName,
        boardName: current.boardName,
        switchName: current.switchName,
        switchType: current.switchType,
        isOn: nextState,
        updatedAtISO: ISO8601DateFormatter().string(from: Date())
      )
      snapshot.favorites = nextFavorites
      snapshot.lastActionMessage = "\(current.switchName): \(nextState ? "ON" : "OFF")"
      snapshot.lastActionAtISO = ISO8601DateFormatter().string(from: Date())

      let encoder = JSONEncoder()
      let updatedData = try encoder.encode(snapshot)
      if let updatedRaw = String(data: updatedData, encoding: .utf8) {
        writeHomeWidgetSnapshotRaw(updatedRaw)
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
      }
    } else {
      snapshot.lastActionMessage = "Action failed. Try again."
      snapshot.lastActionAtISO = ISO8601DateFormatter().string(from: Date())
      let encoder = JSONEncoder()
      if let updatedData = try? encoder.encode(snapshot),
         let updatedRaw = String(data: updatedData, encoding: .utf8) {
        writeHomeWidgetSnapshotRaw(updatedRaw)
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
      }
    }

    return .result()
  }
}

struct LittraOneTouchProvider: TimelineProvider {
  func placeholder(in context: Context) -> LittraOneTouchEntry {
    LittraOneTouchEntry(date: Date(), snapshot: readSnapshot())
  }

  func getSnapshot(in context: Context, completion: @escaping (LittraOneTouchEntry) -> Void) {
    completion(LittraOneTouchEntry(date: Date(), snapshot: readSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LittraOneTouchEntry>) -> Void) {
    let now = Date()
    let snapshot = readSnapshot()
    let refreshMinutes = snapshot == nil ? 1 : 30
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: refreshMinutes, to: now) ?? now.addingTimeInterval(TimeInterval(refreshMinutes * 60))
    let entry = LittraOneTouchEntry(date: now, snapshot: snapshot)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func readSnapshot() -> HomeWidgetSnapshot? {
    readHomeWidgetSnapshot()
  }
}

struct LittraOneTouchWidgetEntryView: View {
  let entry: LittraOneTouchEntry
  @Environment(\.widgetFamily) private var family

  private func readSnapshot() -> HomeWidgetSnapshot? {
    readHomeWidgetSnapshot()
  }

  private var favoriteLimit: Int {
    family == .systemLarge ? 8 : 4
  }

  private var favoriteColumns: [GridItem] {
    [
      GridItem(.flexible(), spacing: 7),
      GridItem(.flexible(), spacing: 7)
    ]
  }

  private var buttonSize: CGFloat {
    family == .systemSmall ? 26 : 28
  }

  private func toggleTarget(for item: HomeWidgetSnapshot.FavoriteSwitch) -> ToggleTargetState {
    (item.isOn ?? false) ? .off : .on
  }

  @ViewBuilder
  private func toggleButton(for item: HomeWidgetSnapshot.FavoriteSwitch) -> some View {
    let isOn = item.isOn ?? false
    if #available(iOS 17.0, *) {
      Button(intent: ToggleFavoriteSwitchIntent(favoriteId: item.id, targetState: toggleTarget(for: item))) {
        Image(systemName: "power")
          .font(.caption.weight(.bold))
          .foregroundColor(.white)
          .frame(width: buttonSize, height: buttonSize)
          .background(isOn ? Color.green.opacity(0.55) : Color.white.opacity(0.16))
          .clipShape(Circle())
      }
      .buttonStyle(.plain)
    } else {
      Text(isOn ? "ON" : "OFF")
        .font(.caption2)
        .fontWeight(.semibold)
        .foregroundColor(isOn ? .green : .gray)
    }
  }

  private func favoriteTitle(_ item: HomeWidgetSnapshot.FavoriteSwitch) -> String {
    item.switchName.isEmpty ? "Switch" : item.switchName
  }

  @ViewBuilder
  private func favoriteCell(_ item: HomeWidgetSnapshot.FavoriteSwitch) -> some View {
    if family == .systemSmall {
      VStack(spacing: 4) {
        toggleButton(for: item)
        Text(favoriteTitle(item))
          .font(.caption2)
          .fontWeight(.medium)
          .foregroundColor(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }
      .frame(maxWidth: .infinity, minHeight: 43)
      .padding(.vertical, 4)
      .background(Color.white.opacity(0.08))
      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    } else {
      HStack(spacing: 7) {
        VStack(alignment: .leading, spacing: 2) {
          Text(favoriteTitle(item))
            .font(.caption)
            .foregroundColor(.white)
            .lineLimit(1)
          if let board = item.boardName, !board.isEmpty {
            Text(board)
              .font(.caption2)
              .foregroundColor(.white.opacity(0.62))
              .lineLimit(1)
          }
        }
        Spacer(minLength: 2)
        toggleButton(for: item)
      }
      .frame(maxWidth: .infinity, minHeight: 42)
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
      .background(Color.white.opacity(0.08))
      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }

  var body: some View {
    let currentSnapshot = entry.snapshot ?? readSnapshot()
    let content = VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 8) {
      if let snapshot = currentSnapshot {
        HStack {
          Text(snapshot.appName)
            .font(.headline)
            .foregroundColor(.white)
          Spacer()
          Text("\(snapshot.onlineBoards)/\(snapshot.totalBoards) online")
            .font(.caption2)
            .foregroundColor(Color(red: 0.76, green: 0.88, blue: 1.0))
        }
        Divider().overlay(Color.white.opacity(0.2))
        if let favorites = snapshot.favorites, !favorites.isEmpty {
          LazyVGrid(columns: favoriteColumns, spacing: family == .systemSmall ? 7 : 8) {
            ForEach(favorites.prefix(favoriteLimit), id: \.id) { item in
              favoriteCell(item)
            }
          }
        } else {
          ForEach(snapshot.rooms.prefix(family == .systemSmall ? 4 : 8), id: \.id) { room in
            HStack {
              Text(room.name)
                .font(.caption)
                .foregroundColor(.white)
              Spacer()
              Text("\(room.onlineCount)/\(room.switchboardCount)")
                .font(.caption2)
                .foregroundColor(.cyan)
            }
          }
        }
      } else {
        Text("lOT")
          .font(.headline)
          .foregroundColor(.white)
        Text("Open app to sync widget data")
          .font(.caption)
          .foregroundColor(.white.opacity(0.8))
      }
    }
    .padding(EdgeInsets(
      top: family == .systemSmall ? 12 : 14,
      leading: family == .systemSmall ? 12 : 14,
      bottom: family == .systemSmall ? 18 : 22,
      trailing: family == .systemSmall ? 12 : 14
    ))

    Group {
      if #available(iOS 17.0, *) {
        content
          .containerBackground(for: .widget) {
            Color(red: 0.06, green: 0.09, blue: 0.16)
          }
      } else {
        ZStack {
          Color(red: 0.06, green: 0.09, blue: 0.16)
          content
        }
      }
    }
    .widgetURL(URL(string: "reflekt://home"))
  }
}

struct LittraOneTouchWidget: Widget {
  let kind: String = widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LittraOneTouchProvider()) { entry in
      LittraOneTouchWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("lOT")
    .description("View room and switchboard online status at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
