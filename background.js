// background.js
console.log("Intelligent Autofill Extension: Background script loaded.");

// Provider keys normally come from the extension settings. For local use you can
// instead drop them in config.local.js (gitignored) via ./write-local-config.sh,
// which reads GEMINI_API_KEY / GOOGLE_API_KEY and OPENROUTER_API_KEY from your shell.
// Safari runs this file as a background *page* (see "preferred_environment" in the
// manifest), where importScripts does not exist, so each environment needs its own
// loader. Either way a missing config.local.js is fine: the key then has to come
// from settings.
function loadLocalConfig() {
  if (typeof importScripts === "function") {
    try {
      importScripts("config.local.js");
    } catch (_) {}
    return;
  }
  if (typeof document === "undefined" || !document.head) return;
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("config.local.js");
    document.head.appendChild(script);
  } catch (_) {}
}

loadLocalConfig();

const OPENROUTER_REFERER = "https://github.com/AviroopPaul/auto-form";
const OPENROUTER_TITLE = "Intelligent Autofill Extension";

const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Both providers speak the OpenAI chat-completions dialect, so only the endpoint,
// the key and the model-list shape differ. Gemini is the default because its free
// tier is a real one: Flash models take a 1M-token input, where Groq's free tier
// caps at 8K tokens *per minute* — less than a single autofill prompt — and
// OpenRouter's shared free pool is where the 429s and dead model ids come from.
const PROVIDERS = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    blurb: "Free tier, no card required. 1M-token context on Flash models.",
    chatUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    // The OpenAI-compatible /models list omits context limits, so the native
    // endpoint is used for the catalogue and the compatible one for chat.
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    modelsAuth: "query",
    keyField: "geminiApiKey",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    keyError: "Invalid API key format. Use your Google AI Studio key (starts with AIza).",
    isValidKey: (key) => key.startsWith("AIza"),
    defaultModel: "gemini-flash-lite-latest",
    routeParams: false,
    parseModels: parseGeminiModels,
    sortModels: sortGemini,
    fallbackModels: [
      { id: "gemini-flash-lite-latest", name: "Gemini Flash-Lite Latest", free: true, json: true, context: 1048576 },
      { id: "gemini-flash-latest", name: "Gemini Flash Latest", free: true, json: true, context: 1048576 },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", free: true, json: true, context: 1048576 }
    ]
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "Hundreds of models behind one key. The shared free pool is rate-limited and flaky.",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    modelsAuth: "none", // the catalogue is public, so the key stays on the chat path
    keyField: "openrouterApiKey",
    keyHint: "sk-or-v1-...",
    keyUrl: "https://openrouter.ai/keys",
    keyError: "Invalid API key format. Use your OpenRouter API key (starts with sk-or-).",
    isValidKey: (key) => key.startsWith("sk-or-"),
    defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
    routeParams: true,
    parseModels: parseOpenRouterModels,
    sortModels: sortByPrice,
    fallbackModels: [
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA: Nemotron 3 Super (free)", free: true, json: true, context: 262144, prompt: 0, completion: 0 },
      { id: "google/gemma-4-31b-it:free", name: "Google: Gemma 4 31B (free)", free: true, json: true, context: 262144, prompt: 0, completion: 0 },
      { id: "openai/gpt-oss-120b", name: "OpenAI: gpt-oss-120b", free: false, json: true, context: 131072, prompt: 0.037, completion: 0.17 }
    ]
  }
};

const DEFAULT_PROVIDER = "gemini";

function getProvider(settings) {
  const id = typeof settings.provider === "string" ? settings.provider : "";
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

// Models are remembered per provider, so switching to Gemini and back does not
// leave an OpenRouter id selected against Google's endpoint (or the reverse).
function getSelectedModel(settings, provider) {
  const byProvider = settings.models && typeof settings.models === "object" ? settings.models : {};
  const stored = typeof byProvider[provider.id] === "string" ? byProvider[provider.id].trim() : "";
  if (stored) return stored;
  // Settings written before providers existed kept a single OpenRouter model id.
  if (provider.id === "openrouter" && typeof settings.model === "string" && settings.model.trim()) {
    return settings.model.trim();
  }
  return provider.defaultModel;
}

// Prices come back as per-token strings; per-million is what the UI shows. A
// negative price is OpenRouter's "varies by whichever model the router picks"
// sentinel (openrouter/auto reports -1), not a real number, so it becomes null
// rather than a nonsense figure that would sort ahead of everything free.
function perMillion(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) return null;
  return value * 1e6;
}

