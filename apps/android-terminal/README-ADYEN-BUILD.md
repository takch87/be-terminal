# Android terminal – Adyen submission build

This app is configured to produce a release build suitable for Adyen registration and signing.

## What you need
- A keystore (.jks/.keystore) for signing the release build.
- The package name: `com.datafono.terminal` (matches manifest and Gradle).
- Public backend URL reachable by the device: default `https://be.terminal.beticket.net`.

## Environment/Gradle properties for signing
Provide these via shell env or `~/.gradle/gradle.properties`:

- `RELEASE_STORE_FILE=/absolute/path/to/your.keystore`
- `RELEASE_STORE_PASSWORD=*****`
- `RELEASE_KEY_ALIAS=your_alias`
- `RELEASE_KEY_PASSWORD=*****` (optional; defaults to store password)

Optionally override the release BASE URL:
- `APP_BASE_URL_RELEASE=https://your.backend.example`

Debug/local override for emulator:
- `APP_BASE_URL=http://10.0.2.2:3002`

## Build outputs
- Release APK: `app/build/outputs/apk/release/app-release.apk`
- Release AAB: `app/build/outputs/bundle/release/app-release.aab`

## Generate signed release
In the workspace root, run:

- Build signed APK: ./gradlew :apps:android-terminal:app:assembleRelease
- Build signed AAB: ./gradlew :apps:android-terminal:app:bundleRelease

The Gradle script will use the release keystore if provided, otherwise it will fallback to the debug keystore (for sideload tests only).

## Get certificate fingerprints (for Adyen)
Use keytool on your keystore:

- SHA-256: keytool -list -v -keystore /path/your.keystore -alias your_alias -storepass ***** -keypass ***** | grep "SHA-256"

Provide to Adyen:
- Application ID (package name): `com.datafono.terminal`
- SHA-256 signature of the signing cert

## Network & security
- Release uses HTTPS only (cleartext disabled).
- Debug allows cleartext to `10.0.2.2`.

## Notes
- Current build includes NFC foreground detection for Adyen mode and creates Adyen sessions via backend. Replace the simulated approval with Adyen Tap to Pay SDK for production.
- Target SDK is 30 to align with Stripe Terminal 4.x; can be revisited when removing Stripe external reader.
