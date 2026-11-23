# Android app

## What ships now: a native app (3.0.0)

The APK at `/app/dukhata.apk` is a **React Native app** (Expo SDK 58). Its
screens are native views, not a website in a frame. It talks to this same
Next.js API and shows the same data.

- Source: `D:\dukhata-mobile` (its `README.md` and `docs/PLAN.md`).
- Package `com.dukhata.app`, versionCode 19 (3.0.11), signed with the owner's
  existing key — it upgrades the old WebView app in place.
- What is built so far: sign-in, registration (trial / paid), redeem, Home,
  the customer khata (list, search, add, **edit**, detail, record payment,
  history), creating a **sale** on the phone, **sale detail** with a receipt you
  can **share as a PDF or print**, **products** with live stock, **stock
  adjustments**, **expenses** (list, add, **edit**), **suppliers** with
  payments, **purchases** that add stock, **reminders**, **business insights**
  and the **growth plan**, the **transactions ledger**, the **assistant**,
  **settings**, **PIN lock**, the sales list, the full report screen, and More
  (licence, English / اردو, logout).
- The assistant now also accepts **voice** (record -> same endpoint -> confirm).
- Still on the website only: backup **import/restore** (it replaces all data and
  needs the full confirmation flow).

### Previous shell (superseded)

Before 3.0.0 the app was a **Capacitor 8 WebView shell** (2.0.1). It is kept
on disk as a fallback at `C:\Users\user\dukhata-capacitor`; it is no longer
published. It replaced a Trusted Web Activity because a TWA runs inside Chrome
and shows a "you'll see your site data in Chrome" disclosure that Google does
not let developers remove.

| | Native app (3.0.0) | Capacitor shell (2.0.1) |
| --- | --- | --- |
| Renders with | native views | Android system WebView |
| Chrome involved | no | no |
| Website changes reach the app | via release / OTA | instantly |
| Downloads, printing | native share/print available | broken (see below) |

The old TWA project is still on disk at `C:\Users\user\dukhata-android`, and
`/.well-known/assetlinks.json` is still served, which is harmless: it only means
the retired TWA would keep working if ever reinstalled.

### Known limitations of the retired WebView shell

A WebView does not hand file downloads or printing over to Android, so these
did nothing on the phone:

| Control | Where | Why |
| --- | --- | --- |
| Full backup (JSON) | `/more/backup` | builds a blob, then clicks a download link |
| Per-table CSV export | `/more/backup` | same |
| Reports CSV export | `/more/reports` | same, generated in the page |
| Receipt **Print** | `/sales/[id]/receipt` | `window.print()` has no handler in a WebView |

Those screens are not in the native app yet; until they are, exports stay on
the website. When they are ported they will use the device share sheet and
Android's print service rather than a download link.

**Microphone:** the manifest declares `RECORD_AUDIO` and
`MODIFY_AUDIO_SETTINGS`. Capacitor's `WebChromeClient.onPermissionRequest`
requests the runtime permission when the page calls `getUserMedia`. Without the
manifest entry the voice assistant fails silently — which is exactly what would
have happened before v2.0.1.

## Building the shell

Project: `C:\Users\user\dukhata-capacitor` (outside the web repo, so its Gradle
output and keystore are never committed).

```powershell
# JDK 21 is REQUIRED: Capacitor 8 compiles for Java 21 (JDK 17 fails with
# "invalid source release: 21").
$env:JAVA_HOME        = "C:\Users\user\android-tools\jdk-21.0.13+9"
$env:ANDROID_HOME     = "C:\Users\user\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:DUKHATA_KEYSTORE_PASSWORD = "<storepass>"
$env:DUKHATA_KEY_PASSWORD      = "<keypass>"

cd C:\Users\user\dukhata-capacitor
npx cap sync android            # after changing capacitor.config.json or plugins
cd android
.\gradlew.bat assembleRelease --no-daemon
# -> android\app\build\outputs\apk\release\app-release.apk
```

Then publish it (from the web repo):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\android-publish-apk.ps1 `
  -ApkPath "C:\Users\user\dukhata-capacitor\android\app\build\outputs\apk\release\app-release.apk"
git add public/app/dukhata.apk && git commit -m "release(android): ..." && git push
```

### Key settings

- `capacitor.config.json`: `server.url = https://dukhata.com/start` — the app
  entry that decides login vs dashboard. `webDir` holds only a fallback page.
- `versionCode` / `versionName` live in `android/app/build.gradle`. Bump BOTH;
  Android only installs an update whose `versionCode` is higher.
- Signed with the **same keystore** as the retired TWA
  (`C:\Users\user\dukhata-android\dukhata.keystore`), so this build installs
  straight over the old app rather than sitting beside it.
- `minSdkVersion 24` (Android 7.0), `targetSdkVersion 36`.
- External links (WhatsApp, `tel:`, `mailto:`) open in the matching app
  automatically: Capacitor's `Bridge.launchIntent` sends any host that is not
  dukhata.com to the system browser.

