package com.littra.reflekt.widget

import android.content.Context
import org.json.JSONObject

object HomeWidgetStore {
  private const val PREFS_NAME = "littra_home_widget"
  private const val SNAPSHOT_KEY = "home_widget_snapshot_v1"

  fun readRawSnapshot(context: Context): String? {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(SNAPSHOT_KEY, null)
  }

  fun readSnapshot(context: Context): HomeWidgetSnapshot? {
    return HomeWidgetSnapshot.fromJson(readRawSnapshot(context))
  }

  fun writeSnapshot(context: Context, rawSnapshot: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(SNAPSHOT_KEY, rawSnapshot)
      .apply()
  }

  fun updateFavoriteState(context: Context, favoriteId: String, isOn: Boolean) {
    val raw = readRawSnapshot(context) ?: return
    val updated = runCatching {
      val root = JSONObject(raw)
      val favorites = root.optJSONArray("favorites") ?: return
      for (index in 0 until favorites.length()) {
        val item = favorites.optJSONObject(index) ?: continue
        if (item.optString("id") == favoriteId) {
          item.put("isOn", isOn)
          item.put("updatedAtISO", java.time.Instant.now().toString())
          break
        }
      }
      root.put("updatedAtISO", java.time.Instant.now().toString())
      root.toString()
    }.getOrNull() ?: return

    writeSnapshot(context, updated)
  }
}
