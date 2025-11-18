const DEBUG = false;

export function log(...args: unknown[]) {
  if (DEBUG) console.log("[Untitled Downloader]", ...args);
}

export function warn(...args: unknown[]) {
  if (DEBUG) console.warn("[Untitled Downloader]", ...args);
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function sendMessageToActiveTab(message: unknown) {
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, message);
  } else {
    warn("Failed to find active tab for message:", message);
  }
}

export function sendMessageToBackground(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(response);
        });
    });
}

export async function getCookieString(): Promise<string> {
    try {
        const response = await sendMessageToBackground({ action: "getCookies" });
        return response?.cookieString || "";
    } catch (error) {
        console.log("Error getting cookies:", error);
        return "";
    }
}