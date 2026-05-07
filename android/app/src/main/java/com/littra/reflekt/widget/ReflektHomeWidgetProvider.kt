package com.littra.reflekt.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.littra.reflekt.R
import java.util.concurrent.Executors

class ReflektHomeWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { widgetId ->
      manager.updateAppWidget(widgetId, buildInitialViews(context))
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    manager.updateAppWidget(appWidgetId, buildInitialViews(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action != ACTION_TOGGLE_FAVORITE) return

    val pendingResult = goAsync()
    executor.execute {
      try {
        handleToggle(context.applicationContext, intent)
      } finally {
        pendingResult.finish()
      }
    }
  }

  companion object {
    const val ACTION_TOGGLE_FAVORITE = "com.littra.reflekt.widget.TOGGLE_FAVORITE"
    private const val EXTRA_FAVORITE_ID = "favorite_id"
    private val executor = Executors.newSingleThreadExecutor()

    private val slotIds = intArrayOf(
      R.id.widget_slot_1,
      R.id.widget_slot_2,
      R.id.widget_slot_3,
      R.id.widget_slot_4,
      R.id.widget_slot_5,
      R.id.widget_slot_6,
      R.id.widget_slot_7,
      R.id.widget_slot_8,
    )

    private val slotTitleIds = intArrayOf(
      R.id.widget_slot_1_title,
      R.id.widget_slot_2_title,
      R.id.widget_slot_3_title,
      R.id.widget_slot_4_title,
      R.id.widget_slot_5_title,
      R.id.widget_slot_6_title,
      R.id.widget_slot_7_title,
      R.id.widget_slot_8_title,
    )

    private val slotBoardIds = intArrayOf(
      R.id.widget_slot_1_board,
      R.id.widget_slot_2_board,
      R.id.widget_slot_3_board,
      R.id.widget_slot_4_board,
      R.id.widget_slot_5_board,
      R.id.widget_slot_6_board,
      R.id.widget_slot_7_board,
      R.id.widget_slot_8_board,
    )

    private val slotToggleIds = intArrayOf(
      R.id.widget_slot_1_toggle,
      R.id.widget_slot_2_toggle,
      R.id.widget_slot_3_toggle,
      R.id.widget_slot_4_toggle,
      R.id.widget_slot_5_toggle,
      R.id.widget_slot_6_toggle,
      R.id.widget_slot_7_toggle,
      R.id.widget_slot_8_toggle,
    )

    private val rowIds = intArrayOf(
      R.id.widget_row_1,
      R.id.widget_row_2,
      R.id.widget_row_3,
      R.id.widget_row_4,
    )

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, ReflektHomeWidgetProvider::class.java)
      val widgetIds = manager.getAppWidgetIds(component)
      widgetIds.forEach { widgetId ->
        manager.updateAppWidget(widgetId, buildViews(context, manager, widgetId))
      }
    }

    private fun buildInitialViews(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.reflekt_home_widget_initial)
      views.setTextViewText(R.id.widget_initial, "Open app to sync widget data")
      views.setOnClickPendingIntent(R.id.widget_initial, openAppIntent(context))
      return views
    }

    private fun buildViews(
      context: Context,
      manager: AppWidgetManager,
      widgetId: Int,
      sendingFavoriteId: String? = null,
      sentFavoriteId: String? = null,
      failedFavoriteId: String? = null
    ): RemoteViews {
      val snapshot = HomeWidgetStore.readSnapshot(context)
      val views = RemoteViews(context.packageName, R.layout.reflekt_home_widget)

      views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))
      views.setTextViewText(R.id.widget_title, snapshot?.appName?.ifBlank { "lOT" } ?: "lOT")
      views.setTextViewText(
        R.id.widget_status,
        if (snapshot != null) "${snapshot.onlineBoards}/${snapshot.totalBoards} online" else ""
      )

      val favorites = snapshot?.favorites.orEmpty()
      if (snapshot == null || favorites.isEmpty()) {
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
        views.setViewVisibility(R.id.widget_grid, View.GONE)
        return views
      }

      views.setViewVisibility(R.id.widget_empty, View.GONE)
      views.setViewVisibility(R.id.widget_grid, View.VISIBLE)

      val maxSlots = maxSlotsFor(manager, widgetId).coerceIn(2, 8)
      rowIds.forEachIndexed { index, rowId ->
        views.setViewVisibility(rowId, if (index * 2 < maxSlots) View.VISIBLE else View.GONE)
      }

      slotIds.forEachIndexed { index, slotId ->
        val favorite = favorites.getOrNull(index)
        if (favorite == null || index >= maxSlots) {
          views.setViewVisibility(slotId, View.INVISIBLE)
          return@forEachIndexed
        }

        views.setViewVisibility(slotId, View.VISIBLE)
        views.setTextViewText(slotTitleIds[index], favorite.switchName.ifBlank { "Switch" })
        val isSending = favorite.id == sendingFavoriteId
        val isSent = favorite.id == sentFavoriteId
        val isFailed = favorite.id == failedFavoriteId

        views.setTextViewText(
          slotBoardIds[index],
          when {
            isSending -> "Sending..."
            isSent -> "Command sent"
            isFailed -> "Try again"
            else -> favorite.boardName.orEmpty()
          }
        )
        views.setImageViewResource(slotToggleIds[index], R.drawable.widget_ic_power)
        views.setInt(
          slotId,
          "setBackgroundResource",
          when {
            isSent -> R.drawable.widget_cell_sent_background
            isFailed -> R.drawable.widget_cell_failed_background
            else -> R.drawable.widget_cell_background
          }
        )
        views.setInt(
          slotToggleIds[index],
          "setBackgroundResource",
          when {
            isSent -> R.drawable.widget_toggle_sent
            isFailed -> R.drawable.widget_toggle_failed
            else -> R.drawable.widget_toggle_off
          }
        )
        views.setOnClickPendingIntent(slotId, toggleIntent(context, favorite.id))
        views.setOnClickPendingIntent(slotToggleIds[index], toggleIntent(context, favorite.id))
      }

      return views
    }

    private fun updateWidgetsWithFeedback(
      context: Context,
      sendingFavoriteId: String? = null,
      sentFavoriteId: String? = null,
      failedFavoriteId: String? = null
    ) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, ReflektHomeWidgetProvider::class.java)
      val widgetIds = manager.getAppWidgetIds(component)
      widgetIds.forEach { widgetId ->
        manager.updateAppWidget(
          widgetId,
          buildViews(context, manager, widgetId, sendingFavoriteId, sentFavoriteId, failedFavoriteId)
        )
      }
    }

    private fun maxSlotsFor(manager: AppWidgetManager, widgetId: Int): Int {
      val options = manager.getAppWidgetOptions(widgetId)
      val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      return when {
        minHeight >= 210 -> 8
        minHeight >= 110 -> 4
        else -> 2
      }
    }

    private fun toggleIntent(context: Context, favoriteId: String): PendingIntent {
      val intent = Intent(context, ReflektHomeWidgetProvider::class.java).apply {
        action = ACTION_TOGGLE_FAVORITE
        putExtra(EXTRA_FAVORITE_ID, favoriteId)
      }
      return PendingIntent.getBroadcast(
        context,
        favoriteId.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun openAppIntent(context: Context): PendingIntent {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(context, com.littra.reflekt.MainActivity::class.java)
      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun handleToggle(context: Context, intent: Intent) {
      val favoriteId = intent.getStringExtra(EXTRA_FAVORITE_ID) ?: return
      val snapshot = HomeWidgetStore.readSnapshot(context) ?: return
      val favorite = snapshot.favorites.firstOrNull { it.id == favoriteId } ?: return
      val baseURL = snapshot.apiBaseURL ?: return
      val token = snapshot.authToken ?: return
      val deviceMac = favorite.deviceMac ?: return
      val pin = favorite.pin ?: return

      updateWidgetsWithFeedback(context, sendingFavoriteId = favoriteId)

      val nextState = !(favorite.isOn ?: false)
      if (HomeWidgetNetwork.sendPresenceCommand(baseURL, token, deviceMac, pin, nextState)) {
        HomeWidgetStore.updateFavoriteState(context, favoriteId, nextState)
        updateWidgetsWithFeedback(context, sentFavoriteId = favoriteId)
      } else {
        updateWidgetsWithFeedback(context, failedFavoriteId = favoriteId)
      }

      Thread.sleep(1500)
      updateAll(context)
    }
  }
}
