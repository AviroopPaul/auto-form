// Orion exposes Firefox-shaped APIs under `browser` and Chrome-shaped ones under
// `chrome`, and provides both namespaces. Which namespace a given API actually
// lands on is not safe to assume, so look for each one across both rather than
// picking a namespace up front and then only searching that.
function pickApi(name) {
  const namespaces = [];
  if (typeof browser !== 'undefined' && browser) namespaces.push(browser);
  if (typeof chrome !== 'undefined' && chrome) namespaces.push(chrome);
  for (const ns of namespaces) {
    if (ns[name]) return ns[name];
  }
  return null;
}

const sidebarActionApi = pickApi('sidebarAction');
const sidePanelApi = pickApi('sidePanel');

// Docked-panel surfaces come in two flavours with different capability names:
// Chrome has sidePanel; Orion honours the side_panel manifest key but exposes
// Firefox's sidebarAction instead (it has no chrome.sidePanel at all). Testing
// only one of them mistook Orion's sidebar for a popup and gave it popup sizing.
const HAS_PANEL_SURFACE = !!(sidePanelApi && sidePanelApi.open) || !!sidebarActionApi;

// A popup is size-constrained and closes on blur, so it needs its own sizing and a
// hint pointing at the in-page toast rather than asking the user to keep it open.
// The fallback window in background.js says so explicitly with ?popup=1; otherwise
// having no panel surface at all (Safari) is what identifies a popup.
const IS_POPUP = new URLSearchParams(location.search).get('popup') === '1'
  || !HAS_PANEL_SURFACE;

const autofillButton = document.getElementById('autofill-trigger');
const openOptionsButton = document.getElementById('open-options');
const statusTitle = document.getElementById('status-title');
const statusMeta = document.getElementById('status-meta');
const statusEl = document.querySelector('.status');

const resumeFileInput = document.getElementById('resume-file');
const resumeTextInput = document.getElementById('resume-text');
const parseResumeButton = document.getElementById('parse-resume');
const resumeStatus = document.getElementById('resume-status');

const fieldsContainer = document.getElementById('fields-container');
const addFieldButton = document.getElementById('add-field');

const apiKeyInput = document.getElementById('api-key');
const apiStatus = document.getElementById('api-status');
const apiProviderTag = document.getElementById('api-provider-tag');
const apiKeyLink = document.getElementById('api-key-link');

const providerSelect = document.getElementById('provider-select');
const providerBlurb = document.getElementById('provider-blurb');
const modelSelect = document.getElementById('model-select');
const modelCustom = document.getElementById('model-custom');
const modelMeta = document.getElementById('model-meta');
const modelTag = document.getElementById('model-tag');
const modelFreeOnly = document.getElementById('model-free-only');
const freeOnlyLine = document.getElementById('free-only-line');
const refreshModelsButton = document.getElementById('refresh-models');
const modelStatus = document.getElementById('model-status');

const transferJson = document.getElementById('transfer-json');
const exportButton = document.getElementById('export-settings');
const importButton = document.getElementById('import-settings');
const transferStatus = document.getElementById('transfer-status');
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

let autofillFields = [];
let resumeJson = '';
let saveTimer = null;
let keyReloadTimer = null;
let isRunning = false;

// Kept alongside the controls rather than read off them at save time, so a save
// that fires before the catalogue has loaded cannot write an empty model id and
// quietly reset the choice back to the default.
let selectedProvider = '';
let selectedModel = '';
let modelCatalog = [];
let providers = [];
let modelInitialized = false;

// Both are remembered per provider so switching to Gemini and back does not lose
// the OpenRouter key, or leave an OpenRouter model id pointed at Google.
const apiKeys = {};
const modelByProvider = {};

const CUSTOM_MODEL_OPTION = '__custom__';

function providerInfo(id) {
  return providers.find(p => p.id === (id || selectedProvider)) || null;
}

