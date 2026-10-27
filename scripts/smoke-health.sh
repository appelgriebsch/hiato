#!/usr/bin/env bash
# Probe a Pages deployment URL. Usage:
#   bash scripts/smoke-health.sh <base-url> <stage> <sha>
# Wait is 60s, sleeping 2s between tries. SMOKE_DEADLINE and SMOKE_SLEEP
# exist only so tests can fail fast. Deploy does not set them.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: scripts/smoke-health.sh <base-url> <stage> <sha>" >&2
  exit 1
fi

base=${1%/}
stage=$2
sha=$3
deadline_s=${SMOKE_DEADLINE:-60}
pause=${SMOKE_SLEEP:-2}
ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
hdr=$(mktemp)
body=$(mktemp)
expected="{\"ok\":true,\"stage\":\"${stage}\",\"sha\":\"${sha}\"}"

header_value() {
  awk -v name="$2" 'BEGIN { IGNORECASE = 1 }
    {
      line = $0
      sub(/\r$/, "", line)
    }
    index(tolower(line), tolower(name) ":") == 1 {
      sub(/^[^:]+:[[:space:]]*/, "", line)
      print line
    }' "$1" | tail -n 1
}

require_includes() {
  value=$(header_value "$hdr" "$1")
  case "$value" in
    *"$2"*) ;;
    *)
      echo "probe failed: $3 $1 is '$value', expected to include $2" >&2
      return 1
      ;;
  esac
}

require_body() {
  actual=$(tr -d '\r' < "$body")
  actual=${actual%$'\n'}
  if [ "$actual" != "$1" ]; then
    echo "probe failed: $2 body is '$actual'" >&2
    return 1
  fi
}

probe_ok() {
  if ! curl -fsS --max-time 30 -D "$hdr" -o "$body" -A "$ua" --globoff "${base}$1"; then
    echo "probe failed: GET $1" >&2
    return 1
  fi
}

probe_once() {
  probe_ok /api/health || return 1
  require_includes content-type application/json /api/health || return 1
  require_includes cache-control no-store /api/health || return 1
  require_includes x-content-type-options nosniff /api/health || return 1
  require_body "$expected" /api/health || return 1

  probe_ok /packs/en/a1.json || return 1
  require_includes content-type application/json /packs/en/a1.json || return 1
  require_includes cache-control 'public, max-age=0, must-revalidate' /packs/en/a1.json || return 1

  # -f is omitted: this request is supposed to be a 404.
  code=$(curl -sS --max-time 30 -D "$hdr" -o "$body" -A "$ua" --globoff -w '%{http_code}' "${base}/packs/en/nope.json" || true)
  if [ "$code" != '404' ]; then
    echo "probe failed: /packs/en/nope.json status $code" >&2
    return 1
  fi
  require_includes content-type text/plain /packs/en/nope.json || return 1
  require_includes cache-control no-store /packs/en/nope.json || return 1
  require_includes x-content-type-options nosniff /packs/en/nope.json || return 1
  require_body 'Not Found' /packs/en/nope.json || return 1

  probe_ok / || return 1
  require_includes content-type text/html / || return 1
  require_includes cache-control no-cache / || return 1

  probe_ok '/share?p=probe' || return 1
  require_includes content-type text/html '/share?p=probe' || return 1
}

# Wrangler returns before Pages serves the new deployment. Health can
# already be JSON while a missing pack is still an HTML 404. One pass
# must succeed. Wait up to 60 seconds, then fail.
deadline=$((SECONDS + deadline_s))
attempt=1
until probe_once; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "probe failed: deployment URL was not ready after ${attempt} attempts" >&2
    exit 1
  fi
  echo "deployment URL is not ready yet (attempt ${attempt}); retrying" >&2
  attempt=$((attempt + 1))
  sleep "$pause"
done
