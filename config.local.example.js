// Copy to config.local.js (or run ./write-local-config.sh) and fill in your key.
// config.local.js is gitignored; the background loads it (via importScripts in a
// service worker, or a script tag in a background page) and uses the key whenever
// the settings panel has no OpenRouter key of its own.
self.LOCAL_OPENROUTER_API_KEY = "sk-or-v1-...";
