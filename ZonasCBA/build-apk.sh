#!/bin/sh
gradle --no-daemon assembleDebug && echo "APK: app/build/outputs/apk/debug/app-debug.apk"
