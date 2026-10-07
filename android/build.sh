#!/usr/bin/env bash
# Сборка APK «Жестянки» без Android Studio и без интернета.
# Работает в двух местах:
#   - компьютер с Android SDK: путь берётся из ANDROID_HOME, иначе D:/Android/sdk
#     (нужны build-tools, platforms android-23 и android-34, JDK 17);
#   - Ubuntu с пакетами: sudo apt-get install -y aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
# Запуск:  ./android/build.sh
# Результат: android/build/zhestyanki-1.0.0.apk
set -e
cd "$(dirname "$0")"

OUT=build
APK_NAME=zhestyanki-1.0.0.apk
KS=keystore/zhestyanki.keystore
KS_PASS_FILE=keystore/password.txt
ALIAS=zhestyanki

# первая найденная из списка команд (на Windows это .bat и .exe)
pick() { for c in "$@"; do command -v "$c" >/dev/null 2>&1 && { echo "$c"; return 0; }; done; return 1; }

# Android SDK: указанный в окружении, иначе наш портативный
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -z "$SDK" ] && [ -d /d/Android/sdk ] && SDK=/d/Android/sdk
if [ -n "$SDK" ] && [ -d "$SDK/build-tools" ]; then
  export PATH="$(ls -d "$SDK"/build-tools/*/ | sort -V | tail -1):$SDK/platform-tools:$PATH"
  [ -z "${JAVA_HOME:-}" ] && [ -d /d/Android/jdk ] && export JAVA_HOME=/d/Android/jdk
  [ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
  JAR="$SDK/platforms/android-23/android.jar"       # компилируем против API 23 — не проскочит вызов новее Android 7
  JAR_NEW="$SDK/platforms/android-34/android.jar"   # dex-инструменту нужна свежая библиотека
else
  JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
  JAR_NEW="$JAR"
fi

AAPT=$(pick aapt aapt.exe)                || { echo "НЕТ ИНСТРУМЕНТА: aapt"; exit 1; }
ZIPALIGN=$(pick zipalign zipalign.exe)    || { echo "НЕТ ИНСТРУМЕНТА: zipalign"; exit 1; }
APKSIGNER=$(pick apksigner apksigner.bat) || { echo "НЕТ ИНСТРУМЕНТА: apksigner"; exit 1; }
DEXER=$(pick dalvik-exchange d8 d8.bat)   || { echo "НЕТ ИНСТРУМЕНТА: d8 (или dalvik-exchange)"; exit 1; }
# python проверяем делом: в Windows «python3» — пустая заглушка из Microsoft Store
PY=""
for c in python3 python py; do
  [ "$(command -v "$c" >/dev/null 2>&1 && "$c" -c 'print(42)' 2>/dev/null)" = "42" ] && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "НЕТ ИНСТРУМЕНТА: python"; exit 1; }
for t in javac keytool; do
  command -v "$t" >/dev/null || { echo "НЕТ ИНСТРУМЕНТА: $t (поставь JDK или задай JAVA_HOME)"; exit 1; }
done
[ -f "$JAR" ] || { echo "НЕТ android.jar: $JAR"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/assets"

echo "1/7 собираем файлы игры в assets"
"$PY" - <<'PY'
import re, shutil, pathlib
src = pathlib.Path('../index.html').read_text(encoding='utf-8')
# шрифты — из самого приложения: игра должна выглядеть так же и без интернета
link = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Russo+One&family=Press+Start+2P&display=swap">'
assert src.count(link) == 1, 'не найдена ссылка на шрифты Google — проверь index.html'
src = src.replace(link, '<link rel="stylesheet" href="fonts/fonts.css">')
pathlib.Path('build/assets/index.html').write_text(src, encoding='utf-8')
shutil.copytree('assets/fonts', 'build/assets/fonts')
for f in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'app.webmanifest'):
    shutil.copy('../' + f, 'build/assets/' + ('manifest.webmanifest' if f == 'app.webmanifest' else f))
PY

echo "2/7 javac"
javac --release 8 -nowarn -encoding UTF-8 -cp "$JAR" -d "$OUT/classes" $(find java -name '*.java')

echo "3/7 dex"
case "$DEXER" in
  *dalvik-exchange) "$DEXER" --dex --output="$OUT/classes.dex" "$OUT/classes" ;;
  *) "$DEXER" --min-api 24 --lib "$JAR_NEW" --output "$OUT" $(find "$OUT/classes" -name '*.class') ;;
esac

echo "4/7 aapt package"
"$AAPT" package -f \
  -M AndroidManifest.xml \
  -S res \
  -A "$OUT/assets" \
  -I "$JAR" \
  -F "$OUT/app.unaligned.apk" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0
( cd "$OUT" && "$AAPT" add -f app.unaligned.apk classes.dex >/dev/null )

echo "5/7 ключ подписи"
if [ ! -f "$KS" ]; then
  mkdir -p keystore
  head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24 > "$KS_PASS_FILE"
  keytool -genkeypair -v -keystore "$KS" -alias "$ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10950 \
    -storepass "$(cat $KS_PASS_FILE)" -keypass "$(cat $KS_PASS_FILE)" \
    -dname "CN=Okak Games, O=Okak Games, C=RU" >/dev/null 2>&1
  echo "   создан новый ключ $KS — СОХРАНИ ЕГО И ПАРОЛЬ НАВСЕГДА"
else
  echo "   используем существующий $KS"
fi

echo "6/7 zipalign + подпись"
"$ZIPALIGN" -p -f 4 "$OUT/app.unaligned.apk" "$OUT/app.aligned.apk"
"$APKSIGNER" sign --ks "$KS" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$(cat $KS_PASS_FILE)" --key-pass "pass:$(cat $KS_PASS_FILE)" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/$APK_NAME" "$OUT/app.aligned.apk"

echo "7/7 проверка"
"$APKSIGNER" verify --verbose "$OUT/$APK_NAME" | sed 's/^/   /'
"$ZIPALIGN" -c -v 4 "$OUT/$APK_NAME" >/dev/null && echo "   выравнивание: ок"
"$AAPT" dump badging "$OUT/$APK_NAME" | head -8 | sed 's/^/   /'
ls -la "$OUT/$APK_NAME"
