#!/bin/bash
# Deploy Data Analyzer plugin to brain-onlyoffice container
# Usage: ./deploy.sh

set -e

CONTAINER="brain-onlyoffice"
PLUGIN_DIR="/var/www/onlyoffice/documentserver/sdkjs-plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C8}"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Data Analyzer Deploy ==="
echo "Local:  $LOCAL_DIR"
echo "Remote: $CONTAINER:$PLUGIN_DIR"
echo ""

# 1. Copy all plugin files
echo "[1/4] Copying files..."
for f in config.json bg.html bg3.html background.html filters.html import.html settings.html index.html; do
    if [ -f "$LOCAL_DIR/$f" ]; then
        docker cp "$LOCAL_DIR/$f" "$CONTAINER:$PLUGIN_DIR/$f"
        echo "  ✓ $f"
    fi
done

# Copy all scripts
for f in "$LOCAL_DIR"/scripts/*.js; do
    if [ -f "$f" ]; then
        fname=$(basename "$f")
        docker cp "$f" "$CONTAINER:$PLUGIN_DIR/scripts/$fname"
        echo "  ✓ scripts/$fname"
    fi
done

# 2. Remove stale .gz files
echo ""
echo "[2/4] Removing .gz cache files..."
docker exec "$CONTAINER" bash -c "rm -f $PLUGIN_DIR/scripts/*.gz $PLUGIN_DIR/*.gz" 2>/dev/null
echo "  ✓ cleaned"

# 3. Restart services
echo ""
echo "[3/4] Restarting services..."
docker exec "$CONTAINER" supervisorctl restart ds:docservice >/dev/null 2>&1
sleep 3

# 4. Verify
echo ""
echo "[4/4] Verifying deployment..."
VERSION=$(curl -s "http://localhost:8088/9.3.0-e4f2f2b59f589e79bc87b42609446eed/sdkjs-plugins/%7BB1AACC00-EC30-4DA4-A400-AAAAAA1110C8%7D/scripts/background.js" | grep "var VERSION" | head -1)
CACHE=$(curl -sI "http://localhost:8088/9.3.0-e4f2f2b59f589e79bc87b42609446eed/sdkjs-plugins/%7BB1AACC00-EC30-4DA4-A400-AAAAAA1110C8%7D/scripts/background.js" | grep -i "cache-control")

echo "  Server serves: $VERSION"
echo "  Headers: $CACHE"
echo ""
echo "=== Deploy complete ==="
echo ""
echo "TIP: En el navegador, abre DevTools > Network > marca 'Disable cache'"
echo "     Luego haz Ctrl+Shift+R (hard reload)"
