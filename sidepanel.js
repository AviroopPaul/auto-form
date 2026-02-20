const autofillButton = document.getElementById('autofill-trigger');
const statusTitle = document.getElementById('status-title');
const statusMeta = document.getElementById('status-meta');
const statusEl = document.querySelector('.status');

const resumeFileInput = document.getElementById('resume-file');
const resumeTextInput = document.getElementById('resume-text');
const parseResumeButton = document.getElementById('parse-resume');
const resumeStatus = document.getElementById('resume-status');

const fieldsContainer = document.getElementById('fields-container');
const addFieldButton = document.getElementById('add-field');

const apiKeyInput = document.getElementById('groq-api-key');
const apiStatus = document.getElementById('api-status');
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
    groqApiKey: apiKeyInput.value,
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
    apiKeyInput.value = settings.groqApiKey || settings.openaiApiKey || '';
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

async function triggerAutofill() {
  if (isRunning) return;
  isRunning = true;
  autofillButton.disabled = true;
  setStatus('running', 'Starting autofill', 'Scanning the current page');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

autofillButton.addEventListener('click', triggerAutofill);

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

loadSettings();

tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

switchView('autofill');
