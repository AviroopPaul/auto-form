// content.js
// Guard against this script being evaluated more than once in the same frame
// (e.g. the manifest content-script registration plus an on-demand injection).
// Without this, each copy keeps its own overlay + trigger listener, which is
// what makes two toasts stack and one of them linger on the page.
if (window.__autofillExtensionLoaded) {
  console.log("Intelligent Autofill Extension: content script already loaded in this frame, skipping re-init.");
} else {
  window.__autofillExtensionLoaded = true;
  initAutofillExtension();
}

function initAutofillExtension() {
console.log("Intelligent Autofill Extension: Content script loaded.");

// Only the top-level frame renders the toast. Child frames (iframes) still
// participate in scanning/filling but must never paint their own overlay —
// otherwise multiple toasts overlap.
const IS_TOP_FRAME = (() => {
  try { return window.top === window.self; } catch (_) { return true; }
})();

let isAutofillRunning = false;
let overlayEl = null;
let overlayTimeout = null;

function sendAutofillStatus(status, text, meta) {
  try {
    chrome.runtime.sendMessage({ action: "autofill_status", status, text, meta });
  } catch (_) {}
}

function showProcessingOverlay(state, title, detail) {
  if (!IS_TOP_FRAME) return;

  // Cancel any pending auto-dismiss so an in-flight "done"/"error" timer can't
  // remove the overlay we're about to update.
  if (overlayTimeout) {
    clearTimeout(overlayTimeout);
    overlayTimeout = null;
  }

  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'autofill-extension-processing';
    overlayEl.innerHTML = `
      <div class="autofill-processing-title"></div>
      <div class="autofill-processing-detail"></div>
    `;
    (document.body || document.documentElement).appendChild(overlayEl);
  }

  overlayEl.dataset.state = state;
  const titleEl = overlayEl.querySelector('.autofill-processing-title');
  const detailEl = overlayEl.querySelector('.autofill-processing-detail');
  if (titleEl) titleEl.textContent = title || '';
  if (detailEl) detailEl.textContent = detail || '';
}

function hideProcessingOverlay(delay = 2000) {
  if (!IS_TOP_FRAME || !overlayEl) return;
  if (overlayTimeout) clearTimeout(overlayTimeout);
  overlayTimeout = window.setTimeout(() => {
    const el = overlayEl;
    overlayEl = null;
    overlayTimeout = null;
    if (!el) return;
    // Fade out, then remove once the transition has had time to run.
    el.classList.add('is-hiding');
    window.setTimeout(() => el.remove(), 320);
  }, delay);
}

function isInVisibleModal(element) {
  const modalContainer = element.closest('[role="dialog"], [role="alertdialog"], dialog, .jobs-easy-apply-form-section__grouping, .artdeco-modal, .scaffold-layout__modal, [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="artdeco"]');
  if (!modalContainer) return false;
  const containerRect = modalContainer.getBoundingClientRect();
  const containerStyle = window.getComputedStyle(modalContainer);
  return containerRect.width > 0 && containerRect.height > 0 &&
    containerStyle.display !== 'none' && containerStyle.visibility !== 'hidden';
}

function isVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return isInVisibleModal(element);
  }
  if (rect.width === 0 && rect.height === 0) {
    return isInVisibleModal(element);
  }

  return true;
}

function getCurrentValue(element) {
  if (!element) return '';
  const tag = element.tagName;
  if (tag === 'SELECT') {
    const opt = element.options[element.selectedIndex];
    if (!opt) return '';
    // A placeholder-style first option ("Select...", "", value="") doesn't count as filled.
    if (element.selectedIndex === 0 && (!opt.value || /^(select|choose|please)/i.test(opt.text.trim()))) {
      return '';
    }
    return (opt.text || opt.value || '').trim();
  }
  if (element.type === 'checkbox') {
    return element.checked ? 'checked' : '';
  }
  if (element.type === 'radio') {
    // Report the checked option's value within this radio group, if any.
    if (element.checked) return (element.value || 'checked').trim();
    const root = element.getRootNode();
    if (element.name && root.querySelectorAll) {
      const checked = root.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
      if (checked) return (checked.value || 'checked').trim();
    }
    return '';
  }
  return (element.value || '').trim();
}

function isFieldEmpty(element) {
  return getCurrentValue(element) === '';
}

// Build a condensed snapshot of the page so the LLM can understand WHO/WHAT the
// form is about (e.g. a page that displays "Name: Alex Jones" elsewhere).
function getPageContext() {
  let pageText = '';
  try {
    pageText = (document.body.innerText || '')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, 4000);
  } catch (_) {}
  return {
    title: (document.title || '').slice(0, 200),
    url: (location.href || '').slice(0, 300),
    pageText
  };
}

