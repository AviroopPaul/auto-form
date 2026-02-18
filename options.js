// options.js
document.addEventListener('DOMContentLoaded', () => {
    const groqApiKeyInput = document.getElementById('groq-api-key');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const apiKeyStatus = document.getElementById('api-key-status');

    const fieldsContainer = document.getElementById('fields-container');
    const addFieldButton = document.getElementById('add-field');
    const saveAutofillFieldsButton = document.getElementById('save-autofill-fields');
    const autofillFieldsStatus = document.getElementById('autofill-fields-status');
    const resumeJsonInput = document.getElementById('resume-json');

    let autofillFields = []; // { fieldName: "Name", values: ["John Doe", "Jane Smith"] }

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
        const resumeJson = resumeJsonInput.value;
        const groqApiKey = groqApiKeyInput.value;
        return {
            groqApiKey,
            autofillFields,
            resumeJson
        };
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
            groqApiKeyInput.value = settings.groqApiKey || settings.openaiApiKey || '';
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
        });
    }

    saveApiKeyButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "saveSettings", settings: getSettingsPayload() }, (response) => {
            if (response && response.success) {
                apiKeyStatus.textContent = "API Key saved!";
                setTimeout(() => apiKeyStatus.textContent = '', 3000);
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
});
