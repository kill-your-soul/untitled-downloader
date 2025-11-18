import JSZip from 'jszip';

import { log, sendMessageToActiveTab, getActiveTab } from './utils';
type CookieDetails = Parameters<typeof chrome.cookies.getAll>[0];

type CookieQueryDetails = CookieDetails & {
  storeId?: string;
  partitionKey?: { topLevelSite: string };
};

const getCurrentCookieStoreId = async (): Promise<string | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const cookieStoreId = (tab as any).cookieStoreId; // Firefox only
  if (cookieStoreId) return cookieStoreId;

  const stores = await chrome.cookies.getAllCookieStores();
  return stores.find((store) => store.tabIds.includes(tab.id!))?.id;
};

const getAllCookies = async (details: CookieQueryDetails): Promise<chrome.cookies.Cookie[]> => {
  details.storeId ??= await getCurrentCookieStoreId();
  const { partitionKey, ...detailsWithoutPartitionKey } = details;

  let cookiesWithPartitionKey: chrome.cookies.Cookie[] = [];
  if (partitionKey) {
    try {
      cookiesWithPartitionKey = await chrome.cookies.getAll(details as any); // TS doesn't know about partitionKey
    } catch {
      cookiesWithPartitionKey = [];
    }
  }

  const cookies = await chrome.cookies.getAll(detailsWithoutPartitionKey);
  return [...cookies, ...cookiesWithPartitionKey];
};

declare const clients: Clients;


function formatCookies(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("Extension ID:", chrome.runtime.id);

  if (sender?.tab) {
    const storeId = (sender.tab as any).cookieStoreId;
    log(`Sender: Tab ID: ${sender.tab.id}, Incognito: ${sender.tab.incognito}, Cookie Store ID: ${storeId}`);
  }

  if (message.action === "getCookies") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab?.url) {
          log("No active tab URL found for getCookies");
          sendResponse({ cookieString: "" });
          return;
        }

        const url = new URL(tab.url);
        const cookies = await getAllCookies({
          url: url.href,
          partitionKey: { topLevelSite: url.origin },
        });

        const cookieString = formatCookies(cookies);
        log("Fetched cookies (partial):", cookieString.substring(0, 100) + "...");
        sendResponse({ cookieString });
      } catch (error: any) {
        const errorMessage = `Failed to get cookies: ${error?.name || "Error"} - ${error?.message || String(error)}`;
        log(errorMessage);
        sendResponse({ error: errorMessage, cookieString: "" });
      }
    })();
    return true;
  }

  if (message.action === "downloadSigned") {
    log("Starting 'downloadSigned'", message);
    (async () => {
      try {
        const zip = new JSZip();
        const totalTracks = message.tracks?.length ?? 0;
        let downloadedCount = 0;

        log(`Tracks to download: ${totalTracks}`);
        if (totalTracks === 0) {
          const err = "No tracks to download.";
          log(err);
          sendResponse({ error: err });
          return;
        }

        for (const track of message.tracks) {
          log(`Downloading track: ${track.filename}`);
          
          const maxRetries = 3;
          let attempt = 0;
          let success = false;

          while (attempt < maxRetries && !success) {
            attempt++;
            try {
              const response = await fetch(track.signedUrl);
              log(`Fetch response for ${track.filename}: status ${response.status} (attempt ${attempt})`);
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              const blob = await response.blob();
              log(`Blob received for ${track.filename}, size: ${blob.size}`);
              zip.file(track.filename, blob);
              downloadedCount++;
              log(`Track ${track.filename} added to ZIP (${downloadedCount}/${totalTracks})`);

              await sendMessageToActiveTab({
                action: "progress",
                progress: (downloadedCount / totalTracks) * 100,
              });
              success = true;
            } catch (trackError: any) {
              log(`Attempt ${attempt} failed for ${track.filename}: ${trackError.message}`);
              if (attempt >= maxRetries) {
                const errMsg = `Failed to download ${track.filename} after ${maxRetries} attempts: ${trackError.name || "Error"} - ${trackError.message || trackError}`;
                log(errMsg);
                sendResponse({ error: errMsg });
                return;
              }
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
          }
        }

        log("All tracks downloaded. Zipping...");
        await sendMessageToActiveTab({ action: "status", status: "Creating archive..." });

        const contentBlob = await zip.generateAsync({ type: "blob" });

        const url = chrome.runtime.getURL("html/offscreen.html");
        const existingContexts = await chrome.runtime.getContexts({});
        const offscreenDocument = existingContexts.find(c => c.contextType === "OFFSCREEN_DOCUMENT");

        if (!offscreenDocument) {
          try {
            await chrome.offscreen.createDocument({
              url,
              reasons: ["BLOBS"],
              justification: "Used to stream ZIP blob from offscreen context",
            });
          } catch (err: any) {
            if (!err.message?.startsWith("Only a single offscreen")) throw err;
          }
        } else {
          log("Using existing offscreen document.");
        }
        await sendMessageToActiveTab({ action: "clear-status" });
        const client = (
          await clients.matchAll({ includeUncontrolled: true })
        ).find(c => c.url === url);

        log("Offscreen client:", client?.url);
        const mc = new MessageChannel();
        client?.postMessage(
          {
            blob: contentBlob,
            archiveName: message.albumName || "downloaded_tracks.zip",
          },
          [mc.port2]
        );
        await new Promise((resolve) => (mc.port1.onmessage = resolve));
      } catch (error: any) {
        log("Global error in 'downloadSigned':", error);

        try {
          sendResponse({ error: "Critical error during download." });
        } catch (e) {
          log("Error while sending error response:", e);
        }

        try {
          await sendMessageToActiveTab({
            action: "error",
            error: "A critical error occurred during download.",
          });
        } catch (e) {
          log("Failed to notify tab of critical error:", e);
        }
      }
    })();
    return true;
  }
  if (message.action == "remove") {
    ( async () => {
      await sendMessageToActiveTab(message);
    })()
  }
});