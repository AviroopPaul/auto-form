// content.js
console.log("Intelligent Autofill Extension: Content script loaded.");

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

  return {
    label: finalLabel,
    name: element.name,
    id: element.id,
    placeholder: element.placeholder,
    type: element.type || element.tagName.toLowerCase(),
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
  const inputs = getAllInputs().filter(isVisible);
  console.log(`Found ${inputs.length} visible fields to analyze...`);

  const fieldContexts = inputs.map((input, index) => {
    const htmlContext = getHtmlContext(input);
    return { fieldId: `f_${index}`, ...htmlContext };
  });

  chrome.runtime.sendMessage({ action: "deduceFormFields", fields: fieldContexts }, (response) => {
    if (!response || response.error) {
      console.warn("Autofill batch response error:", response && response.error);
      return;
    }

    const values = response.values || {};

    fieldContexts.forEach((ctx, index) => {
      const input = inputs[index];
      if (!input) return;
      const rawValue = values[ctx.fieldId];
      if (rawValue === null || rawValue === undefined || rawValue === "") return;

      const suggestion = typeof rawValue === "string" ? rawValue : String(rawValue);
      if (suggestion.startsWith("No saved values")) return;

      console.log(`Autofilling ${ctx.label || ctx.name || 'unknown'} with ${suggestion}`);

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
    });
  });
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
