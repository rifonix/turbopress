#!/bin/bash
# Build wp-instant.zip — WordPress plugin install artifact.
# Top-level directory MUST be `wp-instant/` (that becomes the plugin slug).
set -euo pipefail
cd "$(dirname "$0")"

TMPROOT="$(mktemp -d)"
STAGE="$TMPROOT/wp-instant"
mkdir -p "$STAGE"

# Copy plugin files, excluding dev/build junk
rsync -a \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  --exclude='*.zip' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='build-zip.sh' \
  --exclude='tests' \
  ./ "$STAGE/"

VERSION="$(perl -ne 'print $1 if /Version:\s*([0-9.]+)/' wp-instant.php | head -1)"
OUT="wp-instant${VERSION:+-$VERSION}.zip"

(cd "$TMPROOT" && zip -rq "$OLDPWD/$OUT" wp-instant)
rm -rf "$TMPROOT"
echo "Built $OUT"
