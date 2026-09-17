// options.js
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const apiKeyStatus = document.getElementById('api-key-status');
    const apiProviderTag = document.getElementById('api-provider-tag');
    const apiKeyLink = document.getElementById('api-key-link');
    const providerSelect = document.getElementById('provider-select');
    const providerBlurb = document.getElementById('provider-blurb');
    const freeOnlyLine = document.getElementById('free-only-line');

    const fieldsContainer = document.getElementById('fields-container');
    const addFieldButton = document.getElementById('add-field');
    const saveAutofillFieldsButton = document.getElementById('save-autofill-fields');
    const autofillFieldsStatus = document.getElementById('autofill-fields-status');
    const resumeJsonInput = document.getElementById('resume-json');

    const modelSelect = document.getElementById('model-select');
    const modelCustom = document.getElementById('model-custom');
    const modelMeta = document.getElementById('model-meta');
    const modelFreeOnly = document.getElementById('model-free-only');
    const refreshModelsButton = document.getElementById('refresh-models');
    const saveModelButton = document.getElementById('save-model');
    const modelStatus = document.getElementById('model-status');

    // theme.js owns the stored value and the root attribute; the picker only has
    // to stay in step with it. The themechange listener matters because the side
    // panel can be open alongside this page and change the theme from there.
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect && window.AutofillTheme) {
        themeSelect.value = window.AutofillTheme.get();
        themeSelect.addEventListener('change', () => {
            window.AutofillTheme.set(themeSelect.value);
        });
        document.documentElement.addEventListener('themechange', () => {
            themeSelect.value = window.AutofillTheme.get();
        });
    }

    let autofillFields = []; // { fieldName: "Name", values: ["John Doe", "Jane Smith"] }

    // Held separately from the controls so a save fired before the catalogue loads
    // cannot write an empty model id and quietly reset the choice to the default.
    let selectedProvider = '';
    let selectedModel = '';
    let modelCatalog = [];
    let providers = [];
    let modelInitialized = false;

    // Both are remembered per provider so switching does not lose the other key,
    // or leave one provider's model id pointed at the other's endpoint.
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
                addField("Skills", allSkills.join(", "));
            }
        }
        return fields;
    }

    function getSettingsPayload() {
        if (selectedProvider) modelByProvider[selectedProvider] = selectedModel;
        return {
            provider: selectedProvider,
            models: { ...modelByProvider },
            geminiApiKey: apiKeys.gemini || '',
            openrouterApiKey: apiKeys.openrouter || '',
            autofillFields,
            resumeJson: resumeJsonInput.value
        };
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
        providerBlurb.textContent = providerInfo()?.blurb || '';
        syncKeyCard();
    }

    // The key field belongs to whichever provider is selected above, so it
    // re-labels itself rather than showing one field per provider.
    function syncKeyCard() {
        const info = providerInfo();
        if (!info) return;
        apiProviderTag.textContent = info.label;
        apiKeyInput.placeholder = info.keyHint;
        apiKeyInput.value = apiKeys[info.id] || '';
        apiKeyLink.href = info.keyUrl;
        apiKeyLink.textContent = `Get a ${info.label} key`;
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
        // Sub-dollar rates need a third decimal to stay distinguishable, but keep
        // at least two so a rate never renders as "$0.1" next to a "$0.037".
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

    // True for an id the fetched catalogue does not contain: either one typed by
    // hand or one retired upstream. Either way it stays editable as free text
    // rather than silently vanishing from the dropdown.
    function isCustomModel() {
        return !!selectedModel && !modelCatalog.some(m => m.id === selectedModel);
    }

    function renderModelOptions() {
        let list = modelFreeOnly.checked ? modelCatalog.filter(m => m.free) : modelCatalog;

        // Keep the current choice in the list even when the filter would hide it,
        // otherwise "Free only" would silently reassign a paid selection.
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
            modelMeta.classList.remove('is-custom');
            modelMeta.textContent = 'No model chosen, so the built-in default is used.';
            return;
        }
        if (!known) {
            modelMeta.classList.add('is-custom');
            modelMeta.textContent = modelCatalog.length
                ? 'Custom: not in the fetched catalogue. It is sent to OpenRouter exactly as typed, so check the spelling.'
                : 'Catalogue not loaded yet. It is sent to OpenRouter exactly as typed.';
            return;
        }
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

            // The background resolves the effective model (saved value, else the
            // provider default). `keepModel` is for a plain refresh, which must not
            // discard a choice just made.
            if (!modelInitialized || !keepModel) {
                modelInitialized = true;
                selectedModel = response.selected || response.defaultModel || '';
            }

            renderProviderOptions();
            renderModelOptions();
            freeOnlyLine.hidden = modelCatalog.every(m => m.free);

            if (!response.hasKey) {
                modelStatus.textContent = 'Add an API key below to load the model list';
            } else if (response.stale) {
                modelStatus.textContent = response.fetchedAt
                    ? `Showing the list cached ${new Date(response.fetchedAt).toLocaleDateString()}`
                    : `Could not reach ${providerInfo()?.label || 'the provider'}, showing a built-in list`;
            } else {
                modelStatus.textContent = `${modelCatalog.length} models loaded`;
            }
        });
    }

    function renderAutofillFields() {
        fieldsContainer.innerHTML = '';
        autofillFields.forEach((field, index) => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'autofill-field';
            fieldDiv.innerHTML = `
                <h3>Field: ${field.fieldName}</h3>
                <label>Field Name (e.g., "Name", "Email"):</label>
                <input type="text" data-index="${index}" data-type="name" value="${field.fieldName || ''}" placeholder="Field Name">
                <label>Values (comma-separated):</label>
                <textarea data-index="${index}" data-type="values" placeholder="Value 1, Value 2">${(field.values || []).join(', ')}</textarea>
                <button class="remove-field" data-index="${index}">Remove</button>
            `;
            fieldsContainer.appendChild(fieldDiv);
        });
    }

    function loadSettings() {
        chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
            const settings = (response && response.settings) ? response.settings : {};
            apiKeys.gemini = settings.geminiApiKey || '';
            apiKeys.openrouter = settings.openrouterApiKey || '';
            Object.assign(modelByProvider, settings.models || {});
            const resumeJson = settings.resumeJson || DEFAULT_RESUME_JSON;
            resumeJsonInput.value = resumeJson;
            if (settings.autofillFields && settings.autofillFields.length > 0) {
                autofillFields = settings.autofillFields;
            } else {
                try {
                    const parsedResume = JSON.parse(resumeJson);
                    autofillFields = buildAutofillFieldsFromResume(parsedResume);
                } catch (_) {
                    autofillFields = buildAutofillFieldsFromResume(DEFAULT_RESUME);
                }
            }
            renderAutofillFields();
            // Chained rather than parallel: the model list depends on which
            // provider is stored and, for Gemini, on its key.
            loadModels();
        });
    }

    apiKeyInput.addEventListener('input', () => {
        if (selectedProvider) apiKeys[selectedProvider] = apiKeyInput.value.trim();
    });

    saveApiKeyButton.addEventListener('click', () => {
        if (selectedProvider) apiKeys[selectedProvider] = apiKeyInput.value.trim();
        chrome.runtime.sendMessage({ action: "saveSettings", settings: getSettingsPayload() }, (response) => {
            if (response && response.success) {
                apiKeyStatus.textContent = "API Key saved!";
                setTimeout(() => apiKeyStatus.textContent = '', 3000);
                // Gemini's catalogue is per-key, so a new key can unlock the list.
                loadModels({ refresh: true, keepModel: true });
            }
        });
    });

    providerSelect.addEventListener('change', () => {
        if (selectedProvider) modelByProvider[selectedProvider] = selectedModel;
        selectedProvider = providerSelect.value;
        modelCatalog = [];
        syncKeyCard();
        // Ask for the newly chosen provider explicitly: the change is not saved
        // yet, so the background would answer for the previously stored one.
        loadModels({ provider: selectedProvider });
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
    });

    modelCustom.addEventListener('input', () => {
        selectedModel = modelCustom.value.trim();
        describeSelectedModel();
    });

    modelFreeOnly.addEventListener('change', renderModelOptions);

    refreshModelsButton.addEventListener('click', () => loadModels({ refresh: true, keepModel: true }));

    saveModelButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "saveSettings", settings: getSettingsPayload() }, (response) => {
            if (response && response.success) {
                modelStatus.textContent = "Model saved!";
                setTimeout(() => modelStatus.textContent = '', 3000);
            }
        });
    });

    addFieldButton.addEventListener('click', () => {
        autofillFields.push({ fieldName: '', values: [] });
        renderAutofillFields();
    });

    fieldsContainer.addEventListener('input', (event) => {
        const target = event.target;
        if (target.dataset.index !== undefined) {
            const index = parseInt(target.dataset.index);
            if (target.dataset.type === 'name') {
                autofillFields[index].fieldName = target.value;
            } else if (target.dataset.type === 'values') {
                autofillFields[index].values = target.value.split(',').map(s => s.trim()).filter(s => s !== '');
            }
        }
    });

    fieldsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-field')) {
            const index = parseInt(event.target.dataset.index);
            autofillFields.splice(index, 1);
            renderAutofillFields();
        }
    });

    saveAutofillFieldsButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "saveSettings", settings: getSettingsPayload() }, (response) => {
            if (response && response.success) {
                autofillFieldsStatus.textContent = "Autofill fields saved!";
                setTimeout(() => autofillFieldsStatus.textContent = '', 3000);
            }
        });
    });

    loadSettings();
    loadModels();
});
