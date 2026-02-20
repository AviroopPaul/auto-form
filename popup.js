const autofillButton = document.getElementById('autofill-all');
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');
const statusMeta = statusEl.querySelector('.status-meta');

let isRunning = false;

const setStatus = (state, text, meta) => {
    statusEl.classList.remove('status-idle', 'status-running', 'status-done', 'status-error');
    statusEl.classList.add(`status-${state}`);
    statusText.textContent = text;
    statusMeta.textContent = meta;
};

autofillButton.addEventListener('click', async () => {
    if (isRunning) return;
    isRunning = true;
    autofillButton.disabled = true;
    autofillButton.textContent = 'Processing...';
    setStatus('running', 'Starting autofill', 'Warming up the model');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
        setStatus('error', 'No active tab', 'Open a form page and try again');
        autofillButton.disabled = false;
        autofillButton.textContent = 'Auto Fill Form';
        isRunning = false;
        return;
    }

    chrome.runtime.sendMessage({ action: "trigger_autofill", tabId: tab.id }, (response) => {
        if (chrome.runtime.lastError) {
            setStatus('error', 'Could not start', chrome.runtime.lastError.message);
            autofillButton.disabled = false;
            autofillButton.textContent = 'Auto Fill Form';
            isRunning = false;
            return;
        }
        if (response && response.error) {
            setStatus('error', 'Could not start', response.error);
            autofillButton.disabled = false;
            autofillButton.textContent = 'Auto Fill Form';
            isRunning = false;
            return;
        }
        setStatus('running', 'Analyzing fields', 'Looking for relevant inputs');
    });
});

document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "openOptions" });
    window.close();
});

document.getElementById('set-shortcut').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
});

chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.action !== 'autofill_status') return;

    const { status, text, meta } = message;

    if (status === 'running') {
        setStatus('running', text || 'Processing', meta || 'Working through fields');
    } else if (status === 'done') {
        setStatus('done', text || 'Finished', meta || 'Fields updated on the page');
        autofillButton.disabled = false;
        autofillButton.textContent = 'Auto Fill Form';
        isRunning = false;
    } else if (status === 'error') {
        setStatus('error', text || 'Something went wrong', meta || 'Please try again');
        autofillButton.disabled = false;
        autofillButton.textContent = 'Auto Fill Form';
        isRunning = false;
    }
});
