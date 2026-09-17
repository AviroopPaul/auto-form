// Copy to config.local.js (or run ./write-local-config.sh) and fill in your key.
// config.local.js is gitignored; the background loads it (via importScripts in a
// service worker, or a script tag in a background page) and uses a key whenever the
// settings panel has none of its own for the selected provider.
// Only the provider you actually select needs a key.
self.LOCAL_GEMINI_API_KEY = "AIza...";
self.LOCAL_OPENROUTER_API_KEY = "sk-or-v1-...";