const DEFAULT_RESUME = {
  name: "Aviroop Paul",
  email: "apavirooppaul10@gmail.com",
  phone: "+91-9831894596",
  website: "avirooppaul.online",
  github: "https://github.com/AviroopPaul",
  location: "Bengaluru, India",
  experience: [
    {
      company: "Think41",
      location: "Bengaluru, India",
      title: "Senior Software Development Engineer",
      startDate: "May 2025",
      endDate: "Present",
      highlights: [
        "Led a 5-member engineering team to build a full-context contract evaluation system for SpotDraft (Series A, $50M funded), enabling clause compliance detection and deviation analysis, increasing accuracy from 65% to 85% compared to previous RAG pipeline.",
        "Built and productionized a scalable LLM evaluation framework using golden datasets (1000+ data points), deployed as a GitHub Actions pipeline to run randomized evaluations on every prompt and model change, enabling continuous validation, regression detection, and high-confidence PR merges for releases.",
        "Built a scalable obligation extraction system using LangChain to parse and analyze 100+ page contracts, leveraging intelligent chunking, fault-tolerant retries, and context preservation to reliably extract contractual obligations, directly enabling new client acquisitions."
      ]
    },
    {
      company: "Think41",
      location: "Bengaluru, India",
      title: "Software Development Engineer - 1 (Founding Team)",
      startDate: "Jul 2024",
      endDate: "Apr 2025",
      highlights: [
        "Built a state-of-the-art agentic Chrome extension for Atomicwork (Series A, $25M funded), bringing AI agents directly onto the web with page-level context awareness.",
        "Enabled live voice calling (via LiveKit and Deepgram), screen sharing, and real-time agent collaboration, significantly improving IT issue resolution speed and opening new enterprise revenue opportunities."
      ]
    },
    {
      company: "Nokia",
      location: "Bengaluru, India",
      title: "Software Development Intern",
      startDate: "Sept 2023",
      endDate: "Jun 2024",
      highlights: [
        "Developed scalable Django REST APIs for multi-tenant internal platforms, automating complex clone operations and improving operational efficiency by 2x.",
        "Implemented production-grade CI/CD pipelines using Docker and Kubernetes, ensuring zero-downtime deployments and strengthening system reliability across environments."
      ]
    }
  ],
  projects: [
    {
      name: "Travel Lust",
      description: "Agentic travel assistant built with Google ADK, capable of searching flights, hotels, visa rules, and generating optimized itineraries."
    },
    {
      name: "Atlas AI",
      description: "Personal AI assistant using RAG for private document retrieval, built with FastAPI, React, ChromaDB, BackBlaze, and Supabase."
    }
  ],
  education: [
    {
      school: "Kalinga Institute of Industrial Technology (KIIT-DU)",
      location: "Bhubaneswar, India",
      degree: "B.Tech in Computer Science Engineering",
      gpa: "9.36/10",
      startDate: "2020",
      endDate: "2024"
    },
    {
      school: "Delhi Public School, Ruby Park",
      location: "Kolkata, India",
      degree: "CBSE (Science + Computer Science)",
      gpa: "94.2%",
      startDate: "2018",
      endDate: "2020"
    }
  ],
  skills: {
    languages: ["Python", "TypeScript"],
    backend_ai: ["FastAPI", "Django", "LangChain", "LiveKit", "Google ADK", "LLMs"],
    frontend: ["React.js", "Next.js"],
    data_infra: ["PostgreSQL", "MongoDB", "Firestore", "Docker", "Kubernetes", "Google Cloud Platform"]
  }
};

const DEFAULT_RESUME_JSON = JSON.stringify(DEFAULT_RESUME, null, 2);

