package com.littra.reflekt.widget

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WidgetBridge"

  @ReactMethod
  fun setHomeWidgetSnapshot(snapshotJson: String, appGroupId: String?, widgetKind: String?, promise: Promise) {
    try {
      HomeWidgetStore.writeSnapshot(reactContext, snapshotJson)
      ReflektHomeWidgetProvider.updateAll(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("widget_sync_failed", error)
    }
  }

  @ReactMethod
  fun reloadWidgets(widgetKind: String?, promise: Promise) {
    try {
      ReflektHomeWidgetProvider.updateAll(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("widget_reload_failed", error)
    }
  }
}

