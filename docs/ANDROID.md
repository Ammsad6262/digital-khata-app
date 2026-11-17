# Android app (Trusted Web Activity)

Dukhata ships to Android as a **Trusted Web Activity (TWA)**: a thin native
Android shell that opens `https://dukhata.com` full-screen using the device's
own Chrome rendering engine. There is no second codebase — the Android app and
the website are the same product, so a change deployed to `main` is live in the
app immediately.

## Why a TWA rather than a native rewrite

| Concern | How a TWA answers it |
| --- | --- |
| "Fast and good on Android" | Rendering runs in the system Chrome/WebView the phone already has and keeps updated — no bundled engine, tiny download (~1 MB). |
| "Nearly all Android versions" | `minSdkVersion 21` = Android 5.0 (2014) upward. Devices without a TWA-capable browser fall back to a Chrome Custom Tab, then a WebView. |
| One codebase | The site *is* the app. No duplicated logic, no drift between web and mobile. |
| Login | The app shares Chrome's cookies, so a signed-in user stays signed in. |

## Configuration

| Setting | Value |
| --- | --- |
| Package id | `com.dukhata.app` |
| Host / origin | `https://dukhata.com` |
| start_url | `/dashboard` |
| display | `standalone`, portrait |
| Theme / background | `#FAF8F4` (the site's paper) |
| Web manifest | `https://dukhata.com/manifest.json` |

Project files live **outside** the web repo, in `..\..\dukhata-android`
(`C:\Users\user\Documents\Default Project\dukhata-android`), because a Gradle
project and a signing keystore must never be committed to the web repository.

## Toolchain

Bubblewrap (`@bubblewrap/cli`) needs **JDK 17** and an **Android SDK**. On this
machine:

```
JDK 17        C:\Users\user\Documents\Default Project\android-tools\jdk-17
Android SDK   C:\Users\user\AppData\Local\Android\Sdk
Bubblewrap    npm i -g @bubblewrap/cli          (1.27.0)
Config        C:\Users\user\.bubblewrap\config.json   (jdkPath + androidSdkPath)
Project       C:\Users\user\Documents\Default Project\dukhata-android
```

Three quirks worth knowing, all already handled:

1. **Bubblewrap's `androidSdkPath` wants either `tools/` or `bin/` inside it.**
   The stock SDK from Android Studio has neither, so an (empty) `bin` folder was
   created at the SDK root to satisfy `AndroidSdkTools.validatePath`.
2. **Bubblewrap pins build-tools `36.1.0`**, which is not installed here. Rather
   than let it run its own *interactive* `sdkmanager` install mid-build, a
   `build-tools\36.1.0` folder was created alongside the real `36.0.0`, and
   `app/build.gradle` was pinned with `buildToolsVersion "36.0.0"` so Gradle
   uses the genuine one.
3. **The Android command-line tools are not required** — nothing on this path
   needs `sdkmanager`.

Signing uses `dukhata-android/dukhata.keystore` (alias `dukhata`); the passwords
are in the sibling `KEYSTORE-CREDENTIALS.txt`. **Back both up.** They are
outside the web repo on purpose and must never be committed. Losing the keystore
means you can never publish an update to the same Play listing under that key.

## Build

```powershell
# 1. put the signing fingerprint where the site can serve it
cd "C:\Users\user\Documents\Default Project\digital-khata-app\digital-khata-app-main"
node scripts/android-write-assetlinks.mjs `
  "C:\Users\user\Documents\Default Project\dukhata-android\dukhata.keystore" `
  dukhata "<storepass>"
# then commit + push that change so /.well-known/assetlinks.json is live

# 2. build the app
cd "C:\Users\user\Documents\Default Project\dukhata-android"
$env:JAVA_HOME="C:\Users\user\Documents\Default Project\android-tools\jdk-17"
$env:ANDROID_HOME="C:\Users\user\AppData\Local\Android\Sdk"
$env:BUBBLEWRAP_KEYSTORE_PASSWORD="<storepass>"
$env:BUBBLEWRAP_KEY_PASSWORD="<keypass>"
bubblewrap build --skipPwaValidation
```

Because `twa-manifest.json` is the single source of truth, regenerating the
whole Gradle project (after changing any setting in it) is:

```powershell
cd "C:\Users\user\Documents\Default Project\dukhata-android"
bubblewrap update --skipVersionUpgrade   # no prompts
# then re-apply the buildToolsVersion pin in app/build.gradle
```

Outputs (in the project directory):

- `app-release-signed.apk` — install directly on a phone to test
- `app-release-bundle.aab` — the file uploaded to Google Play

Test on a device: `adb install -r app-release-signed.apk`
(`adb` lives in `<AndroidSdk>\platform-tools`).

## Digital Asset Links (the part that fails if you skip it)

Android verifies that the site and the app belong together by fetching
`https://dukhata.com/.well-known/assetlinks.json`. That URL is served by a route
handler (`src/app/api/assetlinks/route.ts`) via a rewrite in `next.config.mjs`.
If the fingerprint there does not match the installed app's signing certificate,
the app still runs but shows Chrome's address bar on top.

Fingerprints come from, in order:

1. `ANDROID_SHA256_CERT_FINGERPRINTS` (Vercel env var, comma-separated) — lets a
   new key be added without a code change.
2. `FALLBACK_FINGERPRINTS` in the route, written by
   `scripts/android-write-assetlinks.mjs`.

**Play App Signing:** once the app is on Play, Google re-signs it. Add *both* the
upload key's fingerprint and the app-signing certificate's fingerprint from the
Play Console (Release → Setup → App signing), or the published build will show
the browser bar.

Verify after deploying:

```powershell
curl.exe -s https://dukhata.com/.well-known/assetlinks.json
```

## Offline behaviour

`public/sw.js` is a deliberately minimal service worker: it only handles
navigations and falls back to `public/offline.html` when the device is offline.
It never caches pages or API responses, so khata data can never be served stale.

## Publishing checklist

- [ ] `bubblewrap build` produced `app-release-bundle.aab`
- [ ] `/.well-known/assetlinks.json` returns the right fingerprint(s)
- [ ] Play Console: create app `com.dukhata.app`, upload the AAB
- [ ] App content: privacy policy `https://dukhata.com/privacy`, data-safety form
- [ ] Store listing: 2+ phone screenshots, feature graphic, short/full description
- [ ] Play App Signing: copy the app-signing fingerprint back into assetlinks
- [ ] Internal testing track first, then production
