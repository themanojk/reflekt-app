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

    let cmd = targetState == .on ? "on" : "off"
    guard let url = URL(string: "\(baseURL)/presence") else {
      return .result()
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

    let payload: [String: Any] = [
      "mac_address": String(deviceMac).uppercased(),
      "data": [
        "cmd": cmd,
        "pin": pin,
      ],
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: payload)

    do {
      _ = try await URLSession.shared.data(for: request)
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
        isOn: targetState == .on,
        updatedAtISO: ISO8601DateFormatter().string(from: Date())
      )
      snapshot.favorites = nextFavorites
      snapshot.lastActionMessage = "\(current.switchName): \(targetState == .on ? "ON" : "OFF")"
      snapshot.lastActionAtISO = ISO8601DateFormatter().string(from: Date())

      let encoder = JSONEncoder()
      let updatedData = try encoder.encode(snapshot)
      if let updatedRaw = String(data: updatedData, encoding: .utf8) {
        writeHomeWidgetSnapshotRaw(updatedRaw)
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
      }
    } catch {
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

  private func readSnapshot() -> HomeWidgetSnapshot? {
    readHomeWidgetSnapshot()
  }

  private func relativeTime(_ iso: String?) -> String? {
    guard let iso, let date = ISO8601DateFormatter().date(from: iso) else {
      return nil
    }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: Date())
  }

  var body: some View {
    let currentSnapshot = entry.snapshot ?? readSnapshot()
    let content = VStack(alignment: .leading, spacing: 8) {
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
        if let msg = snapshot.lastActionMessage {
          HStack(spacing: 4) {
            Text(msg)
              .font(.caption2)
              .foregroundColor(.white.opacity(0.9))
              .lineLimit(1)
            if let rel = relativeTime(snapshot.lastActionAtISO) {
              Text("· \(rel)")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.6))
                .lineLimit(1)
            }
          }
        }
        Divider().overlay(Color.white.opacity(0.2))
        if let favorites = snapshot.favorites, !favorites.isEmpty {
          ForEach(favorites.prefix(3), id: \.id) { item in
            HStack {
              VStack(alignment: .leading, spacing: 3) {
                Text(item.switchName)
                  .font(.caption)
                  .foregroundColor(.white)
                  .lineLimit(1)
                if let board = item.boardName, !board.isEmpty {
                  Text(board)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                }
              }
              Spacer(minLength: 8)
              if #available(iOS 17.0, *) {
                HStack(spacing: 6) {
                  Button(intent: ToggleFavoriteSwitchIntent(favoriteId: item.id, targetState: .on)) {
                    Text("ON")
                      .font(.caption2)
                      .fontWeight(.semibold)
                      .padding(.horizontal, 6)
                      .padding(.vertical, 3)
                      .background((item.isOn ?? false) ? Color.green.opacity(0.35) : Color.white.opacity(0.12))
                      .foregroundColor(.white)
                      .clipShape(Capsule())
                  }
                  .buttonStyle(.plain)

                  Button(intent: ToggleFavoriteSwitchIntent(favoriteId: item.id, targetState: .off)) {
                    Text("OFF")
                      .font(.caption2)
                      .fontWeight(.semibold)
                      .padding(.horizontal, 6)
                      .padding(.vertical, 3)
                      .background((item.isOn ?? false) ? Color.white.opacity(0.12) : Color.gray.opacity(0.35))
                      .foregroundColor(.white)
                      .clipShape(Capsule())
                  }
                  .buttonStyle(.plain)
                }
              } else {
                Text((item.isOn ?? false) ? "ON" : "OFF")
                  .font(.caption2)
                  .foregroundColor((item.isOn ?? false) ? .green : .gray)
              }
            }
          }
        } else {
          ForEach(snapshot.rooms.prefix(3), id: \.id) { room in
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
    .padding(12)

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
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
