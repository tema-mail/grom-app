#!/bin/bash
# Собрать и поставить в ~/Applications. Автозапуска нет: открывают значком в Dock.
# Удалить: scripts/install.sh --remove
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/config.sh

DEST="$HOME/Applications/$APP_NAME.app"
WAIT_STEPS=50   # по 0,1 с: ждём до 5 секунд
OPEN_TRIES=5

running() { pgrep -x "$APP_NAME" >/dev/null; }

stop() {
  pkill -x "$APP_NAME" 2>/dev/null || true
  local i
  for ((i = 0; i < WAIT_STEPS; i++)); do
    running || return 0
    sleep 0.1
  done
  echo "Старый экземпляр не завершился" >&2
  exit 1
}

if [ "${1:-}" = "--remove" ]; then
  stop
  rm -rf "$DEST"
  echo "Убрано: $DEST"
  exit 0
fi

scripts/build.sh
stop

mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "build/$APP_NAME.app" "$DEST"
for ((i = 0; i < OPEN_TRIES; i++)); do
  if open "$DEST" 2>/dev/null; then break; fi
  sleep 1
done

for ((i = 0; i < WAIT_STEPS; i++)); do
  if running; then
    echo "Установлено и открыто: $DEST"
    exit 0
  fi
  sleep 0.1
done
echo "Приложение скопировано, но не запустилось: $DEST" >&2
exit 1
