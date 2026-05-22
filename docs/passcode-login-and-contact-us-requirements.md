# Passcode Login and Contact Us Integration

This document describes the backend contract for the mobile app integration after replacing OTP login with backend-managed 6-digit passcode login.

## Base Behavior

- Phone remains the primary login identifier.
- Phone values are normalized on the backend before lookup.
- India phone formats such as `9876543210`, `+91 9876543210`, and `09876543210` resolve to `9876543210`.
- Passcodes are exactly 6 digits.
- Passcodes are stored as salted one-way hashes and are never returned by the API.
- Temporary passcodes are created by admin/provisioning flows.
- A normal app `jwtToken` is returned only after all mandatory onboarding is complete.

## Auth Status Values

The mobile app should route by the `status` field:

| Status | Meaning | Mobile Route |
| --- | --- | --- |
| `authenticated` | User can enter the app | Main app |
| `change_passcode_required` | User authenticated with temporary passcode | Change Passcode screen |
| `email_required` | User changed passcode but email is missing | Mandatory Email screen |

Failure responses use:

```json
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid phone number or passcode"
}
```

Common error codes:

- `INVALID_CREDENTIALS`
- `USER_NOT_REGISTERED`
- `ACCOUNT_LOCKED`
- `ACCOUNT_DISABLED`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `TOKEN_REQUIRED`
- `TOKEN_EXPIRED`
- `INVALID_CURRENT_PASSCODE`
- `PASSCODE_MISMATCH`
- `PASSCODE_REUSE_NOT_ALLOWED`
- `EMAIL_REQUIRED`
- `INVALID_EMAIL`
- `EMAIL_ALREADY_EXISTS`

When `/user/login` receives a phone number that does not belong to any user, the backend returns:

```json
{
  "success": false,
  "error": "USER_NOT_REGISTERED",
  "message": "You are not a registered user. Contact admin"
}
```

## 1. Login With Passcode

`POST /user/login`

Request:

```json
{
  "phone": "9876543210",
  "passcode": "123456"
}
```

Authenticated response:

```json
{
  "success": true,
  "status": "authenticated",
  "jwtToken": "jwt-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": "user@example.com",
    "role": "user",
    "firstName": "Manoj",
    "lastName": "Kumar",
    "avatar": null,
    "passcodeChangeRequired": false,
    "emailRequired": false
  }
}
```

Temporary passcode response:

```json
{
  "success": true,
  "status": "change_passcode_required",
  "challengeToken": "short-lived-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": null,
    "role": "user"
  }
}
```

Email missing response:

```json
{
  "success": true,
  "status": "email_required",
  "challengeToken": "short-lived-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": null,
    "role": "user"
  }
}
```

Notes:

- `challengeToken` defaults to a 15-minute expiry.
- `challengeToken` is scoped for onboarding actions.
- Repeated failed passcode attempts increment `failedLoginAttempts`.
- After the configured attempt limit, the account is temporarily locked.

## 2. Change Passcode

`POST /user/change-passcode`

Authorization:

```text
Authorization: Bearer <challengeToken or jwtToken>
```

Use the `challengeToken` from `/user/login` when the status is `change_passcode_required`.

Request:

```json
{
  "currentPasscode": "123456",
  "newPasscode": "654321",
  "confirmPasscode": "654321"
}
```

Success when email is missing:

```json
{
  "success": true,
  "status": "email_required",
  "challengeToken": "short-lived-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": null,
    "role": "user"
  }
}
```

Success when email exists:

```json
{
  "success": true,
  "status": "authenticated",
  "jwtToken": "jwt-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": "user@example.com",
    "role": "user",
    "firstName": "Manoj",
    "lastName": "Kumar",
    "avatar": null,
    "passcodeChangeRequired": false,
    "emailRequired": false
  }
}
```

Rules:

- `currentPasscode`, `newPasscode`, and `confirmPasscode` are required.
- Current and new passcodes must be exactly 6 digits.
- `newPasscode` must match `confirmPasscode`.
- `newPasscode` must differ from `currentPasscode`.
- On success, `passcodeIsTemporary` becomes `false`.
- On success, `passcodeChangedAt` is set.
- Existing challenge tokens for the user are invalidated.

## 3. Complete Mandatory Email

`POST /user/complete-email`

Authorization:

```text
Authorization: Bearer <challengeToken>
```

Use the `challengeToken` from `/user/change-passcode` when the status is `email_required`.

Request:

```json
{
  "email": "user@example.com"
}
```

Success:

```json
{
  "success": true,
  "status": "authenticated",
  "jwtToken": "jwt-token",
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": "user@example.com",
    "role": "user",
    "firstName": "Manoj",
    "lastName": "Kumar",
    "avatar": null,
    "passcodeChangeRequired": false,
    "emailRequired": false
  }
}
```

Rules:

- Email is mandatory after first passcode change.
- Email must be valid.
- Email must be globally unique.
- Email verification is not required in this release.
- `emailVerifiedAt` remains unset until a future verification flow is added.
- Existing challenge tokens for the user are invalidated.

## 4. Get Current User

`GET /user`

Authorization:

```text
Authorization: Bearer <jwtToken>
```

Response:

```json
{
  "user": {
    "id": "user-id",
    "phone": "9876543210",
    "email": "user@example.com",
    "role": "user",
    "firstName": "Manoj",
    "lastName": "Kumar",
    "avatar": null,
    "passcodeChangeRequired": false,
    "emailRequired": false
  }
}
```

Mobile usage:

