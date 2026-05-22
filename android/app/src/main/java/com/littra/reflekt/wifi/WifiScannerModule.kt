package com.littra.reflekt.wifi

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WifiScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "WifiScanner"

  @ReactMethod
  fun getAvailableNetworks(promise: Promise) {
    val wifiManager =
      reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    if (wifiManager == null) {
      promise.reject("wifi_unavailable", "Wi-Fi manager unavailable")
      return
    }

    if (!hasScanPermission()) {
      promise.reject("wifi_permission", "Wi-Fi scan permission not granted")
      return
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        try {
          reactContext.unregisterReceiver(this)
        } catch (_: IllegalArgumentException) {
        }
        resolveNetworks(wifiManager, promise)
      }
    }

    reactContext.registerReceiver(
      receiver,
      IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
    )

    try {
      val started = wifiManager.startScan()
      if (!started) {
        reactContext.unregisterReceiver(receiver)
        resolveNetworks(wifiManager, promise)
      }
    } catch (error: Exception) {
      try {
        reactContext.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) {
      }
      promise.reject("wifi_scan_failed", error)
    }
  }

  private fun resolveNetworks(wifiManager: WifiManager, promise: Promise) {
    try {
      val currentSsid = normalizeSsid(wifiManager.connectionInfo?.ssid)
      val strongestBySsid = linkedMapOf<String, android.net.wifi.ScanResult>()

      wifiManager.scanResults
        .asSequence()
        .filter { !it.SSID.isNullOrBlank() }
        .sortedByDescending { it.level }
        .forEach { result ->
          strongestBySsid.putIfAbsent(result.SSID, result)
        }

      val networks = Arguments.createArray()
      val emittedSsids = linkedSetOf<String>()

      fun pushNetwork(
        ssid: String,
        bssid: String? = null,
        level: Int? = null,
        capabilities: String? = null,
        frequency: Int? = null,
      ) {
        if (ssid.isBlank() || !emittedSsids.add(ssid)) return

        val map = Arguments.createMap()
        map.putString("ssid", ssid)
        map.putString("bssid", bssid)
        if (level != null) {
          map.putInt("level", level)
        } else {
          map.putNull("level")
        }
        map.putString("capabilities", capabilities)
        if (frequency != null) {
          map.putInt("frequency", frequency)
        } else {
          map.putNull("frequency")
        }
        map.putBoolean("isCurrent", ssid == currentSsid)
        networks.pushMap(map)
      }

      if (!currentSsid.isNullOrBlank()) {
        val currentInfo = wifiManager.connectionInfo
        pushNetwork(
          ssid = currentSsid,
          bssid = currentInfo?.bssid,
          level = currentInfo?.rssi,
          frequency = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            currentInfo?.frequency
          } else {
            null
          },
        )
      }

      strongestBySsid.values.forEach { result ->
        pushNetwork(
          ssid = result.SSID,
          bssid = result.BSSID,
          level = result.level,
          capabilities = result.capabilities,
          frequency = result.frequency,
        )
      }

      try {
        @Suppress("DEPRECATION")
        wifiManager.configuredNetworks
          ?.asSequence()
          ?.mapNotNull { config -> normalizeSsid(config.SSID) }
          ?.filter { it.isNotBlank() }
          ?.forEach { configuredSsid ->
            pushNetwork(ssid = configuredSsid)
          }
      } catch (_: SecurityException) {
      }

      promise.resolve(networks)
    } catch (error: Exception) {
      promise.reject("wifi_results_failed", error)
    }
  }

  private fun hasScanPermission(): Boolean {
    val fineLocationGranted =
      ContextCompat.checkSelfPermission(
        reactContext,
        Manifest.permission.ACCESS_FINE_LOCATION,
      ) == PackageManager.PERMISSION_GRANTED

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val nearbyWifiGranted =
        ContextCompat.checkSelfPermission(
          reactContext,
          Manifest.permission.NEARBY_WIFI_DEVICES,
        ) == PackageManager.PERMISSION_GRANTED
      return fineLocationGranted && nearbyWifiGranted
    }

    return fineLocationGranted
  }

  private fun normalizeSsid(rawSsid: String?): String? {
    if (rawSsid.isNullOrBlank()) return null
    return rawSsid.removePrefix("\"").removeSuffix("\"")
  }
}
