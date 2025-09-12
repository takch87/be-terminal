# v2.2.3-softpos-tap (2025-09-12)

Main changes
- Fix: Real Tap to Pay with Stripe Terminal — create PaymentIntents with `payment_method_types=["card_present"]` via `/api/stripe/payment_intent_auto` to avoid `card_present not allowed` errors.
- Android: New `TapToPayActivity` using the real Terminal SDK flow (init → discover → connect → collect → confirm). Clear comments and docs added.
- Backend: Documented `/api/stripe/payment_intent_auto` intent and usage for Terminal.
- Dashboard: `version.json` updated to point to the new release APK (2.2.3).

Notes
- Release build is non-debuggable (required by Stripe for real Tap to Pay).
- Debug build uses simulator (`BuildConfig.SIMULATED=true`).
- Terminal Location forced to US by backend connection tokens.

Files of interest
- `apps/android-minimal/app/src/main/java/com/beterminal/app/ui/TapToPayActivity.kt`
- `services/backend-minimal/server.js` (PaymentIntents endpoints)
- `services/backend-minimal/public/version.json`
