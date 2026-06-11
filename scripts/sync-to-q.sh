#!/usr/bin/env bash
#
# sync-to-q.sh — build the blocks-author image locally and deploy it as a brick
# into an App Lab app on the Arduino UNO Q.
#
# App Lab (and its arduino-app-cli daemon + Docker) run ON THE BOARD, not on this
# Mac. But the Mac (Apple Silicon) and the Q are both arm64, and the image is pure
# Node + JS bundles (no per-arch native code), so a local `docker build` already
# produces the correct linux/arm64 image. We therefore just SHIP it:
# `docker save | ssh docker load` — no registry, no build/pull on the Q.
#
# Flow:
#   1. docker build -t $IMAGE .                  (on this Mac)
#   2. docker save $IMAGE | gzip | ssh Q 'gunzip | docker load'
#   3. place brick_config.yaml + a DERIVED dev brick_compose.yaml (image line
#      swapped to the local tag) into ~/ArduinoApps/$APP/bricks/blocks-author/
#   4. ensure the app's app.yaml lists the brick (non-destructive)
#
# Config (env vars):
#   Q_HOST    board host  (default: linucs.local)
#   Q_USER    board user  (default: arduino)
#   APP       app name    (default: mock-app)
#   IMAGE     image tag   (default: blocks-author:dev)
#   NO_BUILD=1  re-ship the existing image without rebuilding
#   NO_SHIP=1   skip build+ship entirely; only re-sync brick files (config/compose
#               changes when the image is unchanged)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
Q_HOST="${Q_HOST:-linucs.local}"
Q_USER="${Q_USER:-arduino}"
APP="${APP:-mock-app}"
IMAGE="${IMAGE:-blocks-author:dev}"
BRICK_ID="blocks-author"
Q="${Q_USER}@${Q_HOST}"
APP_DIR="ArduinoApps/$APP"           # relative to the Q user's home
BRICK_DIR="$APP_DIR/bricks/$BRICK_ID"

echo "▶ repo:  $REPO_ROOT"
echo "▶ Q:     $Q"
echo "▶ app:   ~/$APP_DIR"
echo "▶ image: $IMAGE"
echo

# 0. Sanity: Q reachable + docker present + app folder exists.
ssh -o BatchMode=yes -o ConnectTimeout=8 "$Q" "command -v docker >/dev/null && test -d '$APP_DIR'" \
  || { echo "✗ cannot ssh $Q, docker missing, or ~/$APP_DIR absent"; exit 1; }

if [[ "${NO_SHIP:-}" == "1" ]]; then
  echo "⏭  NO_SHIP=1 — skipping build + image ship (re-syncing brick files only)"
else
  # 1. Build (defaults to linux/arm64 on Apple Silicon).
  if [[ "${NO_BUILD:-}" == "1" ]]; then
    echo "⏭  NO_BUILD=1 — skipping docker build"
  else
    echo "▶ Building $IMAGE …"
    docker build -t "$IMAGE" "$REPO_ROOT"
  fi
  arch="$(docker image inspect "$IMAGE" --format '{{.Architecture}}')"
  [[ "$arch" == "arm64" ]] || { echo "✗ image arch '$arch' != arm64 (Q is aarch64)"; exit 1; }
  echo

  # 2. Ship the image (gzip over ssh; no registry on the Q).
  echo "▶ Shipping image to $Q …"
  docker save "$IMAGE" | gzip | ssh "$Q" 'gunzip | docker load'
  echo
fi

# 3. Place brick files: config verbatim, compose derived (image line swapped).
echo "▶ Installing brick into ~/$BRICK_DIR"
ssh "$Q" "mkdir -p '$BRICK_DIR'"
scp -q "$REPO_ROOT/brick/brick_config.yaml" "$Q:$BRICK_DIR/brick_config.yaml"
sed -E "s|^([[:space:]]*)image:.*|\1image: $IMAGE|" "$REPO_ROOT/brick/brick_compose.yaml" \
  | ssh "$Q" "cat > '$BRICK_DIR/brick_compose.yaml'"

# 4. Ensure app.yaml lists the brick. Non-destructive: only rewrite an empty
#    `bricks: []`; otherwise leave the user's list alone and warn.
echo "▶ Ensuring ~/$APP_DIR/app.yaml lists '$BRICK_ID'"
ssh "$Q" "cd '$APP_DIR' && \
  if grep -q '$BRICK_ID' app.yaml; then echo '  already listed'; \
  elif grep -Eq '^bricks:[[:space:]]*\[[[:space:]]*\][[:space:]]*\$' app.yaml; then \
    perl -0pi -e 's/^bricks:[ \t]*\[[ \t]*\][ \t]*\$/bricks:\n  - $BRICK_ID:\n      variables: {}/m' app.yaml; \
    echo '  added (replaced empty bricks: [])'; \
  else echo '  ⚠ non-empty bricks: — add \"- $BRICK_ID: {variables: {}}\" manually'; fi"

echo
echo "✅ Deployed to $Q."
echo "Next: open App Lab and start app '$APP' — it discovers port 7100, polls"
echo "/health, and embeds the editor. Re-run this script after code changes."