// The extension sends text and needs text back, so anything that answers in audio
// is filtered out of the picker entirely. Google's lyria models otherwise slip
// through as "free" on a zero per-token price while being unusable here.
function isTextModel(entry) {
  const output = entry?.architecture?.output_modalities;
  if (!Array.isArray(output)) return true; // undocumented: let it through
  return output.includes("text") && !output.includes("audio");
}

function parseOpenRouterModels(body) {
  const entries = Array.isArray(body?.data) ? body.data : [];
  return entries.map((entry) => {
    const id = entry && typeof entry.id === "string" ? entry.id : "";
    if (!id || !isTextModel(entry)) return null;
    const params = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : [];
    const pricing = entry.pricing || {};
    const prompt = perMillion(pricing.prompt);
    const completion = perMillion(pricing.completion);
    return {
      id,
      name: typeof entry.name === "string" && entry.name ? entry.name : id,
      free: prompt === 0 && completion === 0,
      json: params.includes("response_format"),
      context: Number(entry.context_length) || null,
      prompt,
      completion
    };
  }).filter(Boolean);
}

// Google's catalogue mixes in speech, image and embedding models that cannot answer
// a chat completion, plus specialised agents (computer-use, robotics, deep-research)
// that technically can but are the wrong shape and far too slow for filling a form.
// generateContent support is the coarse filter; the id check removes the rest.
const GEMINI_UNSUITABLE = /tts|image|embedding|banana|lyria|veo|imagen|aqa|transcribe|robotics|computer-use|antigravity|deep-research/i;

function parseGeminiModels(body) {
  const entries = Array.isArray(body?.models) ? body.models : [];
  return entries.map((entry) => {
    const id = String(entry?.name || "").replace(/^models\//, "");
    const methods = Array.isArray(entry?.supportedGenerationMethods) ? entry.supportedGenerationMethods : [];
    if (!id || GEMINI_UNSUITABLE.test(id) || !methods.includes("generateContent")) return null;
    return {
      id,
      name: entry.displayName || id,
      // Google's free tier covers the Gemini chat models; the per-model daily
      // quota differs but none of them bill without a billing account attached.
      free: true,
      json: true,
      context: Number(entry.inputTokenLimit) || null,
      prompt: 0,
      completion: 0
    };
  }).filter(Boolean);
}

// Free-then-cheapest is the natural order for a priced catalogue.
function sortByPrice(a, b) {
  if (a.free !== b.free) return a.free ? -1 : 1;
  return (a.prompt ?? Infinity) - (b.prompt ?? Infinity) || a.id.localeCompare(b.id);
}

// Gemini ids carry no price to sort by (everything on the free tier is 0), so order
// by usefulness for this task instead: the fast Flash-Lite tier first, then Flash,
// then Pro, newest version leading each group. The evergreen "-latest" aliases lead
// their family because they track the current release and never get retired.
function sortGemini(a, b) {
  const key = (id) => {
    const family = /flash-lite/.test(id) ? 0 : /flash/.test(id) ? 1 : /pro/.test(id) ? 2 : 3;
    const version = /-latest$/.test(id) ? Infinity : parseFloat((id.match(/-(\d+(?:\.\d+)?)-/) || [])[1]) || 0;
    return [family, -version];
  };
  const [fa, va] = key(a.id);
  const [fb, vb] = key(b.id);
  return fa - fb || va - vb || a.id.localeCompare(b.id);
}

const cacheKeyFor = (provider) => `modelCatalog:${provider.id}`;

function readCachedModels(provider) {
  const key = cacheKeyFor(provider);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (data) => {
        if (chrome.runtime.lastError) return resolve(null);
        const cached = data && data[key];
        resolve(cached && Array.isArray(cached.models) && cached.models.length ? cached : null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function writeCachedModels(provider, payload) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [cacheKeyFor(provider)]: payload }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });
}

