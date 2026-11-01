#!/usr/bin/env bash
# Builds dist-android/Veyloria.apk: the portable one-file game (dist-portable/Veyloria.html) in a
# full-screen landscape WebView. Needs the Ubuntu packages aapt, dalvik-exchange, zipalign,
# apksigner and android-sdk-platform-23 (no Android Studio / Gradle).
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT="$ROOT/dist-android"; W="$OUT/work"
HTML="$ROOT/dist-portable/Veyloria.html"
[ -f "$HTML" ] || { echo "Run npm run build:portable first"; exit 1; }
rm -rf "$W"; mkdir -p "$W/res" "$W/assets" "$W/classes" "$W/gen"
python3 "$ROOT/android/make-icons.py" "$W/res"
cp "$HTML" "$W/assets/index.html"
VC=$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)
VN="1.$VC"
aapt package -f -M "$ROOT/android/AndroidManifest.xml" -S "$W/res" -A "$W/assets" -I "$SDK" -J "$W/gen" \
  --version-code "$VC" --version-name "$VN" -F "$W/unsigned.apk"
javac -nowarn -source 8 -target 8 -bootclasspath "$SDK" -d "$W/classes" \
  "$ROOT/android/src/online/veyloria/game/MainActivity.java" $(find "$W/gen" -name R.java) 2>&1 | grep -v "^warning\|^Note\|^1 warning\|^[0-9] warnings" || true
dalvik-exchange --dex --output="$W/classes.dex" "$W/classes"
(cd "$W" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
KS="${VEYLORIA_KEYSTORE:-$ROOT/android/veyloria.keystore}"; P="${VEYLORIA_KS_PASS:-veyloria}"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass "$P" -keypass "$P" -alias veyloria -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Veyloria Online" >/dev/null 2>&1
apksigner sign --ks "$KS" --ks-pass "pass:$P" --key-pass "pass:$P" --ks-key-alias veyloria --out "$OUT/Veyloria.apk" "$W/aligned.apk"
apksigner verify "$OUT/Veyloria.apk"
rm -rf "$W"
echo "$OUT/Veyloria.apk — version $VN ($(du -h "$OUT/Veyloria.apk" | cut -f1))"