function buildAutofillFieldsFromResume(resume) {
  if (!resume) return [];
  const fields = [];
  const nameParts = (resume.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const currentRole = resume.experience && resume.experience[0] ? resume.experience[0] : null;
  const education = resume.education && resume.education[0] ? resume.education[0] : null;

  const addField = (fieldName, value) => {
    if (!value) return;
    fields.push({ fieldName, values: [value] });
  };

  addField("Full Name", resume.name);
  addField("First Name", firstName);
  addField("Last Name", lastName);
  addField("Email", resume.email);
  addField("Phone", resume.phone);
  addField("Website", resume.website);
  addField("Portfolio", resume.website);
  addField("GitHub", resume.github);
  addField("Location", resume.location);
  if (currentRole) {
    addField("Current Company", currentRole.company);
    addField("Current Title", currentRole.title);
  }
  if (education) {
    addField("University", education.school);
    addField("Degree", education.degree);
    addField("GPA", education.gpa);
    addField("Graduation Year", education.endDate);
  }
  if (resume.skills) {
    const allSkills = [
      ...(resume.skills.languages || []),
      ...(resume.skills.backend_ai || []),
      ...(resume.skills.frontend || []),
      ...(resume.skills.data_infra || [])
    ].filter(Boolean);
    if (allSkills.length > 0) {
      addField("Skills", allSkills.join(', '));
    }
  }
  return fields;
}

function setStatus(state, title, meta) {
  statusEl.classList.remove('running', 'done', 'error');
  if (state) statusEl.classList.add(state);
  statusTitle.textContent = title || '';
  statusMeta.textContent = meta || '';
}

function switchView(viewName) {
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle('is-visible', view.dataset.view === viewName);
  });
}

function renderAutofillFields() {
  fieldsContainer.innerHTML = '';
  autofillFields.forEach((field, index) => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field-item';
    fieldDiv.innerHTML = `
      <input type="text" data-index="${index}" data-type="name" placeholder="Field name" value="${field.fieldName || ''}" />
      <textarea rows="2" data-index="${index}" data-type="values" placeholder="Values (comma-separated)">${(field.values || []).join(', ')}</textarea>
      <div class="field-actions">
        <span class="autosave">Autosave enabled</span>
        <button class="remove" data-index="${index}">Remove</button>
      </div>
    `;
    fieldsContainer.appendChild(fieldDiv);
  });
}

function getSettingsPayload() {
  if (selectedProvider) modelByProvider[selectedProvider] = selectedModel;
  return {
    provider: selectedProvider,
    models: { ...modelByProvider },
    geminiApiKey: apiKeys.gemini || '',
    openrouterApiKey: apiKeys.openrouter || '',
    autofillFields,
    resumeJson: resumeJson || DEFAULT_RESUME_JSON
  };
}

function formatContext(tokens) {
  if (!tokens) return '';
  if (tokens >= 1e6) return `${Math.round(tokens / 1e5) / 10}M`;
  if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K`;
  return String(tokens);
}

function formatPrice(perMillion) {
  if (perMillion === null || perMillion === undefined) return '?';
  if (perMillion === 0) return '$0';
  if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
  // Sub-dollar rates need a third decimal to stay distinguishable, but keep at
  // least two so a rate never renders as "$0.1" next to a "$0.037".
  return `$${perMillion.toFixed(3).replace(/(\.\d{2}\d*?)0+$/, '$1')}`;
}

function modelSummary(model) {
  let price;
  if (model.free) {
    price = 'Free';
  } else if (model.prompt === null || model.completion === null) {
    // Routers such as openrouter/auto do not publish a fixed rate.
    price = 'Variable pricing';
  } else {
    price = `${formatPrice(model.prompt)} in / ${formatPrice(model.completion)} out per 1M`;
  }
  const context = model.context ? ` · ${formatContext(model.context)} ctx` : '';
  return `${price}${context}`;
}

function renderProviderOptions() {
  providerSelect.innerHTML = '';
  providers.forEach((p) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    providerSelect.appendChild(option);
  });
  providerSelect.value = selectedProvider;
  const info = providerInfo();
  providerBlurb.textContent = info ? info.blurb : '';
  syncKeyCard();
}

// The key card lives on the Settings tab but belongs to whichever provider is
// picked on the Autofill tab, so it re-labels itself rather than showing one
// field per provider.
function syncKeyCard() {
  const info = providerInfo();
  if (!info) return;
  apiProviderTag.textContent = info.label;
  apiKeyInput.placeholder = info.keyHint;
  apiKeyInput.value = apiKeys[info.id] || '';
  apiKeyLink.href = info.keyUrl;
  apiKeyLink.textContent = `Get a ${info.label} key`;
  apiStatus.textContent = apiKeyInput.value ? 'Saved' : 'Not saved';
}

// True for an id the fetched catalogue does not contain: either one typed by hand
// or one that has since been retired upstream. Either way it stays editable as
// free text rather than silently vanishing from the dropdown.
function isCustomModel() {
  return !!selectedModel && !modelCatalog.some(m => m.id === selectedModel);
}

function renderModelOptions() {
  let list = modelFreeOnly.checked ? modelCatalog.filter(m => m.free) : modelCatalog;

  // Keep the current choice in the list even when the filter would hide it,
  // otherwise turning on "Free only" would silently reassign a paid selection.
  const current = modelCatalog.find(m => m.id === selectedModel);
  if (current && !list.includes(current)) list = [current, ...list];

  modelSelect.innerHTML = '';
  [
    { label: 'Free', items: list.filter(m => m.free) },
    { label: 'Paid', items: list.filter(m => !m.free) }
  ].forEach(({ label, items }) => {
    if (items.length === 0) return;
    const group = document.createElement('optgroup');
    group.label = label;
    items.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} — ${modelSummary(model)}`;
      group.appendChild(option);
    });
    modelSelect.appendChild(group);
  });

  const customOption = document.createElement('option');
  customOption.value = CUSTOM_MODEL_OPTION;
  customOption.textContent = 'Custom model id...';
  modelSelect.appendChild(customOption);

  syncModelControls();
}