function getHtmlContext(element) {
  // Get label text
  let label = '';
  
  // 1. Standard labels
  if (element.labels && element.labels.length > 0) {
    label = element.labels[0].textContent.trim();
  } 
  
  // 2. Search for label by id/for relationship if labels collection is empty
  if (!label && element.id) {
    const root = element.getRootNode();
    const l = root.querySelector ? root.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
    if (l) label = l.textContent.trim();
  }

  // 3. Search for label-like elements in containers (Common in modern frameworks)
  if (!label) {
    let container = element.closest('div[role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot, .Qr7Oae, .jobs-easy-apply-form-section__grouping, .fb-dash-form-element');
    if (container) {
      const labelElement = container.querySelector('.freebirdFormviewerComponentsQuestionBaseHeaderTitle, .M7eMe, label, .fb-dash-form-element__label');
      if (labelElement) {
        label = labelElement.textContent.trim();
      }
    }
  }

  // 4. Previous siblings or parent's previous siblings
  if (!label) {
    let prev = element.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.classList.contains('label')) {
        label = prev.textContent.trim();
        break;
      }
      prev = prev.previousElementSibling;
    }
  }

  // 5. Parent text (if it's short, it might be a label)
  if (!label && element.parentElement) {
    const parentText = element.parentElement.innerText.split('\n')[0].trim();
    if (parentText && parentText.length < 100) {
      label = parentText;
    }
  }

  // 6. Aria labels
  if (!label && element.getAttribute('aria-label')) {
    label = element.getAttribute('aria-label');
  }
  if (!label && element.getAttribute('aria-labelledby')) {
    const root = element.getRootNode();
    const labelledBy = root.getElementById ? root.getElementById(element.getAttribute('aria-labelledby')) : null;
    if (labelledBy) label = labelledBy.textContent.trim();
  }

  // 7. Group context (for radio/checkbox)
  let groupContext = '';
  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) {
      groupContext = legend.textContent.trim();
    }
  }

  // Clean up label (remove required asterisks etc)
  if (label) {
    label = label.replace(/\s*\*$/, '').trim();
  }

  let finalLabel = label;
  if (groupContext && groupContext !== label) {
    finalLabel = groupContext ? `${groupContext} - ${label}` : label;
  }

  let htmlSnippet = element.outerHTML;
  if (element.tagName === 'SELECT') {
    // For selects, outerHTML can be huge. Just send the tag and option texts.
    const options = Array.from(element.options).slice(0, 50).map(o => o.text).join(', ');
    htmlSnippet = `<select name="${element.name}">${options}${element.options.length > 50 ? '...' : ''}</select>`;
  }

  const currentValue = getCurrentValue(element);

  return {
    label: finalLabel,
    name: element.name,
    id: element.id,
    placeholder: element.placeholder,
    type: element.type || element.tagName.toLowerCase(),
    currentValue,
    isEmpty: currentValue === '',
    html: htmlSnippet,
    attributes: Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-') || attr.name === 'aria-label' || attr.name === 'role')
      .reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {})
  };
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "autofill_all_fields") {
    autofillAll();
  }
});

// Listen for custom event (more reliable for scripting.executeScript across frames)
document.addEventListener("autofill-extension-trigger", () => autofillAll());

function getAllInputs(root = document) {
  let inputs = Array.from(root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
  
  // Handle Shadow DOM
  const allElements = root.querySelectorAll('*');
  allElements.forEach(el => {
    if (el.shadowRoot) {
      inputs = inputs.concat(getAllInputs(el.shadowRoot));
    }
  });

  // Same-origin iframes (modal forms often live here, e.g. LinkedIn Easy Apply)
  const iframes = root.querySelectorAll ? root.querySelectorAll('iframe') : [];
  iframes.forEach(iframe => {
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (doc) {
        inputs = inputs.concat(getAllInputs(doc));
      }
    } catch (_) {
      /* cross-origin - skip */
    }
  });
  
  return inputs;
}

