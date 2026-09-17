// Theme preference for the extension's own pages (side panel, popup, options).
//
// Stored in localStorage rather than chrome.storage for two reasons. Every page
// the extension ships shares one origin, so localStorage is already shared
// between the panel and the options page without any messaging. And it reads
// synchronously, so the attribute below lands before first paint: chrome.storage
// resolves in a later task, which would paint the light palette first and flash
// white every time a dark panel opens.
//
// It is deliberately outside the settings object that Export/Import moves
// around. Which browser you like dark is a property of this machine, not of the
// resume profile you carry to another one.

(function () {
  const STORAGE_KEY = 'autofill:theme';
  const MODES = ['auto', 'light', 'dark'];

  const LABELS = {
    auto: 'Theme: match system',
    light: 'Theme: light',
    dark: 'Theme: dark',
  };

  // Private browsing and some hardened profiles throw on localStorage rather
  // than returning null, and a theme is never worth breaking the panel over.
  function read() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return MODES.includes(stored) ? stored : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function write(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {
      /* Session-only theming is a fine degradation. */
    }
  }

  // 'auto' leaves the attribute off entirely so the palette falls through to
  // prefers-color-scheme. An explicit choice stamps the root element, and the
  // stylesheets give that attribute the higher specificity, so the toggle wins
  // in both directions: dark on a light system, light on a dark one.
  function apply(mode) {
    const root = document.documentElement;
    if (mode === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = mode;
    }
    root.dispatchEvent(new CustomEvent('themechange', { detail: { mode } }));
  }

  function set(mode) {
    const next = MODES.includes(mode) ? mode : 'auto';
    write(next);
    apply(next);
    return next;
  }

  function cycle() {
    const current = read();
    return set(MODES[(MODES.indexOf(current) + 1) % MODES.length]);
  }

  // The panel and the options page can be open at once. The storage event fires
  // on every other page of the origin, so changing the theme in one repaints the
  // other without a reload.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) apply(read());
  });

  apply(read());

  window.AutofillTheme = { get: read, set, cycle, modes: MODES, labels: LABELS };
})();