function syncModelControls() {
  const custom = isCustomModel();
  modelSelect.value = custom ? CUSTOM_MODEL_OPTION : selectedModel;
  modelCustom.hidden = !custom;
  if (custom) modelCustom.value = selectedModel;
  describeSelectedModel();
}

function describeSelectedModel() {
  const id = selectedModel.trim();
  const known = modelCatalog.find(m => m.id === id);

  if (!id) {
    modelTag.textContent = 'Default';
    modelMeta.classList.remove('is-custom');
    modelMeta.textContent = 'No model chosen, so the built-in default is used.';
    return;
  }

  if (!known) {
    const label = providerInfo()?.label || 'the provider';
    modelTag.textContent = 'Custom';
    modelMeta.classList.add('is-custom');
    modelMeta.textContent = modelCatalog.length
      ? `Not in the fetched catalogue. It is sent to ${label} exactly as typed, so check the spelling.`
      : `Catalogue not loaded yet. It is sent to ${label} exactly as typed.`;
    return;
  }

  modelTag.textContent = known.free ? 'Free' : 'Paid';
  modelMeta.classList.remove('is-custom');
  modelMeta.textContent = `${known.name} — ${modelSummary(known)}${known.json ? '' : ' · no JSON mode'}`;
}

function loadModels({ refresh = false, provider = null, keepModel = false } = {}) {
  modelStatus.textContent = refresh ? 'Refreshing...' : 'Loading models...';
  chrome.runtime.sendMessage({ action: 'getModels', refresh, provider }, (response) => {
    if (!response) {
      modelStatus.textContent = 'Could not load models';
      return;
    }
    providers = Array.isArray(response.providers) ? response.providers : [];
    selectedProvider = response.provider || selectedProvider;
    modelCatalog = Array.isArray(response.models) ? response.models : [];

    // The background resolves the effective model (saved value, else the provider
    // default), so this is also where the control gets its value. `keepModel` is
    // for a plain refresh, which must not discard a choice just made.
    if (!modelInitialized || !keepModel) {
      modelInitialized = true;
      selectedModel = response.selected || response.defaultModel || '';
    }

    renderProviderOptions();
    renderModelOptions();

    // A free-only filter is noise where every model is free.
    freeOnlyLine.hidden = modelCatalog.every(m => m.free);

    if (!response.hasKey) {
      modelStatus.textContent = 'Add an API key on the Settings tab';
    } else if (response.stale) {
      modelStatus.textContent = response.fetchedAt
        ? `Showing the list cached ${new Date(response.fetchedAt).toLocaleDateString()}`
        : `Could not reach ${providerInfo()?.label || 'the provider'}, showing a built-in list`;
    } else {
      modelStatus.textContent = `${modelCatalog.length} models loaded`;
      setTimeout(() => {
        if (modelStatus.textContent.endsWith('models loaded')) modelStatus.textContent = 'Autosave on';
      }, 2500);
    }
  });
}

