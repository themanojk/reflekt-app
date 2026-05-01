# Backend Spec: App Updates and Push Notifications

This document describes the backend support needed for:

- Force update and soft update prompts
- Push notification registration, preferences, and delivery

The mobile app should integrate with these APIs after the backend contract is available.

## 1. App Update Control

The backend should expose an app configuration endpoint that the app calls on launch and when returning to foreground.

```http
GET /app/config?platform=ios&version=1.0.1&nativeBuild=19
```

For Android:

```http
GET /app/config?platform=android&version=1.0.1&nativeBuild=1
```

### Response

```json
{
  "update": {
    "required": true,
    "recommended": true,
    "minVersion": "1.0.2",
    "minNativeBuild": 20,
    "latestVersion": "1.0.5",
    "latestNativeBuild": 25,
    "title": "Update required",
    "message": "Please update to continue using lOT.",
    "storeUrl": "https://apps.apple.com/app/...",
    "canSkip": false
  },
  "features": {
    "pushNotifications": true
  }
}
```

### Update Behavior

- `required: true`: the app must block usage until the user updates.
- `recommended: true`: the app can show a soft update prompt.
- `canSkip: false`: the prompt should not allow continuing.
- `canSkip: true`: the user may dismiss the prompt and continue.

The backend should use platform-specific native build numbers for update enforcement:

- iOS: `buildNumber` from `app.json`
- Android: `versionCode` from `app.json`

Keep the iOS and Android counters independent. They do not need to match, and in this app they currently do not match:

- iOS current native build: `19`
- Android current native build: `1`

Version strings like `1.0.10` can be error-prone to compare. Use version strings for display, but use platform-specific native build numbers for hard update decisions.

### Suggested Data Model

```ts
AppVersionRule {
  id: string
  platform: "ios" | "android"
  minVersion: string
  minNativeBuild: number
  latestVersion: string
  latestNativeBuild: number
  updateType: "none" | "soft" | "force"
  title: string
  message: string
  storeUrl: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
```

### Backend Logic

```ts
function getUpdateStatus(platform, currentNativeBuild) {
  const rule = getEnabledVersionRule(platform)

  if (!rule || rule.updateType === "none") {
    return {
      required: false,
      recommended: false,
      canSkip: true
    }
  }

  if (currentNativeBuild < rule.minNativeBuild && rule.updateType === "force") {
    return {
      required: true,
      recommended: true,
      canSkip: false
    }
  }

  if (currentNativeBuild < rule.latestNativeBuild && rule.updateType === "soft") {
    return {
      required: false,
      recommended: true,
      canSkip: true
    }
  }

  return {
    required: false,
    recommended: false,
    canSkip: true
  }
}
```

## 2. Push Notifications

The backend needs to store push tokens per user and device. The app should register a token after login and update it whenever the push token changes.

### Register Push Token

```http
POST /push/register
Authorization: Bearer <user-token>
```

Request:

```json
{
  "platform": "ios",
  "token": "ExponentPushToken[...]",
  "provider": "expo",
  "deviceId": "stable-device-id",
  "appVersion": "1.0.1",
  "nativeBuild": 19,
  "timezone": "Asia/Kolkata",
  "locale": "en-IN"
}
```

Response:

```json
{
  "ok": true
}
```

### Unregister Push Token

Call this when the user logs out or disables push notifications.

```http
POST /push/unregister
Authorization: Bearer <user-token>
```

Request:

```json
{
  "deviceId": "stable-device-id",
  "token": "ExponentPushToken[...]"
}
```

Response:

```json
{
  "ok": true
}
```

The backend should usually mark tokens as disabled instead of deleting them immediately.

### Suggested Data Model

```ts
PushToken {
  id: string
  userId: string
  deviceId: string
  token: string
  provider: "expo" | "fcm" | "apns"
  platform: "ios" | "android"
  appVersion: string
  nativeBuild: number
  enabled: boolean
  lastSeenAt: Date
  createdAt: Date
  updatedAt: Date
}
```

