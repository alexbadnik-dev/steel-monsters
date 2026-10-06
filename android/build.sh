#!/usr/bin/env bash
# Сборка APK «Жестянки» без Android Studio и без интернета.
# Нужны пакеты Ubuntu: aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 (+ JDK).
#   sudo apt-get install -y aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
# Запуск:  ./android/build.sh
# Результат: android/build/zhestyanki-1.0.0.apk
set -e
cd "$(dirname "$0")"

JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT=build
APK_NAME=zhestyanki-1.0.0.apk
KS=keystore/zhestyanki.keystore
KS_PASS_FILE=keystore/password.txt
ALIAS=zhestyanki

for t in aapt apksigner zipalign dalvik-exchange javac keytool; do
  command -v "$t" >/dev/null || { echo "НЕТ ИНСТРУМЕНТА: $t"; exit 1; }
done
[ -f "$JAR" ] || { echo "НЕТ android.jar: $JAR"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/assets"

echo "1/7 собираем файлы игры в assets"
python3 - <<'PY'
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
javac --release 8 -nowarn -cp "$JAR" -d "$OUT/classes" $(find java -name '*.java')

echo "3/7 dex"
dalvik-exchange --dex --output="$OUT/classes.dex" "$OUT/classes"

echo "4/7 aapt package"
aapt package -f \
  -M AndroidManifest.xml \
  -S res \
  -A "$OUT/assets" \
  -I "$JAR" \
  -F "$OUT/app.unaligned.apk" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0
( cd "$OUT" && aapt add -f app.unaligned.apk classes.dex >/dev/null )

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
zipalign -p -f 4 "$OUT/app.unaligned.apk" "$OUT/app.aligned.apk"
apksigner sign --ks "$KS" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$(cat $KS_PASS_FILE)" --key-pass "pass:$(cat $KS_PASS_FILE)" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/$APK_NAME" "$OUT/app.aligned.apk"

echo "7/7 проверка"
apksigner verify --verbose "$OUT/$APK_NAME" | sed 's/^/   /'
zipalign -c -v 4 "$OUT/$APK_NAME" >/dev/null && echo "   выравнивание: ок"
aapt dump badging "$OUT/$APK_NAME" | head -8 | sed 's/^/   /'
ls -la "$OUT/$APK_NAME"