async function autofillAll() {
  if (isAutofillRunning) return;
  isAutofillRunning = true;

  const inputs = getAllInputs().filter(isVisible);
  console.log(`Found ${inputs.length} visible fields to analyze...`);

  const fieldContexts = inputs.map((input, index) => {
    const htmlContext = getHtmlContext(input);
    return { fieldId: `f_${index}`, ...htmlContext };
  });

  const emptyCount = fieldContexts.filter(f => f.isEmpty).length;
  const filledCountInitial = fieldContexts.length - emptyCount;
  sendAutofillStatus('running', 'Understanding page', `${emptyCount} empty · ${filledCountInitial} already filled`);
  showProcessingOverlay('running', 'Understanding page', `${emptyCount} empty · ${filledCountInitial} already filled`);

  if (inputs.length === 0) {
    sendAutofillStatus('done', 'No fields found', 'Try another form');
    showProcessingOverlay('done', 'No fields found', 'Try another form');
    hideProcessingOverlay();
    isAutofillRunning = false;
    return;
  }

  if (emptyCount === 0) {
    sendAutofillStatus('done', 'Nothing to fill', 'All fields already have values');
    showProcessingOverlay('done', 'Nothing to fill', 'All fields already have values');
    hideProcessingOverlay();
    isAutofillRunning = false;
    return;
  }

  const pageContext = getPageContext();

  // Watchdog: if the background service worker never answers (it can be torn
  // down mid-request), force the overlay out of "running" instead of leaving
  // it stuck on the page.
  let settled = false;
  const watchdog = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    sendAutofillStatus('error', 'Autofill timed out', 'No response — try again');
    showProcessingOverlay('error', 'Autofill timed out', 'No response — try again');
    hideProcessingOverlay();
    isAutofillRunning = false;
  }, 30000);

  chrome.runtime.sendMessage({ action: "deduceFormFields", fields: fieldContexts, pageContext }, (response) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);

    if (chrome.runtime.lastError || !response || response.error) {
      const errMsg = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
      console.warn("Autofill batch response error:", errMsg);
      sendAutofillStatus('error', 'Autofill failed', errMsg);
      showProcessingOverlay('error', 'Autofill failed', errMsg);
      hideProcessingOverlay();
      isAutofillRunning = false;
      return;
    }

    const values = response.values || {};
    let filledCount = 0;

    let skippedFilled = 0;
    fieldContexts.forEach((ctx, index) => {
      const input = inputs[index];
      if (!input) return;
      const rawValue = values[ctx.fieldId];
      if (rawValue === null || rawValue === undefined || rawValue === "") return;

      // Never overwrite a field that already has a value. Re-check live (the DOM
      // may have changed) instead of trusting only the snapshot we sent.
      if (!isFieldEmpty(input)) {
        skippedFilled += 1;
        console.log(`Skipping ${ctx.label || ctx.name || 'unknown'} — already filled`);
        return;
      }

      const suggestion = typeof rawValue === "string" ? rawValue : String(rawValue);
      if (suggestion.startsWith("No saved values")) return;

      console.log(`Autofilling ${ctx.label || ctx.name || 'unknown'} with ${suggestion}`);
      filledCount += 1;

      if (input.tagName === 'SELECT') {
        autofillSelect(input, suggestion);
      } else if (input.type === 'checkbox') {
        const shouldCheck = ['true', 'yes', '1', 'check'].includes(suggestion.toLowerCase());
        input.checked = shouldCheck;
      } else if (input.type === 'radio') {
        if (input.value.toLowerCase() === suggestion.toLowerCase() ||
            (ctx.label || '').toLowerCase().includes(suggestion.toLowerCase())) {
          input.checked = true;
        }
      } else {
        input.value = suggestion;
      }

      // Trigger events to notify the page of the change
      const events = ['input', 'change', 'blur'];
      events.forEach(eventName => {
        const event = new Event(eventName, { bubbles: true });
        input.dispatchEvent(event);
      });

      // Slick glow so the user can see exactly what we filled, cascading down
      // the form as each field lands.
      highlightFilledField(input, (filledCount - 1) * 90);
    });

    const summary = skippedFilled > 0
      ? `${filledCount} filled · ${skippedFilled} kept (already had values)`
      : `${filledCount} of ${emptyCount} empty fields filled`;
    sendAutofillStatus('done', 'Autofill complete', summary);
    showProcessingOverlay('done', 'Autofill complete', summary);
    hideProcessingOverlay();
    isAutofillRunning = false;
  });
}

// Play a glow animation on a field we just filled. For tiny controls
// (checkbox/radio) highlight the surrounding label/container instead so the
// ring is actually visible.
function highlightFilledField(element, delay = 0) {
  let target = element;
  if (element.type === 'checkbox' || element.type === 'radio') {
    target = element.closest('label, .field-item, [role="listitem"]') || element.parentElement || element;
  }
  if (!target) return;

  window.setTimeout(() => {
    target.classList.remove('autofill-extension-filled');
    // Force reflow so the animation can restart if the class was just present.
    void target.offsetWidth;
    target.classList.add('autofill-extension-filled');
    const cleanup = () => {
      target.classList.remove('autofill-extension-filled');
      target.removeEventListener('animationend', cleanup);
    };
    target.addEventListener('animationend', cleanup);
  }, delay);
}

function autofillSelect(select, value) {
  const options = Array.from(select.options);
  // Try exact match first
  let optionToSelect = options.find(opt => opt.value === value || opt.text.trim() === value);
  
  // Try case-insensitive partial match if no exact match
  if (!optionToSelect) {
    const lowerValue = value.toLowerCase();
    optionToSelect = options.find(opt => 
      opt.value.toLowerCase().includes(lowerValue) || 
      opt.text.toLowerCase().includes(lowerValue)
    );
  }

  if (optionToSelect) {
    select.value = optionToSelect.value;
  }
}

// Expose for scripting.executeScript to call (runs in all frames)
try {
  window.__autofillExtension = { autofillAll };
} catch (_) {}

} // end initAutofillExtension
