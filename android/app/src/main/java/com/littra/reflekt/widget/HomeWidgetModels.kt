package com.littra.reflekt.widget

import org.json.JSONObject

data class HomeWidgetSnapshot(
  val appName: String,
  val totalBoards: Int,
  val onlineBoards: Int,
  val favorites: List<FavoriteSwitch>,
  val apiBaseURL: String?,
  val authToken: String?
) {
  companion object {
    fun fromJson(raw: String?): HomeWidgetSnapshot? {
      if (raw.isNullOrBlank()) return null
      return runCatching {
        val root = JSONObject(raw)
        val favoritesJson = root.optJSONArray("favorites")
        val favorites = buildList {
          if (favoritesJson != null) {
            for (index in 0 until favoritesJson.length()) {
              val item = favoritesJson.optJSONObject(index) ?: continue
              add(
                FavoriteSwitch(
                  id = item.optString("id"),
                  deviceMac = item.optString("deviceMac").takeIf { it.isNotBlank() },
                  pin = if (item.has("pin")) item.optInt("pin") else null,
                  boardName = item.optString("boardName").takeIf { it.isNotBlank() },
                  switchName = item.optString("switchName").ifBlank { "Switch" },
                  switchType = item.optString("switchType").takeIf { it.isNotBlank() },
                  isOn = if (item.has("isOn") && !item.isNull("isOn")) item.optBoolean("isOn") else null,
                )
              )
            }
          }
        }

        HomeWidgetSnapshot(
          appName = root.optString("appName").ifBlank { "lOT" },
          totalBoards = root.optInt("totalBoards", 0),
          onlineBoards = root.optInt("onlineBoards", 0),
          favorites = favorites,
          apiBaseURL = root.optString("apiBaseURL").takeIf { it.isNotBlank() },
          authToken = root.optString("authToken").takeIf { it.isNotBlank() },
        )
      }.getOrNull()
    }
  }
}

data class FavoriteSwitch(
  val id: String,
  val deviceMac: String?,
  val pin: Int?,
  val boardName: String?,
  val switchName: String,
  val switchType: String?,
  val isOn: Boolean?
)

