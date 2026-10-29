#!/usr/bin/env bash
set -euo pipefail

uuid=gnome-center@sophiescodes.github.io
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

cd "$(dirname "$0")"
rm -rf "$dest"
mkdir -p "$dest"
cp -r metadata.json extension.js prefs.js stylesheet.css schemas "$dest"
glib-compile-schemas "$dest/schemas"

list=$(gsettings get org.gnome.shell enabled-extensions)
case $list in
    *"'$uuid'"*) ;;
    "@as []" | "[]") gsettings set org.gnome.shell enabled-extensions "['$uuid']" ;;
    *) gsettings set org.gnome.shell enabled-extensions "${list%]}, '$uuid']" ;;
esac

echo "Gnome Center installed to $dest"
echo "Log out and back in to load it, then press Ctrl+Super+Space."
echo "Settings are in the Extensions app."