// Returns the freshest list it can get, and always returns something: a live fetch
// when possible, otherwise the cache (even a stale one), otherwise the seed list.
// `error` is set whenever the caller is looking at something other than fresh data.
async function getModelCatalog(provider, { refresh = false, apiKey = "" } = {}) {
  const cached = await readCachedModels(provider);
  const isFresh = cached && Date.now() - (cached.fetchedAt || 0) < MODEL_CACHE_TTL_MS;
  if (cached && isFresh && !refresh) {
    return { models: cached.models, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    // Gemini's catalogue is per-key, so without one there is nothing to fetch.
    if (provider.modelsAuth === "query" && !apiKey) {
      throw new Error("Add an API key to load the model list");
    }
    const url = provider.modelsAuth === "query"
      ? `${provider.modelsUrl}&key=${encodeURIComponent(apiKey)}`
      : provider.modelsUrl;

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      const detail = await readErrorText(response);
      throw new Error(`${response.status} ${response.statusText}`.trim() + (detail ? ` - ${detail}` : ""));
    }
    const models = provider.parseModels(await response.json()).sort(provider.sortModels);
    if (models.length === 0) throw new Error("Empty model list");
    const payload = { models, fetchedAt: Date.now() };
    await writeCachedModels(provider, payload);
    return { models, fetchedAt: payload.fetchedAt, stale: false };
  } catch (error) {
    console.warn(`Could not refresh the ${provider.label} model list:`, error);
    const message = String(error.message || error);
    if (cached) {
      return { models: cached.models, fetchedAt: cached.fetchedAt, stale: true, error: message };
    }
    return { models: provider.fallbackModels, fetchedAt: null, stale: true, error: message };
  }
}

// Reads JSON-mode support off the cache only: autofill must not wait on a catalogue
// fetch, and an unknown model is assumed to accept response_format because most do
// and fetchChatCompletion retries without it when one turns out not to.
async function modelSupportsJsonMode(provider, modelId) {
  const cached = await readCachedModels(provider);
  const list = (cached && cached.models) || provider.fallbackModels;
  const known = list.find(m => m.id === modelId);
  return known ? known.json : true;
}

function isValidKey(provider, apiKey) {
  return typeof apiKey === "string" && provider.isValidKey(apiKey.trim());
}

// Prefers a key that actually looks right for the chosen provider, wherever it
// lives, so a leftover key for another provider cannot shadow a good one in
// config.local.js or in the other provider's field.
function getApiKey(settings, provider) {
  const local = provider.id === "openrouter" ? self.LOCAL_OPENROUTER_API_KEY : self.LOCAL_GEMINI_API_KEY;
  const candidates = [
    settings[provider.keyField],
    local,
    settings.apiKey
  ].filter(key => typeof key === "string" && key.trim());
  return (candidates.find(key => isValidKey(provider, key)) || candidates[0] || "").trim();
}

function chatHeaders(provider, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] = OPENROUTER_REFERER;
    headers["X-Title"] = OPENROUTER_TITLE;
  }
  return headers;
}

// JSON mode is per-model now that the model is user-selectable: most accept
// response_format, but some reject it outright (inclusionai/ling-3.0-flash-fin
// errors on it). Providers honour it loosely and still fence their JSON sometimes,
// which is why parseJsonContent below unwraps the response rather than trusting it
// to be bare JSON.
function chatBody(provider, messages, model, jsonMode) {
  const body = {
    model,
    messages,
    temperature: 0.1
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
    // OpenRouter only: route to upstreams that actually honour the params we send.
    // Without it OpenRouter can pick one that ignores response_format or caps
    // completions far below the advertised limit (SiliconFlow caps gpt-oss-120b at
    // 8k). Google serves its own models, so the key is meaningless there and gets
    // rejected as an unknown field.
    if (provider.routeParams) body.provider = { require_parameters: true };
  }
  return body;
}

async function readErrorText(response) {
  try {
    const data = await response.json();
    return data?.error?.message || JSON.stringify(data);
  } catch (_) {
    try {
      return (await response.text()).slice(0, 200);
    } catch (_) {
      return "";
    }
  }
}