function scheduleSave(statusEl, text) {
  if (saveTimer) clearTimeout(saveTimer);
  statusEl.textContent = text || 'Saving...';
  saveTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'saveSettings', settings: getSettingsPayload() }, () => {
      statusEl.textContent = 'Saved';
      setTimeout(() => {
        statusEl.textContent = 'Autosave on';
      }, 2000);
    });
  }, 450);
}

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    const settings = (response && response.settings) ? response.settings : {};
    apiKeys.gemini = settings.geminiApiKey || '';
    apiKeys.openrouter = settings.openrouterApiKey || '';
    Object.assign(modelByProvider, settings.models || {});
    resumeJson = settings.resumeJson || DEFAULT_RESUME_JSON;
    if (settings.autofillFields && settings.autofillFields.length > 0) {
      autofillFields = settings.autofillFields;
    } else {
      try {
        const parsed = JSON.parse(resumeJson);
        autofillFields = buildAutofillFieldsFromResume(parsed);
      } catch (_) {
        autofillFields = buildAutofillFieldsFromResume(DEFAULT_RESUME);
      }
    }
    renderAutofillFields();
    resumeStatus.textContent = 'Idle';
    // Chained rather than fired in parallel: the model list depends on which
    // provider is stored and, for Gemini, on its key.
    loadModels();
  });
}

// A popup leaves the underlying page active, so the plain query is already right
// there. The guard is for the fallback window: one of our own pages can end up
// being the active tab, and filling that instead of the form would be silent and
// confusing. A tab whose URL we cannot read is not ours, so it stays eligible.
async function resolveTargetTab() {
  const ownPrefix = chrome.runtime.getURL('');
  const isOwnPage = (tab) => !!tab && typeof tab.url === 'string' && tab.url.startsWith(ownPrefix);

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && !isOwnPage(active)) return active;

  const candidates = await chrome.tabs.query({ active: true, windowType: 'normal' });
  return candidates.find(tab => !isOwnPage(tab)) || active;
}

async function triggerAutofill() {
  if (isRunning) return;
  isRunning = true;
  autofillButton.disabled = true;
  setStatus('running', 'Starting autofill', 'Scanning the current page');

  const tab = await resolveTargetTab();
  if (!tab || !tab.id) {
    setStatus('error', 'No active tab', 'Open a form page and try again');
    autofillButton.disabled = false;
    isRunning = false;
    return;
  }

  chrome.runtime.sendMessage({ action: 'trigger_autofill', tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus('error', 'Could not start', chrome.runtime.lastError.message);
    } else if (response && response.error) {
      setStatus('error', 'Could not start', response.error);
    } else {
      setStatus('running', 'Analyzing fields', 'Mapping to your resume');
    }
  });
}

function updateFieldsFromInput(target) {
  if (target.dataset.index === undefined) return;
  const index = parseInt(target.dataset.index, 10);
  if (!autofillFields[index]) return;
  if (target.dataset.type === 'name') {
    autofillFields[index].fieldName = target.value;
  } else if (target.dataset.type === 'values') {
    autofillFields[index].values = target.value.split(',').map(s => s.trim()).filter(Boolean);
  }
}

resumeFileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    resumeTextInput.value = String(reader.result || '').trim();
    resumeStatus.textContent = 'Resume loaded';
  };
  reader.onerror = () => {
    resumeStatus.textContent = 'Could not read file';
  };

  reader.readAsText(file);
});

parseResumeButton.addEventListener('click', () => {
  const resumeText = resumeTextInput.value.trim();
  if (!resumeText) {
    resumeStatus.textContent = 'Paste resume text first';
    return;
  }

  resumeStatus.textContent = 'Parsing with LLM...';
  chrome.runtime.sendMessage({ action: 'parseResume', resumeText }, (response) => {
    if (!response || response.error) {
      resumeStatus.textContent = response?.error || 'Parsing failed';
      return;
    }
    resumeJson = response.resumeJson || resumeJson;
    autofillFields = response.autofillFields || autofillFields;
    renderAutofillFields();
    scheduleSave(resumeStatus, 'Saving resume...');
  });
});

