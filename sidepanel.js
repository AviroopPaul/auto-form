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

const apiKeyInput = document.getElementById('openrouter-api-key');
const apiStatus = document.getElementById('api-status');

const transferJson = document.getElementById('transfer-json');
const exportButton = document.getElementById('export-settings');
const importButton = document.getElementById('import-settings');
const transferStatus = document.getElementById('transfer-status');
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

let autofillFields = [];
let resumeJson = '';
let saveTimer = null;
let isRunning = false;

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
  return {
    openrouterApiKey: apiKeyInput.value,
    autofillFields,
    resumeJson: resumeJson || DEFAULT_RESUME_JSON
  };
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
    apiKeyInput.value = settings.openrouterApiKey || '';
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
    apiStatus.textContent = apiKeyInput.value ? 'Saved' : 'Not saved';
    resumeStatus.textContent = 'Idle';
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
  scheduleSave(apiStatus, 'Saving key...');
});

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
  // Only adopt a key when one was really supplied, so importing an export that
  // omits it cannot wipe the key already set up in this browser.
  if (typeof incoming.openrouterApiKey === 'string' && incoming.openrouterApiKey.trim()) {
    apiKeyInput.value = incoming.openrouterApiKey.trim();
    applied.push('API key');
  }

  if (applied.length === 0) {
    transferStatus.textContent = 'No recognised settings in that JSON';
    return;
  }

  renderAutofillFields();
  scheduleSave(transferStatus, `Imported ${applied.join(', ')}...`);
}

autofillButton.addEventListener('click', triggerAutofill);

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