- Use this endpoint during app restore when a full `jwtToken` exists.
- If `passcodeChangeRequired` or `emailRequired` is true, route to the required onboarding screen.

## Mobile Flow

1. User enters phone number.
2. User enters 6-digit passcode.
3. App calls `POST /user/login`.
4. If `status` is `change_passcode_required`, open Change Passcode.
5. User enters current passcode, new passcode, and confirm passcode.
6. App calls `POST /user/change-passcode` with `challengeToken`.
7. If `status` is `email_required`, open Mandatory Email.
8. User enters email.
9. App calls `POST /user/complete-email` with `challengeToken`.
10. Backend returns `jwtToken` and `user`.
11. App stores token/user and enters the main app.

## Admin and Provisioning

### Create User With Temporary Passcode

`POST /user/admin`

Authorization:

```text
Authorization: Bearer <adminJwtToken>
```

Request:

```json
{
  "phone": "9876543210",
  "passcode": "123456",
  "firstName": "Manoj",
  "lastName": "Kumar",
  "email": "user@example.com",
  "role": "user",
  "isActive": true
}
```

Notes:

- `phone` and `passcode` are required.
- `passcode` must be exactly 6 digits.
- Created passcodes are always temporary.
- The passcode is never returned.

### Reset User Passcode

`PATCH /user/admin/:userId/passcode-reset`

Authorization:

```text
Authorization: Bearer <adminJwtToken>
```

Request:

```json
{
  "passcode": "111222"
}
```

Result:

- Sets a new temporary passcode.
- Clears failed login attempts and lockout.
- Invalidates existing challenge tokens.
- Forces `change_passcode_required` on next login.

### Activate or Deactivate User

`PATCH /user/admin/:userId/status`

Authorization:

```text
Authorization: Bearer <adminJwtToken>
```

Request:

```json
{
  "isActive": false
}
```

## Contact Us

The new support routes are mounted under `/support`.

The older `/contact` route still exists for compatibility with the existing web/contact form.

### Contact Content

`GET /support/contact`

Response:

```json
{
  "success": true,
  "contact": {
    "title": "Contact Us",
    "supportEmail": "support@example.com",
    "supportPhone": "+91XXXXXXXXXX",
    "whatsappNumber": "+91XXXXXXXXXX",
    "businessHours": "Monday to Saturday, 10:00 AM to 6:00 PM IST",
    "address": "Company address",
    "message": "For account, device, or installation support, contact us using the details below."
  }
}
```

Configuration:

| Environment Variable | Field |
| --- | --- |
| `SUPPORT_CONTACT_TITLE` | `title` |
| `SUPPORT_EMAIL` | `supportEmail` |
| `SUPPORT_PHONE` | `supportPhone` |
| `SUPPORT_WHATSAPP` | `whatsappNumber` |
| `SUPPORT_BUSINESS_HOURS` | `businessHours` |
| `SUPPORT_ADDRESS` | `address` |
| `SUPPORT_MESSAGE` | `message` |

Empty values are omitted from the response.

### Submit Support Request

`POST /support/contact-requests`

Authorization:

```text
Authorization: Bearer <jwtToken>
```

Authorization is supported and recommended. If a token is present, the backend pre-fills `email` and `phone` from the authenticated user when the request body does not provide them.

Request:

```json
{
  "name": "Manoj Kumar",
  "email": "user@example.com",
  "phone": "9876543210",
  "subject": "Login issue",
  "message": "I am unable to change my passcode."
}
```

Success:

```json
{
  "success": true,
  "requestId": "support-request-id",
  "message": "Your request has been submitted"
}
```

Rules:

- `email`, `subject`, and `message` are required.
- Email must be valid.
- `phone` is optional for support requests.
- Requests are stored in the existing `contact_forms` collection.
- Stored fields include `userId`, `subject`, `message`, `status`, and timestamps.
- Basic in-memory rate limiting is applied by user id or IP.

Rate-limit configuration:

| Environment Variable | Default |
| --- | --- |
| `SUPPORT_RATE_WINDOW_MS` | `900000` |
| `SUPPORT_RATE_MAX` | `5` |

## Backend Environment Configuration

| Environment Variable | Default | Purpose |
| --- | --- | --- |
| `PASSCODE_MAX_ATTEMPTS` | `5` | Failed passcode attempts before lock |
| `PASSCODE_LOCK_MINUTES` | `15` | Temporary account lock duration |
| `CHALLENGE_TOKEN_TTL` | `15m` | Challenge token expiry |
| `SUPPORT_RATE_WINDOW_MS` | `900000` | Support request rate-limit window |
| `SUPPORT_RATE_MAX` | `5` | Max support requests per window |

## Migration Notes

- Existing OTP routes remain available during rollout:
  - `POST /user/request-otp`
  - `POST /user/verify-otp`
- New app versions should use passcode endpoints only.
- Existing users need a temporary passcode set by admin/provisioning before they can use `/user/login`.
- Existing users with duplicate emails must be cleaned before MongoDB builds the unique sparse email index.
- Existing saved JWTs continue to work unless a forced logout is planned.
- Existing users without email should be routed through `email_required` after passcode change.

## Security Notes

- Do not log passcodes in mobile or backend logs.
- Do not store passcodes in AsyncStorage or local preferences.
- Store only `jwtToken`, `user`, and transient `challengeToken` while onboarding.
- Clear `challengeToken` after successful passcode change/email completion or when the user cancels onboarding.
- Show generic login errors for `INVALID_CREDENTIALS`.
- Treat `ACCOUNT_LOCKED` and `ACCOUNT_DISABLED` as blocked states in the UI.
