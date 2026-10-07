#!/usr/bin/env bash
# Сборка архивов для площадок: Яндекс Игры и VK (Mail).
# Игра сама определяет платформу по домену; сервис-воркер на площадках не регистрируется.
# Архив собирается питоном, а не утилитой zip: её нет ни в Git Bash на Windows,
# ни в части контейнеров, а python есть везде.
set -e
cd "$(dirname "$0")"

# python проверяем делом: в Windows «python3» — пустая заглушка из Microsoft Store
PY=""
for c in python3 python py; do
  [ "$(command -v "$c" >/dev/null 2>&1 && "$c" -c 'print(42)' 2>/dev/null)" = "42" ] && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "НЕТ ИНСТРУМЕНТА: python"; exit 1; }

mkdir -p dist
rm -f dist/yandex.zip dist/vk.zip

# Яндекс Игры: index.html в корне архива + иконки. VK Play / VK Mini Apps: тот же набор.
"$PY" - <<'PY'
import zipfile, shutil, pathlib
files = ['index.html', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
with zipfile.ZipFile('dist/yandex.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, pathlib.Path(f).name)   # без папок: площадки ждут index.html в корне
shutil.copy('dist/yandex.zip', 'dist/vk.zip')
PY

echo "Готово:"
ls -la dist/
