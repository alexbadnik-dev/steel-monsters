#!/usr/bin/env bash
# Сборка архивов для площадок: Яндекс Игры и VK (Mail).
# Игра сама определяет платформу по домену; сервис-воркер на площадках не регистрируется.
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/yandex.zip dist/vk.zip
# Яндекс Игры: index.html в корне архива + иконки
zip -j dist/yandex.zip index.html icon-192.png icon-512.png icon-maskable-512.png
# VK Play / VK Mini Apps: тот же набор
cp dist/yandex.zip dist/vk.zip
echo "Готово:"
ls -la dist/