Suggested unique constraints:

```text
unique(token)
unique(userId, deviceId)
```

Registration should upsert by `userId + deviceId` and by `token` to avoid duplicates.

## 3. Notification Preferences

The backend should store notification preferences per user.

```ts
NotificationPreference {
  userId: string
  deviceAlerts: boolean
  switchAlerts: boolean
  marketing: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  createdAt: Date
  updatedAt: Date
}
```

### Get Preferences

```http
GET /notification/preferences
Authorization: Bearer <user-token>
```

Response:

```json
{
  "deviceAlerts": true,
  "switchAlerts": true,
  "marketing": false,
  "quietHoursEnabled": false,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00"
}
```

### Update Preferences

```http
PUT /notification/preferences
Authorization: Bearer <user-token>
```

Request:

```json
{
  "deviceAlerts": true,
  "switchAlerts": false,
  "marketing": false,
  "quietHoursEnabled": true,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00"
}
```

Response:

```json
{
  "ok": true
}
```

## 4. Sending Notifications

The backend should expose internal utilities, not public client endpoints, for sending notifications.

```ts
sendPushToUser(userId, {
  title: "Device offline",
  body: "Bedroom board stopped responding.",
  data: {
    type: "device_offline",
    deviceMac: "A1:B2:C3:D4:E5:F6",
    route: "/devices/A1:B2:C3:D4:E5:F6"
  }
})
```

Every notification should include a stable `data.type`. The app can use that value to decide what screen to open.

### Example Payloads

Device offline:

```json
{
  "title": "Device offline",
  "body": "Bedroom board stopped responding.",
  "data": {
    "type": "device_offline",
    "deviceMac": "A1:B2:C3:D4:E5:F6",
    "route": "/devices/A1:B2:C3:D4:E5:F6"
  }
}
```

Switch update:

```json
{
  "title": "Switch updated",
  "body": "Living Room is now ON.",
  "data": {
    "type": "switch_update",
    "boardId": "board-id",
    "switchId": "switch-id",
    "state": true,
    "route": "/home"
  }
}
```

General announcement:

```json
{
  "title": "New update available",
  "body": "A new version of lOT is ready to install.",
  "data": {
    "type": "app_update",
    "route": "/settings"
  }
}
```

## 5. Provider Choice

### Recommended First Implementation: Expo Push Service

Use Expo Push Service if the app uses `expo-notifications`.

Pros:

- Fastest to implement with Expo/React Native.
- One backend integration for iOS and Android.
- Good enough for normal app notifications.

Backend stores:

```text
provider = "expo"
token = "ExponentPushToken[...]"
```

### Alternative: FCM/APNs

Use Firebase Cloud Messaging or APNs directly if the app needs advanced native push behavior.

Pros:

- More control over native push options.
- Better fit for complex notification infrastructure.

Tradeoff:

- More platform setup.
- More backend provider-specific logic.

For this project, start with Expo Push Service unless a requirement appears that Expo push cannot handle.

## 6. Required Backend Endpoints

```text
GET  /app/config
POST /push/register
POST /push/unregister
GET  /notification/preferences
PUT  /notification/preferences
```

## 7. Required Backend Utilities

```text
compareNativeBuild(platform, currentNativeBuild, minNativeBuild)
sendPushToUser(userId, payload)
sendPushToTokens(tokens, payload)
disableInvalidPushToken(token)
applyNotificationPreferences(userId, notificationType)
```

## 8. Important Implementation Notes

- Disable invalid or expired push tokens when the push provider reports them.
- Store `lastSeenAt` every time a device registers a token.
- Do not send marketing notifications unless the user has opted in.
- Respect quiet hours for non-critical notifications.
- Do not use client-provided user IDs for registration. Resolve `userId` from the auth token.
- Keep update enforcement controlled by backend config so old app versions can be blocked without shipping a new app.
