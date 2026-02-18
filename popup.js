document.getElementById('autofill-all').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ action: "trigger_autofill", tabId: tab.id });
    window.close();
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