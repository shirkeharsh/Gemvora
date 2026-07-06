#!/bin/zsh

# exit on error
set -e

echo "==========================================="
echo "🤖 Gemvora Android Compiler & Uploader"
echo "==========================================="

# 1. Compile the production web bundle
echo "📦 1. Compiling web asset bundle..."
npm run build

# 2. Sync with Capacitor Android native folder
echo "🔄 2. Syncing web assets with Capacitor Android native container..."
npx cap sync

# 3. Compile Android APK using Gradle wrapper
echo "🔨 3. Compiling Android application via Gradle..."
export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
cd android
chmod +x gradlew
./gradlew clean assembleRelease
cd ..

# 4. Find the compiled release APK
APK_PATH="android/app/build/outputs/apk/release/app-release-unsigned.apk"
if [ ! -f "$APK_PATH" ]; then
  # check alternate release paths
  FOUND_APK=$(find android/app/build/outputs/apk/release -name "*.apk" | head -n 1)
  if [ -n "$FOUND_APK" ]; then
    APK_PATH="$FOUND_APK"
  else
    # Fallback to compiling debug build if release signing is not configured
    echo "⚠️  Release APK not found. Compiling debug version..."
    export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
    cd android
    ./gradlew clean assembleDebug
    cd ..
    APK_PATH=$(find android/app/build/outputs/apk/debug -name "*.apk" | head -n 1)
  fi
fi

# 5. Copy APK directly to Desktop
echo "🖥️  4. Copying Android APK to macOS Desktop..."
DESKTOP_PATH="$HOME/Desktop"
rm -f "$DESKTOP_PATH/Gemvora-release.apk"
cp "$APK_PATH" "$DESKTOP_PATH/Gemvora-release.apk"
echo "✅ Saved to Desktop: $DESKTOP_PATH/Gemvora-release.apk"

# 6. Upload to Discord Webhook
WEBHOOK_URL=""
if [ -f .webhook_url ]; then
  WEBHOOK_URL=$(cat .webhook_url)
fi

if [ -n "$WEBHOOK_URL" ]; then
  echo "🚀 5. Sending compiled Android APK to Discord..."
  curl -X POST -H "Content-Type: multipart/form-data" \
    -F "file=@$DESKTOP_PATH/Gemvora-release.apk" \
    -F "payload_json={\"content\": \"✅ **NEW ANDROID BUILD**: The latest compiled Android APK has been successfully built and pushed to Desktop.\"}" \
    "$WEBHOOK_URL"
  echo "✅ Discord upload complete!"
else
  echo "ℹ️  No Discord Webhook URL found in .webhook_url. Skipping Discord upload."
fi

echo "==========================================="
echo "🎉 Android APK compilation process finished successfully!"
echo "==========================================="
