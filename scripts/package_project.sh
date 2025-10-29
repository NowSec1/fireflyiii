#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ARCHIVE_NAME="fireflyiii.zip"
mkdir -p "$DIST_DIR"
cd "$ROOT_DIR"
zip -r "$DIST_DIR/$ARCHIVE_NAME" . -x "dist/*" ".git/*"
echo "Created $DIST_DIR/$ARCHIVE_NAME"
