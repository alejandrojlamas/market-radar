#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
ROOT="${SCRIPT_DIR:h}"
PORT="${MARKET_RADAR_PORT:-${MERCADORADAR_PORT:-8797}}"
LOCAL_URL="http://127.0.0.1:${PORT}/"
REMOTE_URL="${MARKET_RADAR_REMOTE_URL:-${MERCADORADAR_REMOTE_URL:-}}"
SESSION="market-radar-8797"
LAUNCHER="${ROOT}/scripts/market-radar-8797"
LOG_DIR="${MARKET_RADAR_LOG_DIR:-${MERCADORADAR_LOG_DIR:-${ROOT}/logs}}"
LOG="${LOG_DIR}/market-radar-8797.log"
ERR="${LOG_DIR}/market-radar-8797.err.log"

/bin/mkdir -p "${LOG_DIR}"

echo "Market Radar"
echo "Local: ${LOCAL_URL}"
if [[ -n "${REMOTE_URL}" ]]; then
  echo "Authenticated proxy: ${REMOTE_URL}"
fi
echo

if ! /usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting Market Radar..."
  /usr/bin/screen -S "${SESSION}" -X quit >/dev/null 2>&1 || true
  : > "${LOG}"
  : > "${ERR}"
  /usr/bin/screen -dmS "${SESSION}" /bin/zsh -lc "\"${LAUNCHER}\" >>\"${LOG}\" 2>>\"${ERR}\""

  for _ in {1..40}; do
    if /usr/bin/curl -fsS "${LOCAL_URL}api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
else
  echo "Market Radar is already running."
fi

if /usr/bin/curl -fsS "${LOCAL_URL}api/health" >/dev/null 2>&1; then
  echo "Opening ${LOCAL_URL}"
  /usr/bin/open "${LOCAL_URL}"
  echo
  if [[ -n "${REMOTE_URL}" ]]; then
    echo "Authenticated proxy URL:"
    echo "${REMOTE_URL}"
    echo
  fi
  echo "Done. You can close this Terminal window."
else
  echo "Market Radar did not start at ${LOCAL_URL}."
  echo
  echo "Last log lines:"
  /usr/bin/tail -40 "${LOG}" 2>/dev/null || true
  echo
  echo "Last error lines:"
  /usr/bin/tail -40 "${ERR}" 2>/dev/null || true
  echo
  echo "Press Enter to close."
  read
  exit 1
fi
