#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=================================="
echo "       STOCKPILOT SAFE CHECK"
echo "=================================="

echo "[1/5] Checking backend JavaScript..."
for FILE in Backend/*.js; do
    [ -f "$FILE" ] && node --check "$FILE"
done

echo "[2/5] Checking Android project files..."
for APP in UserApp DeveloperApp; do
    test -f "$APP/settings.gradle"
    test -f "$APP/build.gradle"
    test -f "$APP/app/build.gradle"
    test -f "$APP/app/src/main/AndroidManifest.xml"
    echo "$APP configuration found"
done

echo "[3/5] Checking internet permissions..."
for APP in UserApp DeveloperApp; do
    grep -q 'android.permission.INTERNET' \
      "$APP/app/src/main/AndroidManifest.xml"
    echo "$APP internet permission OK"
done

echo "[4/5] Checking Git exclusions..."
touch .gitignore
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore
grep -qxF '**/.env' .gitignore || echo '**/.env' >> .gitignore
grep -qxF 'backups/' .gitignore || echo 'backups/' >> .gitignore
grep -qxF '*.db' .gitignore || echo '*.db' >> .gitignore
grep -qxF '*.sqlite' .gitignore || echo '*.sqlite' >> .gitignore

echo "[5/5] Showing pending changes..."
git status --short

echo "=================================="
echo "SAFE CHECK COMPLETED"
echo "No files were pushed to GitHub."
echo "=================================="
