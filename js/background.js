// Подключаем JSZip
importScripts("jszip.min.js");

/**
 * Get the current cookie store ID.
 * @returns {Promise<string | undefined>}
 */
const getCurrentCookieStoreId = async () => {
  // If the extension is in split incognito mode, return undefined to choose the default store.
  if (chrome.runtime.getManifest().incognito === "split") return undefined;

  // Firefox supports the `tab.cookieStoreId` property.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.cookieStoreId) return tab.cookieStoreId;

  // Chrome does not support the `tab.cookieStoreId` property.
  const stores = await chrome.cookies.getAllCookieStores();
  return stores.find((store) => store.tabIds.includes(tab.id))?.id;
};

async function getAllCookies(details) {
  details.storeId ??= await getCurrentCookieStoreId();
  const { partitionKey, ...detailsWithoutPartitionKey } = details;
  // Error handling for browsers that do not support partitionKey, such as chrome < 119.
  // `chrome.cookies.getAll()` returns Promise but cannot directly catch() chain.
  const cookiesWithPartitionKey = partitionKey
    ? await Promise.resolve()
        .then(() => chrome.cookies.getAll(details))
        .catch(() => [])
    : [];
  const cookies = await chrome.cookies.getAll(detailsWithoutPartitionKey);
  return [...cookies, ...cookiesWithPartitionKey];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[BG КОНТЕКСТ] ID расширения: ${chrome.runtime.id}`);
  if (sender && sender.tab) {
    console.log(
      `[BG КОНТЕКСТ] Отправитель: Tab ID: ${sender.tab.id}, Инкогнито: ${sender.tab.incognito}, ID хранилища кук (если есть): ${sender.tab.cookieStoreId}`
    );
  }

  if (message.action === "getCookies") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.url) {
          console.log(
            "[Untitled Downloader] No active tab URL found for getCookies"
          );
          sendResponse({ cookieString: "" });
          return;
        }

        const url = new URL(tab.url);
        const cookies = await getAllCookies({
          url: url.href,
          partitionKey: { topLevelSite: url.origin },
        });

        const cookieString = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        console.log(
          "[Untitled Downloader] Получены куки (часть):",
          cookieString.substring(0, 100) + "..."
        );
        sendResponse({ cookieString });
      } catch (error) {
        const errorMessage = `Ошибка при получении кук: ${
          error?.name || "Error"
        } - ${error?.message || String(error)}`;
        console.log("[Untitled Downloader]", errorMessage);
        sendResponse({ error: errorMessage, cookieString: "" });
      }
    })();
    return true;
  }

  if (message.action === "downloadSigned") {
    console.log("[Untitled Downloader] Начало 'downloadSigned'", message);
    (async () => {
      try {
        const zip = new JSZip();
        let downloadedCount = 0;
        const totalTracks = message.tracks?.length ?? 0;
        console.log(
          `[Untitled Downloader] Всего треков для скачивания: ${totalTracks}`
        );

        if (totalTracks === 0) {
          const errMsg = "Нет треков для скачивания.";
          console.log("[Untitled Downloader]", errMsg);
          sendResponse({ error: errMsg });
          return;
        }

        console.log("[Untitled Downloader] Начало цикла скачивания треков...");
        for (const track of message.tracks) {
          console.log(
            `[Untitled Downloader] Скачивание трека: ${track.filename}`
          );

          // console.log(`Full track:`, track);
          try {
            const response = await fetch(track.signedUrl);
            console.log(
              `[Untitled Downloader] Ответ от fetch для ${track.filename}: status ${response.status}`
            );
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            console.log(
              `[Untitled Downloader] Blob получен для ${track.filename}, size: ${blob.size}`
            );
            zip.file(track.filename, blob);
            downloadedCount++;
            console.log(
              `[Untitled Downloader] Трек ${track.filename} добавлен в ZIP. Скачано: ${downloadedCount}/${totalTracks}`
            );

            const [progressTab] = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (progressTab?.id) {
              chrome.tabs.sendMessage(progressTab.id, {
                action: "progress",
                progress: (downloadedCount / totalTracks) * 100,
              });
            } else {
              console.warn(
                "[Untitled Downloader] Не удалось найти активную вкладку для отправки прогресса."
              );
            }
          } catch (trackError) {
            const trackErrMsg = `Ошибка при скачивании трека ${
              track.filename
            }: ${trackError?.name || "Error"} - ${
              trackError?.message || String(trackError)
            }`;
            console.log("[Untitled Downloader]", trackErrMsg);
            sendResponse({ error: trackErrMsg });
            return;
          }
        }
        console.log(
          "[Untitled Downloader] Все треки скачаны и добавлены в ZIP."
        );

        console.log("[Untitled Downloader] Начало архивирования...");
        const [statusTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (statusTab?.id) {
          chrome.tabs.sendMessage(statusTab.id, {
            action: "status",
            status: "Создаём архив...",
          });
        } else {
          console.warn(
            "[Untitled Downloader] Не удалось найти активную вкладку для статуса 'Создаём архив...'."
          );
        }

        const contentBlob = await zip.generateAsync({ type: "blob" });
        // console.log(
        //   `[Untitled Downloader] ZIP-архив (Blob) сгенерирован, blob size: ${contentBlob.size} ${contentBlob}`
        // );
        console.log(contentBlob);
        // const reader = new FileReader();
        // const url = URL.createObjectURL(contentBlob);
        // console.log(`[Untitled Downloader] URL для скачивания создан: ${url}`);
        const existingContexts = await chrome.runtime.getContexts({});
        const offscreenDocument = existingContexts.find(
          (c) => c.contextType === "OFFSCREEN_DOCUMENT"
        );
        const url = chrome.runtime.getURL("html/offscreen.html");
        console.log(
          `[Untitled Downloader] URL для offscreen документа: ${url}`
        ); 
        if (!offscreenDocument) {
          try {
            await chrome.offscreen.createDocument({
              url: url,
              reasons: ["BLOBS"],
              justification: "MV3 requirement",
            });
          } catch (err) {
            if (!err.message.startsWith("Only a single offscreen")) throw err;
          }
        } else {
          console.log(
            "[Untitled Downloader] Используется существующий offscreen документ."
          );
        }

        const client = (
          await clients.matchAll({ includeUncontrolled: true })
        ).find((c) => c.url === url);
        console.log(
          `[Untitled Downloader] Найден offscreen клиент: ${client?.url}`
        );
        const mc = new MessageChannel();
        client.postMessage({blob: contentBlob,
          archiveName: message.albumName || "downloaded_tracks.zip"}, [mc.port2]);
        const res = await new Promise((cb) => (mc.port1.onmessage = cb));

        // reader.onload = () => {
        //   const dataUrl = reader.result;

        //   chrome.downloads.download(
        //     {
        //       url: dataUrl,
        //       filename: `${message.albumName || "downloaded_tracks"}.zip`,
        //       saveAs: true,
        //     },
        //     (downloadId) => {
        //       if (chrome.runtime.lastError) {
        //         console.error(
        //           "[Untitled Downloader] Ошибка при запуске скачивания:",
        //           chrome.runtime.lastError
        //         );
        //       } else {
        //         console.log(
        //           "[Untitled Downloader] Скачивание началось. downloadId:",
        //           downloadId
        //         );
        //       }
        //     }
        //   );
        // };

        // reader.onerror = (e) => {
        //   console.error(
        //     "[Untitled Downloader] Ошибка FileReader при чтении ZIP-архива:",
        //     e
        //   );
        // };

        // reader.readAsDataURL(contentBlob);
      } catch (error) {
        console.log(
          "[Untitled Downloader] Глобальная ошибка в 'downloadSigned':",
          error.name,
          error.message,
          error.stack,
          error
        );

        try {
          sendResponse({ error: "Критическая ошибка в процессе скачивания." });
        } catch (e) {
          console.log(
            "[Untitled Downloader] Ошибка при попытке отправить ошибку через sendResponse (возможно, уже был вызван):",
            e
          );
        }

        try {
          const [errorTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (errorTab?.id) {
            chrome.tabs.sendMessage(errorTab.id, {
              action: "error",
              error:
                "Критическая ошибка в процессе скачивания на стороне расширения.",
            });
          } else {
            console.warn(
              "[Untitled Downloader] Не удалось найти активную вкладку для отправки глобальной ошибки."
            );
          }
        } catch (e) {
          console.log(
            "[Untitled Downloader] Ошибка при отправке сообщения об ошибке на вкладку:",
            e
          );
        }
      }
    })();
    return true;
  }
});
