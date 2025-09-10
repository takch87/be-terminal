#!/bin/bash
# Be Seamless v2.0.0 - Installation Script
# Fecha: 10 de Septiembre, 2025

echo "🚀 Be Seamless v2.0.0 - APK Installation"
echo "========================================"
echo

APK_FILE="be-seamless-v2.0.0-debug.apk"
APK_PATH="releases/${APK_FILE}"

# Verificar que el APK existe
if [ ! -f "$APK_PATH" ]; then
    echo "❌ Error: APK no encontrado en $APK_PATH"
    exit 1
fi

echo "📱 APK Information:"
echo "   File: $APK_FILE"
echo "   Size: $(du -h "$APK_PATH" | cut -f1)"
echo "   Version: 2.0.0-seamless (Build 22)"
echo "   App Name: Be Seamless - Sistema de Pagos Automático"
echo

# Verificar si adb está disponible
if command -v adb &> /dev/null; then
    echo "🔧 ADB detected. Options:"
    echo "   1) Install via ADB (if device connected)"
    echo "   2) Copy to device manually"
    echo "   3) Show file location only"
    echo
    read -p "Select option (1-3): " choice
    
    case $choice in
        1)
            echo "📲 Installing via ADB..."
            adb devices
            echo
            read -p "Proceed with installation? (y/n): " confirm
            if [ "$confirm" = "y" ]; then
                adb install -r "$APK_PATH"
                if [ $? -eq 0 ]; then
                    echo "✅ Installation successful!"
                    echo "📱 Look for 'Be Seamless' in your app launcher"
                else
                    echo "❌ Installation failed. Try manual installation."
                fi
            fi
            ;;
        2)
            echo "📁 Manual Installation:"
            echo "   1) Transfer this file to your Android device:"
            echo "      $(realpath "$APK_PATH")"
            echo "   2) Enable 'Unknown Sources' in Android settings"
            echo "   3) Open the APK file on your device"
            echo "   4) Follow installation prompts"
            ;;
        3)
            echo "📁 APK Location:"
            echo "   $(realpath "$APK_PATH")"
            ;;
    esac
else
    echo "📁 Manual Installation Required:"
    echo "   1) Transfer this file to your Android device:"
    echo "      $(realpath "$APK_PATH")"
    echo "   2) Enable 'Unknown Sources' in Android settings"
    echo "   3) Open the APK file on your device"
    echo "   4) Follow installation prompts"
fi

echo
echo "📋 Features in this version:"
echo "   ✅ New name: Be Seamless"
echo "   ✅ Logo removed for clean interface"
echo "   ✅ Secure credentials (no password storage)"
echo "   ✅ Automatic payment flow integration"
echo "   ✅ Production backend connection"
echo
echo "📚 Documentation: releases/RELEASE_NOTES_v2.0.0.md"
echo
echo "🎉 Ready to use Be Seamless!"