// The shared free-tier pool answers with a transient 429 fairly often, which would
// otherwise surface as a failed autofill, so retry briefly before giving up. The
// error body is read here because the caller needs it and a body can only be read
// once.
async function postChatCompletion(provider, apiKey, messages, model, jsonMode) {
  const retryStatuses = [429, 502, 503];
  let response;
  let errorText = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(provider.chatUrl, {
      method: "POST",
      headers: chatHeaders(provider, apiKey),
      body: JSON.stringify(chatBody(provider, messages, model, jsonMode))
    });
    if (response.ok) return { response, errorText: "" };
    errorText = await readErrorText(response);
    if (!retryStatuses.includes(response.status)) break;
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  return { response, errorText };
}

// A model can reject response_format even when the catalogue says otherwise, and a
// custom model id is entirely unvetted, so a rejection is not a dead end: retry the
// same call once with JSON mode off and let parseJsonContent unwrap the reply.
function rejectsJsonMode(status, errorText) {
  if (![400, 404, 422].includes(status)) return false;
  return /response_format|json_object|json_schema|structured output/i.test(errorText || "");
}

async function fetchChatCompletion(provider, apiKey, messages, model) {
  const jsonMode = await modelSupportsJsonMode(provider, model);
  let { response, errorText } = await postChatCompletion(provider, apiKey, messages, model, jsonMode);

  if (!response.ok && jsonMode && rejectsJsonMode(response.status, errorText)) {
    console.warn(`${model} rejected JSON mode; retrying without response_format.`);
    ({ response, errorText } = await postChatCompletion(provider, apiKey, messages, model, false));
  }

  if (!response.ok) {
    const statusLine = `${response.status} ${response.statusText}`.trim();
    throw new Error(`${provider.label} API error (${model}): ${statusLine}${errorText ? ` - ${errorText}` : ""}`);
  }

  return parseJsonContent(await response.json());
}

// Without JSON mode the model may fence its JSON or pad it with prose, so unwrap
// before parsing and fall back to the outermost object in the text.
function parseJsonContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return {};
  const cleaned = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // fall through to the brace scan below
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {
      return {};
    }
  }
  return {};
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

async function parseResumeTextToJson(resumeText, provider, apiKey, model) {
  const prompt = `Convert the following resume text into a clean, structured JSON object.

Rules:
- Only use information present in the resume.
- Use this schema and omit fields you cannot infer:
{
  "name": "",
  "email": "",
  "phone": "",
  "website": "",
  "github": "",
  "location": "",
  "experience": [
    {
      "company": "",
      "location": "",
      "title": "",
      "startDate": "",
      "endDate": "",
      "highlights": []
    }
  ],
  "projects": [
    { "name": "", "description": "" }
  ],
  "education": [
    {
      "school": "",
      "location": "",
      "degree": "",
      "gpa": "",
      "startDate": "",
      "endDate": ""
    }
  ],
  "skills": {
    "languages": [],
    "backend_ai": [],
    "frontend": [],
    "data_infra": []
  }
}

Resume text:
${resumeText}`;

  return fetchChatCompletion(provider, apiKey, [
    { role: "system", content: "You convert resume text into strict JSON following the given schema." },
    { role: "user", content: prompt }
  ], model);
}