fieldsContainer.addEventListener('input', (event) => {
  updateFieldsFromInput(event.target);
  scheduleSave(resumeStatus, 'Saving fields...');
});

fieldsContainer.addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove')) return;
  const index = parseInt(event.target.dataset.index, 10);
  autofillFields.splice(index, 1);
  renderAutofillFields();
  scheduleSave(resumeStatus, 'Saving fields...');
});

addFieldButton.addEventListener('click', () => {
  autofillFields.push({ fieldName: '', values: [] });
  renderAutofillFields();
  scheduleSave(resumeStatus, 'Saving fields...');
});

apiKeyInput.addEventListener('input', () => {
  if (selectedProvider) apiKeys[selectedProvider] = apiKeyInput.value.trim();
  scheduleSave(apiStatus, 'Saving key...');
  // Gemini's catalogue is per-key, so a first key is what makes the list loadable.
  if (modelCatalog.length <= 3 && apiKeyInput.value.trim()) {
    clearTimeout(keyReloadTimer);
    keyReloadTimer = setTimeout(() => loadModels({ refresh: true, keepModel: true }), 900);
  }
});

providerSelect.addEventListener('change', () => {
  if (selectedProvider) modelByProvider[selectedProvider] = selectedModel;
  selectedProvider = providerSelect.value;
  modelCatalog = [];
  syncKeyCard();
  // Ask for the newly chosen provider explicitly: the change is not saved yet, so
  // the background would otherwise answer for the previously stored one.
  loadModels({ provider: selectedProvider });
  scheduleSave(modelStatus, 'Saving provider...');
});

modelSelect.addEventListener('change', () => {
  if (modelSelect.value === CUSTOM_MODEL_OPTION) {
    modelCustom.hidden = false;
    selectedModel = modelCustom.value.trim();
    modelCustom.focus();
  } else {
    modelCustom.hidden = true;
    selectedModel = modelSelect.value;
  }
  describeSelectedModel();
  scheduleSave(modelStatus, 'Saving model...');
});

modelCustom.addEventListener('input', () => {
  selectedModel = modelCustom.value.trim();
  describeSelectedModel();
  scheduleSave(modelStatus, 'Saving model...');
});

modelFreeOnly.addEventListener('change', renderModelOptions);

refreshModelsButton.addEventListener('click', () => loadModels({ refresh: true, keepModel: true }));

resumeTextInput.addEventListener('input', () => {
  resumeStatus.textContent = 'Ready to parse';
});

// Writing settings through chrome.storage (via the background's saveSettings) is
// the only transfer route that is guaranteed to land wherever a given browser
// actually keeps extension storage. Editing the browser's own store on disk is
// not: Orion, for one, loads sync storage into memory and never re-reads the file.
function importSettingsJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    transferStatus.textContent = 'Not valid JSON';
    return;
  }

  // Accept either a bare settings object or a whole storage dump: {"settings": {...}}.
  const incoming = (parsed && typeof parsed.settings === 'object' && parsed.settings)
    ? parsed.settings
    : parsed;
  if (!incoming || typeof incoming !== 'object') {
    transferStatus.textContent = 'Nothing to import';
    return;
  }

  const applied = [];
  if (Array.isArray(incoming.autofillFields)) {
    autofillFields = incoming.autofillFields
      .filter(field => field && typeof field.fieldName === 'string')
      .map(field => ({
        fieldName: field.fieldName,
        values: Array.isArray(field.values) ? field.values.filter(v => v !== null && v !== undefined) : []
      }));
    applied.push(`${autofillFields.length} fields`);
  }
  if (typeof incoming.resumeJson === 'string' && incoming.resumeJson.trim()) {
    resumeJson = incoming.resumeJson;
    applied.push('resume');
  }
  if (incoming.models && typeof incoming.models === 'object') {
    Object.entries(incoming.models).forEach(([id, value]) => {
      if (typeof value === 'string' && value.trim()) modelByProvider[id] = value.trim();
    });
    applied.push('models');
  } else if (typeof incoming.model === 'string' && incoming.model.trim()) {
    modelByProvider.openrouter = incoming.model.trim(); // pre-provider export
    applied.push('model');
  }
  if (typeof incoming.provider === 'string' && providers.some(p => p.id === incoming.provider)) {
    selectedProvider = incoming.provider;
    applied.push('provider');
  }
  if (applied.includes('models') || applied.includes('model') || applied.includes('provider')) {
    selectedModel = modelByProvider[selectedProvider] || selectedModel;
    loadModels({ provider: selectedProvider, keepModel: true });
  }
  // Only adopt a key when one was really supplied, so importing an export that
  // omits it cannot wipe a key already set up in this browser.
  ['geminiApiKey', 'openrouterApiKey'].forEach((field) => {
    if (typeof incoming[field] === 'string' && incoming[field].trim()) {
      apiKeys[field.replace('ApiKey', '')] = incoming[field].trim();
      applied.push(`${field.replace('ApiKey', '')} key`);
    }
  });
  syncKeyCard();

  if (applied.length === 0) {
    transferStatus.textContent = 'No recognised settings in that JSON';
    return;
  }

  renderAutofillFields();
  scheduleSave(transferStatus, `Imported ${applied.join(', ')}...`);
}

