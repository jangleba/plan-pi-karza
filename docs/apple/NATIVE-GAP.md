# Dlaczego obecnego repo nie da się jeszcze wysłać do App Store

Audytowane `package.json` zawiera TanStack Start, React, Vite i Supabase. Nie ma:

- `@capacitor/core`, `@capacitor/ios` ani alternatywnej warstwy native;
- katalogu `ios/` i projektu Xcode;
- bundle ID, team/signing i provisioning;
- StoreKit/IAP;
- `Info.plist`, entitlements i manifestu prywatności targetu;
- natywnej obsługi deep linków auth/reset hasła;
- testu kamery, zdjęć, mikrofonu i bezpiecznych obszarów w WKWebView.

Najmniejszy rozsądny kolejny etap to osobna paczka „iOS shell + StoreKit”, tworzona dopiero po zamknięciu P0 RODO. Nie wolno dodawać samego webview i udawać gotowości — Apple może odrzucić aplikację za niedopracowaną funkcjonalność, niespójne uprawnienia albo brak prawidłowej płatności.