## The retired TWA (kept for reference)

Dukhata previously shipped as a **Trusted Web Activity (TWA)**: a thin native
Android shell that opens `https://dukhata.com` full-screen using the device's
own Chrome rendering engine.

## Why a TWA rather than a native rewrite

| Concern | How a TWA answers it |
| --- | --- |
| "Nearly all Android versions" | `minSdkVersion 24` = Android 7.0 (2016) upward. This floor is set by `com.google.androidbrowserhelper` itself (the TWA library declares minSdk 24); it still covers ~99% of active Android devices. Devices without a TWA-capable browser fall back to a Chrome Custom Tab. |
| One codebase | The site *is* the app. No duplicated logic, no drift between web and mobile. |
| Login | The app shares Chrome's cookies, so a signed-in user stays signed in. |

**Why it was retired:** the Chrome disclosure. Google's own documentation and the
`android-browser-helper` maintainers confirm it cannot be suppressed — every TWA
shows it once per app.

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
(`C:\Users\user\dukhata-android`), because a Gradle
project and a signing keystore must never be committed to the web repository.

## Toolchain

Bubblewrap (`@bubblewrap/cli`) needs **JDK 17** and an **Android SDK**. On this
machine:

```
JDK 17        C:\Users\user\android-tools\jdk-17
Android SDK   C:\Users\user\AppData\Local\Android\Sdk
Bubblewrap    npm i -g @bubblewrap/cli          (1.27.0)
Config        C:\Users\user\.bubblewrap\config.json   (jdkPath + androidSdkPath)
Project       C:\Users\user\dukhata-android
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
  "C:\Users\user\dukhata-android\dukhata.keystore" `
  dukhata "<storepass>"
# then commit + push that change so /.well-known/assetlinks.json is live

# 2. build the app
cd "C:\Users\user\dukhata-android"
$env:JAVA_HOME="C:\Users\user\android-tools\jdk-17"
$env:ANDROID_HOME="C:\Users\user\AppData\Local\Android\Sdk"
$env:BUBBLEWRAP_KEYSTORE_PASSWORD="<storepass>"
$env:BUBBLEWRAP_KEY_PASSWORD="<keypass>"
bubblewrap build --skipPwaValidation
```

Because `twa-manifest.json` is the single source of truth, regenerating the
whole Gradle project (after changing any setting in it) is:

```powershell
cd "C:\Users\user\dukhata-android"
bubblewrap update --skipVersionUpgrade   # no prompts
# then re-apply the buildToolsVersion pin in app/build.gradle
```

Outputs (in the project directory):

- `app-release-signed.apk` — install directly on a phone to test
- `app-release-bundle.aab` — the file uploaded to Google Play

Test on a device: `adb install -r app-release-signed.apk`
(`adb` lives in `<AndroidSdk>\platform-tools`).

## App entry point — the marketing page is never shown in the app

`/` is the marketing landing page and **stays that way** for search engines. The
installed app must never open on it, so both the TWA (`startUrl`) and the web
manifest (`start_url`) point at **`/start`**:

- `src/app/start/route.ts` is a route handler, not a page, so the server answers
  with a real **307**: a signed-in owner goes to `/dashboard`, everyone else to
  `/login` (which links on to `/register`).
- Deciding server-side means the first painted screen is already correct, with
  no flash, and nothing depends on client JavaScript.
- Verified live: `https://dukhata.com/start` → `307 → /login` for a signed-out
  visitor.

## Distribution — the website's "Download for Android" button

The app is distributed **directly from the website** today, so a user can
download and install it without a store account:

- The signed APK is committed at `public/app/dukhata.apk`, so it is served from
  the stable URL `https://dukhata.com/app/dukhata.apk`.
- `next.config.mjs` serves that path with
  `Content-Type: application/vnd.android.package-archive`, which is what makes
  Android offer to install it instead of saving an unknown file.
- The marketing site's "Download for Android" button
  (`src/components/marketing/CtaButtons.tsx`) links to that URL.

To ship a new build:

```powershell
cd "C:\Users\user\dukhata-android"
# bump appVersionCode/appVersionName in twa-manifest.json, then:
bubblewrap update --skipVersionUpgrade   # re-apply the buildToolsVersion pin afterwards
bubblewrap build --skipPwaValidation

cd "C:\Users\user\Documents\Default Project\digital-khata-app\digital-khata-app-main"
powershell -ExecutionPolicy Bypass -File scripts/android-publish-apk.ps1
git add public/app/dukhata.apk && git commit -m "release(android): <version>" && git push
```

**Upgrading an installed app:** Android installs a new APK over an existing one
only if both are signed with the same key and the new `versionCode` is higher.
That is why the keystore must be preserved.

> Direct downloads cannot auto-update. Once the Play Store listing exists, the
> same AAB gives users automatic updates and a trust signal. Keep the direct
> download as the "no store needed" path, or point the button at the Play
> listing later.

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