autofillButton.addEventListener('click', triggerAutofill);

// Cycles match system -> light -> dark. Three states rather than a binary switch
// because "match system" is the useful default and there is no way back to it
// once a two-way toggle has been touched. theme.js owns the storage and the root
// attribute; this only has to repaint the button.
const themeToggle = document.getElementById('theme-toggle');

function renderThemeToggle() {
  if (!themeToggle || !window.AutofillTheme) return;
  const mode = window.AutofillTheme.get();
  const label = window.AutofillTheme.labels[mode];
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = `${label} (click to change)`;
  themeToggle.querySelectorAll('[data-theme-icon]').forEach((icon) => {
    icon.hidden = icon.dataset.themeIcon !== mode;
  });
}

if (themeToggle && window.AutofillTheme) {
  themeToggle.addEventListener('click', () => {
    window.AutofillTheme.cycle();
    renderThemeToggle();
  });
  // Fires when the options page changes the theme while this panel is open.
  document.documentElement.addEventListener('themechange', renderThemeToggle);
  renderThemeToggle();
}

// A popup is a cramped place to manage nineteen fields, so offer the options page
// as the roomy version. openOptionsPage is the right call because it reuses an
// already-open options tab instead of piling up duplicates; opening the URL
// directly is only the fallback where that API is missing.
if (openOptionsButton) {
  openOptionsButton.addEventListener('click', () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    } catch (_) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
    // Get the popup out of the way now that the full page is opening. Inert in a
    // docked panel, which is the correct outcome there.
    window.close();
  });
}

exportButton.addEventListener('click', () => {
  transferJson.value = JSON.stringify({
    provider: selectedProvider,
    models: { ...modelByProvider, [selectedProvider]: selectedModel },
    autofillFields,
    resumeJson: resumeJson || DEFAULT_RESUME_JSON
  }, null, 2);
  transferStatus.textContent = `Exported ${autofillFields.length} fields, copy the text above`;
  transferJson.focus();
  transferJson.select();
});

importButton.addEventListener('click', () => {
  const raw = transferJson.value.trim();
  if (!raw) {
    transferStatus.textContent = 'Paste settings JSON first';
    return;
  }
  importSettingsJson(raw);
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.action !== 'autofill_status') return;
  const { status, text, meta } = message;
  if (status === 'running') {
    setStatus('running', text || 'Processing', meta || 'Working through fields');
  } else if (status === 'done') {
    setStatus('done', text || 'Finished', meta || 'Fields updated');
    autofillButton.disabled = false;
    isRunning = false;
  } else if (status === 'error') {
    setStatus('error', text || 'Something went wrong', meta || 'Try again');
    autofillButton.disabled = false;
    isRunning = false;
  }
});

if (IS_POPUP) {
  document.body.classList.add('is-popup');
  const hint = document.getElementById('panel-hint');
  if (hint) {
    hint.textContent = 'Progress shows on the page itself, so you can close this.';
  }
}

loadSettings();

tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

switchView('autofill');
