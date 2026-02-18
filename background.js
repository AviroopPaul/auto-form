// background.js
console.log("Intelligent Autofill Extension: Background script loaded.");

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
  const nameParts = (resume.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
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

// Listen for messages from content scripts or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "deduceFormFields") {
      chrome.storage.sync.get("settings", async (data) => {
          const settings = data.settings || {};
          const groqApiKey = settings.groqApiKey || settings.openaiApiKey;
          let autofillFields = settings.autofillFields || [];
          const resumeJson = settings.resumeJson || DEFAULT_RESUME_JSON;
          if (autofillFields.length === 0) {
            try {
              const parsedResume = JSON.parse(resumeJson);
              autofillFields = buildAutofillFieldsFromResume(parsedResume);
            } catch (_) {
              autofillFields = buildAutofillFieldsFromResume(DEFAULT_RESUME);
            }
          }

          const fields = Array.isArray(request.fields) ? request.fields : [];
          if (fields.length === 0) {
            sendResponse({ values: {} });
            return;
          }

          if (!groqApiKey) {
              console.warn("Groq API Key is not set. Cannot deduce form fields.");
              sendResponse({ error: "API Key not set", values: {} });
              return;
          }
          if (groqApiKey.startsWith("sk-") && !groqApiKey.startsWith("gsk_")) {
              console.warn("Detected a non-Groq API key. Please use a Groq key (typically starts with gsk_).");
              sendResponse({
                error: "Invalid API key format. Use your Groq API key (typically starts with gsk_).",
                values: {}
              });
              return;
          }

          const availableFieldsText = autofillFields
            .map(f => `- ${f.fieldName}: ${(f.values || []).map(v => JSON.stringify(v)).join(", ")}`)
            .join("\n");

          const prompt = `You are an expert in web forms. Map each form field to the best value from the available resume values.

Rules:
- Only use values that appear in "Available Values".
- Return null if you are not confident.
- For checkboxes, return "true" to check or null to leave unchecked.
- For selects, prefer an option text that appears in the field's HTML snippet.
- Respond only with a JSON object.

Required JSON shape:
{
  "values": {
    "<fieldId>": "<value or null>"
  }
}

Available Values:
${availableFieldsText}

Resume JSON:
${resumeJson}

Fields:
${JSON.stringify(fields, null, 2)}`;

          let response;
          try {
              response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${groqApiKey}`
                  },
                  body: JSON.stringify({
                      model: "openai/gpt-oss-120b",
                      messages: [
                          { role: "system", content: "You are an expert in web forms and can semantically map form fields to resume values." },
                          { role: "user", content: prompt }
                      ],
                      response_format: { type: "json_object" },
                      temperature: 0.1
                  })
              });

              if (!response.ok) {
                  let errorBody = "";
                  try {
                      const errorData = await response.json();
                      errorBody = errorData?.error?.message || JSON.stringify(errorData);
                  } catch (_) {
                      try {
                          errorBody = (await response.text()).slice(0, 200);
                      } catch (_) {
                          errorBody = "";
                      }
                  }
                  const statusLine = `${response.status} ${response.statusText}`.trim();
                  throw new Error(`Groq API error: ${statusLine}${errorBody ? ` - ${errorBody}` : ""}`);
              }

              const data = await response.json();
              let llmResponse = {};
              try {
                llmResponse = JSON.parse(data.choices[0].message.content);
              } catch (_) {
                llmResponse = {};
              }

              // Support both {"values": {...}} and direct mapping fallback
              const values = llmResponse.values && typeof llmResponse.values === "object"
                ? llmResponse.values
                : (typeof llmResponse === "object" ? llmResponse : {});

              sendResponse({ values });
  
          } catch (error) {
              console.error("Error calling Groq API:", error);
              sendResponse({ error: `Error: ${error.message}`, values: {} });
          }
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "deduceFieldType") {
      chrome.storage.sync.get("settings", async (data) => {
          const settings = data.settings || {};
          const groqApiKey = settings.groqApiKey || settings.openaiApiKey;
          let autofillFields = settings.autofillFields || [];
          const resumeJson = settings.resumeJson || DEFAULT_RESUME_JSON;
          if (autofillFields.length === 0) {
            try {
              const parsedResume = JSON.parse(resumeJson);
              autofillFields = buildAutofillFieldsFromResume(parsedResume);
            } catch (_) {
              autofillFields = buildAutofillFieldsFromResume(DEFAULT_RESUME);
            }
          }
          const htmlContext = request.htmlContext;
  
          if (!groqApiKey) {
              console.warn("Groq API Key is not set. Cannot deduce field type.");
              sendResponse({ inferredType: "text", suggestions: ["API Key not set"] });
              return;
          }
          if (groqApiKey.startsWith("sk-") && !groqApiKey.startsWith("gsk_")) {
              console.warn("Detected a non-Groq API key. Please use a Groq key (typically starts with gsk_).");
              sendResponse({
                inferredType: "error",
                suggestions: ["Invalid API key format. Use your Groq API key (typically starts with gsk_)."]
              });
              return;
          }
  
          const availableFields = autofillFields.map(f => f.fieldName);
          const availableFieldsList = availableFields.join(", ");
          const prompt = `Analyze the following HTML context for a form input field and determine which of the available user-defined fields it best matches.

Available User Fields: ${availableFieldsList}

If it matches one of the available user fields, return that EXACT field name in 'mappedField'. 
If it doesn't match any available field, return a generic semantic type (e.g., 'name', 'email', 'phone', 'address') in 'inferredType'.

Respond only with a JSON object containing:
'mappedField': (the exact field name from the available list, or null if no match)
'inferredType': (a generic type if mappedField is null)
'reasoning': (brief explanation)

Resume JSON:
${resumeJson}

HTML Context:
Label: ${htmlContext.label}
Name: ${htmlContext.name}
Id: ${htmlContext.id}
Placeholder: ${htmlContext.placeholder}
Type attribute: ${htmlContext.type}
Attributes: ${JSON.stringify(htmlContext.attributes)}
Outer HTML: ${htmlContext.html}`;
  
          let response;
          try {
              response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${groqApiKey}`
                  },
                  body: JSON.stringify({
                      model: "openai/gpt-oss-120b",
                      messages: [
                          { role: "system", content: "You are an expert in web forms and can semantically identify form field types based on HTML context and map them to user-defined fields." },
                          { role: "user", content: prompt }
                      ],
                      response_format: { type: "json_object" },
                      temperature: 0.1
                  })
              });
  
              if (!response.ok) {
                  let errorBody = "";
                  try {
                      const errorData = await response.json();
                      errorBody = errorData?.error?.message || JSON.stringify(errorData);
                  } catch (_) {
                      try {
                          errorBody = (await response.text()).slice(0, 200);
                      } catch (_) {
                          errorBody = "";
                      }
                  }
                  const statusLine = `${response.status} ${response.statusText}`.trim();
                  throw new Error(`Groq API error: ${statusLine}${errorBody ? ` - ${errorBody}` : ""}`);
              }
  
              const data = await response.json();
              const llmResponse = JSON.parse(data.choices[0].message.content);
              
              let suggestions = [];
              let finalType = "";

              if (llmResponse.mappedField) {
                  const field = autofillFields.find(f => f.fieldName.toLowerCase() === llmResponse.mappedField.toLowerCase());
                  if (field) {
                      suggestions = field.values || [];
                      finalType = field.fieldName;
                  }
              }

              if (suggestions.length === 0 && llmResponse.inferredType) {
                  finalType = llmResponse.inferredType;
                  const fallbackField = autofillFields.find(f => 
                      f.fieldName.toLowerCase().includes(llmResponse.inferredType.toLowerCase()) || 
                      llmResponse.inferredType.toLowerCase().includes(f.fieldName.toLowerCase())
                  );
                  if (fallbackField) {
                      suggestions = fallbackField.values || [];
                      finalType = fallbackField.fieldName;
                  }
              }

              // Only send response if we actually have suggestions
              sendResponse({ inferredType: finalType, suggestions: suggestions });
  
          } catch (error) {
              console.error("Error calling Groq API:", error);
              sendResponse({ inferredType: "error", suggestions: [`Error: ${error.message}`] });
          }
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "saveSettings") {
      chrome.storage.sync.set({ settings: request.settings }, () => {
        console.log("Settings saved:", request.settings);
        sendResponse({ success: true });
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "getSettings") {
      chrome.storage.sync.get("settings", (data) => {
        console.log("Settings retrieved:", data.settings);
        sendResponse({ settings: data.settings });
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "openOptions") {
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;
    } else if (request.action === "trigger_autofill") {
      const tabId = request.tabId;
      if (!tabId) {
        sendResponse({ success: false, error: "No tabId" });
        return true;
      }
      runAutofillInTab(tabId);
      sendResponse({ success: true });
      return true;
    }
  });

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
});

// Keyboard shortcut for autofill (keeps modal focused - no popup to steal focus)
chrome.commands.onCommand.addListener((command) => {
  if (command === "autofill") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        runAutofillInTab(tab.id);
      }
    });
  }
});

function runAutofillInTab(tabId) {
  const triggerAutofill = () => {
    document.dispatchEvent(new CustomEvent("autofill-extension-trigger"));
  };
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"]
  }).then(() => {
    return chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "ISOLATED",
      func: triggerAutofill
    });
  }).catch((err) => {
    console.error("Autofill failed:", err);
    chrome.tabs.sendMessage(tabId, { action: "autofill_all_fields" }).catch(() => {});
  });
}
