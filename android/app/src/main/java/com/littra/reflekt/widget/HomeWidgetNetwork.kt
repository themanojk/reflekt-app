package com.littra.reflekt.widget

import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object HomeWidgetNetwork {
  fun currentPinState(baseURL: String, token: String, deviceMac: String, pin: Int): Boolean? {
    val encodedMac = URLEncoder.encode(deviceMac.uppercase(), "UTF-8")
    val url = URL("${baseURL.trimEnd('/')}/devices/macAddress?mac_address=$encodedMac")
    val connection = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 8000
      readTimeout = 8000
      setRequestProperty("Authorization", "Bearer $token")
    }

    return try {
      if (connection.responseCode !in 200..299) return null
      val body = connection.inputStream.bufferedReader().use { it.readText() }
      val pins = JSONObject(body).optJSONObject("status")?.optJSONObject("pins") ?: return null
      parsePinValue(pins.opt(pin.toString()))
    } finally {
      connection.disconnect()
    }
  }

  fun sendPresenceCommand(
    baseURL: String,
    token: String,
    deviceMac: String,
    pin: Int,
    isOn: Boolean
  ): Boolean {
    val url = URL("${baseURL.trimEnd('/')}/presence")
    val payload = JSONObject()
      .put("mac_address", deviceMac.uppercase())
      .put(
        "data",
        JSONObject()
          .put("cmd", if (isOn) "on" else "off")
          .put("pin", pin)
      )
      .toString()

    val connection = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 8000
      readTimeout = 8000
      doOutput = true
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("Content-Type", "application/json")
    }

    return try {
      OutputStreamWriter(connection.outputStream).use { it.write(payload) }
      connection.responseCode in 200..299
    } finally {
      connection.disconnect()
    }
  }

  private fun parsePinValue(value: Any?): Boolean? {
    return when (value) {
      is Boolean -> value
      is Number -> value.toInt() != 0
      is String -> when (value.trim().lowercase()) {
        "1", "true", "on" -> true
        "0", "false", "off" -> false
        else -> null
      }
      else -> null
    }
  }
}