// Listen for messages from content scripts or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "deduceFormFields") {
      chrome.storage.sync.get("settings", async (data) => {
          const settings = data.settings || {};
          const provider = getProvider(settings);
          const apiKey = getApiKey(settings, provider);
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

          if (!apiKey) {
              console.warn(`${provider.label} API key is not set. Cannot deduce form fields.`);
              sendResponse({ error: `${provider.label} API key not set`, values: {} });
              return;
          }
          if (!isValidKey(provider, apiKey)) {
              console.warn(provider.keyError);
              sendResponse({
                error: provider.keyError,
                values: {}
              });
              return;
          }

          const availableFieldsText = autofillFields
            .map(f => `- ${f.fieldName}: ${(f.values || []).map(v => JSON.stringify(v)).join(", ")}`)
            .join("\n");

          // Only ask the model to fill fields that are currently empty. Already-filled
          // fields are still sent (below) as page context so the model can understand
          // who/what the form is about, but they must never be overwritten.
          const emptyFields = fields.filter(f => f.isEmpty !== false);
          const filledFields = fields.filter(f => f.isEmpty === false);

          if (emptyFields.length === 0) {
            sendResponse({ values: {} });
            return;
          }

          let primaryUserName = "";
          try {
            primaryUserName = (JSON.parse(resumeJson).name || "").trim();
          } catch (_) {}

          const pageContext = request.pageContext || {};
          const filledFieldsText = filledFields.length > 0
            ? filledFields
                .map(f => `- ${f.label || f.name || f.id || "field"}: ${JSON.stringify(f.currentValue || "")}`)
                .join("\n")
            : "(none)";

          const prompt = `You are an expert in web forms. Your job is to fill the EMPTY fields on a page by intelligently mapping them to the user's saved values.

How to think:
1. First, understand WHO and WHAT this page/form is about. Use the page text, page title, and the fields that are ALREADY FILLED to identify the subject (for example, a person's name shown on the page).
2. Decide whose information to use:
   a. If the page CLEARLY indicates it belongs to a specific named person (e.g. a name is shown in the page text or an already-filled field), use the values qualified to THAT person. Some saved values are qualified by an entity (e.g. a saved field "Alex Jones Passport Number"); if the page is about Alex Jones, use that qualified value to fill the corresponding empty field (e.g. an empty "Passport No" field).
   b. If there is NO name or any indication that the form belongs to a specific other person, DEFAULT to the primary user — the owner of the "Resume JSON" (and the generic, non-entity-qualified entries in "Available Values"). Fill the form with the primary user's own information.
3. Map each EMPTY field to the single best value following the rule above.

Rules:
- ONLY return values for the fields listed under "Empty Fields To Fill". Never return a value for an already-filled field.
- CRITICAL: You may ONLY output values that are copied VERBATIM from "Available Values" or "Resume JSON". Copy the exact characters.
- NEVER invent, fabricate, guess, transform, or auto-generate a value. Do NOT produce realistic-looking placeholder or example data of ANY kind — e.g. fake passport/ID numbers like "Z7042616", emails like "name@example.com", phone numbers, dates, or addresses that are not literally present in the provided data.
- If no matching value literally exists in the provided data for a field, return null. A missing field MUST stay empty. Returning null is always better than returning a made-up value.
- For checkboxes, return "true" to check or null to leave unchecked.
- For selects, only choose an option whose text appears in the field's HTML snippet AND corresponds to a provided value; otherwise null.
- Respond only with a JSON object.

Required JSON shape:
{
  "values": {
    "<fieldId>": "<value or null>"
  }
}

Primary User: ${primaryUserName || "(the owner of the Resume JSON below)"}
(When the page does not clearly belong to a specific other named person, fill the form as this primary user.)

Page Context:
Title: ${pageContext.title || ""}
URL: ${pageContext.url || ""}
Already-filled fields on the page (use ONLY to understand the subject — do not fill these):
${filledFieldsText}
Visible page text:
${(pageContext.pageText || "").slice(0, 4000)}

Available Values:
${availableFieldsText}

Resume JSON:
${resumeJson}

Empty Fields To Fill:
${JSON.stringify(emptyFields, null, 2)}`;

          try {
              const llmResponse = await fetchChatCompletion(provider, apiKey, [
                          { role: "system", content: "You are an expert in web forms and can semantically map form fields to resume values." },
                          { role: "user", content: prompt }
                      ], getSelectedModel(settings, provider));

              // Support both {"values": {...}} and direct mapping fallback
              const rawValues = llmResponse.values && typeof llmResponse.values === "object"
                ? llmResponse.values
                : (typeof llmResponse === "object" ? llmResponse : {});

              // Grounding guard: the model can hallucinate realistic-looking data
              // (fake passport numbers, name@example.com, etc.). Drop any value
              // that is not literally present in the user's saved data so we never
              // fill a fabricated value.
              const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
              const corpus = norm(
                autofillFields.map(f => (f.values || []).join(" ")).join(" ") + " " + resumeJson
              );
              const BOOLEANS = new Set(["true", "false", "yes", "no", "1", "0", "checked", "on", "off"]);

              const values = {};
              Object.keys(rawValues).forEach((fieldId) => {
                const v = rawValues[fieldId];
                if (v === null || v === undefined || v === "") return; // leave empty
                const nv = norm(v);
                if (!nv) return;
                if (BOOLEANS.has(nv)) { values[fieldId] = v; return; } // checkbox/radio
                // Must appear verbatim somewhere in the saved data.
                if (corpus.includes(nv)) {
                  values[fieldId] = v;
                } else {
                  console.warn(`Dropping ungrounded value for ${fieldId}: ${JSON.stringify(v)}`);
                }
              });

              sendResponse({ values });
  
          } catch (error) {
              console.error("Error calling OpenRouter API:", error);
              sendResponse({ error: `Error: ${error.message}`, values: {} });
          }
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "deduceFieldType") {
      chrome.storage.sync.get("settings", async (data) => {
          const settings = data.settings || {};
          const provider = getProvider(settings);
          const apiKey = getApiKey(settings, provider);
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

          if (!apiKey) {
              console.warn(`${provider.label} API key is not set. Cannot deduce field type.`);
              sendResponse({ inferredType: "text", suggestions: [`${provider.label} API key not set`] });
              return;
          }
          if (!isValidKey(provider, apiKey)) {
              console.warn(provider.keyError);
              sendResponse({
                inferredType: "error",
                suggestions: [provider.keyError]
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
  
          try {
              const llmResponse = await fetchChatCompletion(provider, apiKey, [
                          { role: "system", content: "You are an expert in web forms and can semantically identify form field types based on HTML context and map them to user-defined fields." },
                          { role: "user", content: prompt }
                      ], getSelectedModel(settings, provider));

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
              console.error("Error calling OpenRouter API:", error);
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
    } else if (request.action === "getModels") {
      chrome.storage.sync.get("settings", async (data) => {
        const settings = data.settings || {};
        // The panel asks for a specific provider while the user is switching, before
        // that choice has been saved; otherwise the stored one is authoritative.
        const provider = PROVIDERS[request.provider] || getProvider(settings);
        const catalog = await getModelCatalog(provider, {
          refresh: request.refresh === true,
          apiKey: getApiKey(settings, provider)
        });
        sendResponse({
          provider: provider.id,
          providers: Object.values(PROVIDERS).map(p => ({
            id: p.id, label: p.label, blurb: p.blurb, keyHint: p.keyHint,
            keyUrl: p.keyUrl, keyField: p.keyField
          })),
          models: catalog.models,
          fetchedAt: catalog.fetchedAt,
          stale: catalog.stale,
          error: catalog.error,
          selected: getSelectedModel(settings, provider),
          defaultModel: provider.defaultModel,
          hasKey: !!getApiKey(settings, provider)
        });
      });
      return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "parseResume") {
      const resumeText = request.resumeText || "";
      if (!resumeText.trim()) {
        sendResponse({ error: "Resume text is empty." });
        return true;
      }
      chrome.storage.sync.get("settings", async (data) => {
        try {
          const settings = data.settings || {};
          const provider = getProvider(settings);
          const apiKey = getApiKey(settings, provider);
          if (!apiKey) {
            sendResponse({ error: `${provider.label} API key not set` });
            return;
          }
          if (!isValidKey(provider, apiKey)) {
            sendResponse({ error: provider.keyError });
            return;
          }

          const parsedResume = await parseResumeTextToJson(
            resumeText, provider, apiKey, getSelectedModel(settings, provider));
          const resumeJson = JSON.stringify(parsedResume, null, 2);
          const autofillFields = buildAutofillFieldsFromResume(parsedResume);
          sendResponse({ resumeJson, autofillFields });
        } catch (error) {
          console.error("Error parsing resume:", error);
          sendResponse({ error: `Error: ${error.message}` });
        }
      });
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

// Safari has no side panel surface at all (no sidePanel API, no side_panel manifest
// key, not even Firefox's sidebar_action), so the toolbar button there opens
// sidepanel.html as a popup instead. That is why the manifest declares
// default_popup: browsers without a panel get the popup with no runtime call
// needed. Chrome, which does have a panel, clears the popup below so its own
// toolbar click keeps opening the side panel.
const HAS_SIDE_PANEL = !!(chrome.sidePanel && chrome.sidePanel.open);

// Orion is the one engine that exposes BOTH Chrome's sidePanel and Firefox's
// sidebarAction; Chrome has only the former and Firefox only the latter. That
// combination is the fingerprint, and it matters because neither of Orion's
// implementations can actually close a docked panel: sidebarAction.close()
// rejects with "unable to find toolbar item", setOptions({enabled:false}) is
// accepted and ignored, and window.close() is inert. A popup has none of those
// problems, so prefer one there.
const PREFER_POPUP = HAS_SIDE_PANEL && !!pickApi("sidebarAction");
const POPUP_PAGE = "sidepanel.html?popup=1";

// setPopup/setPanelBehavior return a promise on MV3 but not on every engine, so
// swallow failures without assuming a thenable came back.
function settle(result) {
  if (result && typeof result.catch === "function") result.catch(() => {});
}

function configureActionSurface() {
  if (!HAS_SIDE_PANEL) return; // Safari: the manifest's default_popup handles it.

  if (PREFER_POPUP) {
    // Set the popup explicitly rather than trusting the manifest default: an
    // earlier run cleared it to use the docked panel, and that cleared state
    // persists across restarts. The query string is what tells the page to style
    // itself as a popup, which capability detection alone cannot do here because
    // this engine does have panel APIs.
    try {
      settle(chrome.action.setPopup({ popup: POPUP_PAGE }));
    } catch (_) {}
    // And stop the browser opening the docked panel on the same click.
    try {
      settle(chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }));
    } catch (_) {}
    return;
  }

  try {
    settle(chrome.action.setPopup({ popup: "" }));
  } catch (_) {}
  try {
    settle(chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
  } catch (_) {}
  // Safety net: if an earlier close attempt left the panel disabled, this puts it
  // back on every startup so the panel can never get stuck permanently off.
  try {
    settle(chrome.sidePanel.setOptions({ enabled: true, path: "sidepanel.html" }));
  } catch (_) {}
}

configureActionSurface();
chrome.runtime.onInstalled.addListener(configureActionSurface);
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(configureActionSurface);
}

// Firefox-shaped sidebar APIs live on `browser` in some engines and `chrome` in
// others, so look across both rather than assuming a namespace.
function pickApi(name) {
  if (typeof browser !== "undefined" && browser && browser[name]) return browser[name];
  if (typeof chrome !== "undefined" && chrome && chrome[name]) return chrome[name];
  return null;
}

// Only reached when the surface configured above did not take effect, because
// every engine we support has the browser itself consume the click: a popup via
// setPopup, or the docked panel via openPanelOnActionClick. So this is purely a
// "nothing else worked" path, and the right thing here is to show the UI rather
// than attempt a toggle through APIs that are absent or inert.
chrome.action.onClicked.addListener((tab) => {
  if (HAS_SIDE_PANEL && !PREFER_POPUP && tab?.id) {
    settle(chrome.sidePanel.open({ tabId: tab.id }));
    return;
  }
  // A window rather than a tab: sidepanel.js resolves the form's tab by skipping
  // our own pages, but a popup window keeps the underlying tab active and makes
  // that lookup unnecessary.
  chrome.windows.create({
    url: chrome.runtime.getURL(POPUP_PAGE),
    type: "popup",
    width: 420,
    height: 640
  });
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
  // content.js is already registered as a content script (all_frames) via the
  // manifest, so we must NOT re-inject the file here — doing so loads a second
  // copy in each frame, producing duplicate (overlapping, lingering) toasts.
  // Just dispatch the trigger event into every frame's isolated world.
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "ISOLATED",
    func: triggerAutofill
  }).catch((err) => {
    console.error("Autofill trigger failed, falling back to message:", err);
    chrome.tabs.sendMessage(tabId, { action: "autofill_all_fields" }).catch(() => {});
  });
}
