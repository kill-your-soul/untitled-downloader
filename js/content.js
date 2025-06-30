(function () {
  console.log("[Untitled Downloader] content.js инициализирован");
  console.log(
    `[CS КОНТЕКСТ] ID расширения: ${chrome.runtime.id}, URL страницы: ${window.location.href}`
  );

  const CACHE_KEY = "untitled_albums_cache";

  // Функция для работы с кешем
  const cache = {
    get: () => {
      try {
        const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        console.log("[Untitled Downloader] Кеш получен:", data);
        return data;
      } catch (e) {
        console.log("[Untitled Downloader] Ошибка чтения кеша:", e);
        return {};
      }
    },
    set: (data) => {
      try {
        console.log("[Untitled Downloader] Сохраняем в кеш:", data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) {
        console.log("[Untitled Downloader] Ошибка записи в кеш:", e);
      }
    },
    getAlbum: (url) => {
      const cacheData = cache.get();
      const tracks = cacheData[url];
      console.log(
        "[Untitled Downloader] Получены треки из кеша для",
        url,
        ":",
        tracks
      );
      return tracks;
    },
    setAlbum: (url, tracks) => {
      const cacheData = cache.get();
      cacheData[url] = tracks;
      console.log(
        "[Untitled Downloader] Сохраняем треки в кеш для",
        url,
        ":",
        tracks
      );
      cache.set(cacheData);
    },
  };

  // Функция для очистки состояния
  function resetState() {
    console.log("[Untitled Downloader] Сброс состояния");
    window.__untitledDownloaderTracks = null;
    const existingBtn = document.getElementById("untitled-download-btn");
    if (existingBtn) {
      console.log("[Untitled Downloader] Удаляем существующую кнопку");
      existingBtn.remove();
    }
  }

  // Обработчик изменений URL
  function handleUrlChange() {
    console.log(
      "[Untitled Downloader] Обработка изменения URL:",
      window.location.href
    );
    resetState();
    const currentUrl = window.location.href;
    const cachedTracks = cache.getAlbum(currentUrl);

    if (cachedTracks) {
      console.log(
        "[Untitled Downloader] Используем кешированные треки для:",
        currentUrl
      );
      window.__untitledDownloaderTracks = cachedTracks;
      insertDownloadButton();
    } else {
      console.log(
        "[Untitled Downloader] Треки не найдены в кеше для:",
        currentUrl
      );
    }
  }

  // Отслеживаем все возможные изменения URL
  window.addEventListener("popstate", () => {
    console.log("[Untitled Downloader] Событие popstate");
    handleUrlChange();
  });

  // Отслеживаем изменения через History API
  const originalPushState = history.pushState;
  history.pushState = function () {
    console.log("[Untitled Downloader] Вызов pushState");
    originalPushState.apply(this, arguments);
    handleUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    console.log("[Untitled Downloader] Вызов replaceState");
    originalReplaceState.apply(this, arguments);
    handleUrlChange();
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const url = entry.name;
      const decoded = decodeURIComponent(url);

      if (decoded.includes("_data=routes/library.project.$projectSlug")) {
        console.log(
          "[Untitled Downloader] Обнаружен проектный запрос:",
          decoded
        );

        fetch(url, { credentials: "include" })
          .then(async (res) => {
            console.log(`[Untitled Downloader] Ответ status: ${res.status}`);
            const json = await res.json().catch((err) => {
              console.log("[Untitled Downloader] Ошибка парсинга JSON:", err);
              return null;
            });

            if (!json) return;
            handleTracks(json);
          })
          .catch((err) => {
            console.log("[Untitled Downloader] Ошибка запроса:", err);
          });
      }
    }
  });

  observer.observe({ type: "resource", buffered: true });

  function handleTracks(json) {
    console.log("[Untitled Downloader] Обработка треков:", json);
    const tracks = json?.project?.tracks;
    const albumName = json?.project?.project?.title || "Unknown Album";

    if (!Array.isArray(tracks)) {
      console.warn("[Untitled Downloader] Треки не найдены.");
      console.log("Содержимое JSON:", json);
      return;
    }

    console.log(`[Untitled Downloader] Найдено треков: ${tracks.length}`);

    tracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.title}`);
    });

    window.__untitledDownloaderTracks = tracks;
    window.__untitledDownloaderAlbumName = albumName;
    // Сохраняем треки в кеш для текущего URL страницы
    cache.setAlbum(window.location.href, tracks);
    insertDownloadButton();
  }

  // Получение подписанной ссылки для одного objectPath
  async function getSignedUrl(objectPath) {
    const cookieString = await getCookieString();
    if (!cookieString) {
      throw new Error("Не удалось получить куки");
    }

    console.log(
      "[Untitled Downloader] Получение подписанной ссылки для objectPath:",
      objectPath,
      window.location.href
    );

    const response = await fetch(
      "https://untitled.stream/api/storage/buckets/private-audio/objects/" +
        encodeURIComponent(objectPath) +
        "/signedUrl",
      {
        method: "POST",
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "content-type": "application/json",
          cookie: cookieString,
          origin: "https://untitled.stream",
          referer: window.location.href,
        },
        body: JSON.stringify({ durationInSeconds: 10800 }),
        credentials: "include",
      }
    );
    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status} text: ${response.statusText}`
      );
    }
    const data = await response.json();
    console.log("[Untitled Downloader] Получен ответ:", data);
    if (!data.url) {
      throw new Error("Ответ не содержит url");
    }

    return data.url;
  }

  // Собирает массив {signedUrl, filename}
  async function collectSignedUrls(tracks) {
    const signedTracks = [];
    for (const track of tracks) {
      console.log(
        "[Untitled Downloader] Получение подписанной ссылки для:",
        track
      );

      // Проверяем наличие URL
      if (!track.audio_url) {
        console.log("[Untitled Downloader] Трек не содержит audio_url:", track);
        continue;
      }

      try {
        const match = track.audio_url.match(/private-audio\/(.+\.(mp3|m4a|wav|flac))/);
        if (!match) {
          console.log(
            "[Untitled Downloader] Неверный формат URL:",
            track.audio_url
          );
          continue;
        }

        const objectPath = match[1];
        const signedUrl = await getSignedUrl(objectPath);

        // Используем version_title вместо filename
        if (!track.version_title) {
          console.log(
            "[Untitled Downloader] Трек не содержит version_title:",
            track
          );
          continue;
        }

        // Создаем имя файла из version_title
        // console.log(`Track: `, track);
        const filename = `${track.title}.${track.file_type || "mp3"}`;

        signedTracks.push({
          signedUrl,
          filename: filename,
        });
      } catch (error) {
        console.log(
          "[Untitled Downloader] Ошибка при получении подписанной ссылки:",
          error
        );
        continue;
      }
    }
    return signedTracks;
  }

  // Функция для скачивания трека
  // async function downloadTrack(
  //   track,
  //   zip,
  //   onProgress,
  //   totalTracks,
  //   downloadedCount
  // ) {
  //   // Извлекаем objectPath из supabase-ссылки
  //   const match = track.url.match(/private-audio\/(.+\.(mp3|m4a|wav|flac))/);
  //   const objectPath = match ? match[1] : null;
  //   if (!objectPath) throw new Error("Не удалось извлечь путь объекта из URL");

  //   const signedUrl = await getSignedUrl(objectPath);
  //   const response = await fetch(signedUrl);
  //   if (!response.ok) {
  //     throw new Error(`HTTP error! status: ${response.status}`);
  //   }
  //   const blob = await response.blob();
  //   zip.file(track.filename, blob);
  //   downloadedCount++;
  //   if (onProgress) onProgress(downloadedCount, totalTracks);
  // }

  // Основная функция скачивания альбома
  // async function downloadAlbum(tracks, onProgress) {
  //   const JSZip = await loadJSZip();
  //   const zip = new JSZip();
  //   let downloadedCount = 0;
  //   for (const track of tracks) {
  //     await downloadTrack(
  //       track,
  //       zip,
  //       onProgress,
  //       tracks.length,
  //       ++downloadedCount
  //     );
  //   }
  //   const content = await zip.generateAsync({ type: "blob" });
  //   const url = URL.createObjectURL(content);
  //   const albumName = tracks[0].filename.split(" - ")[1].split(".")[0];
  //   const a = document.createElement("a");
  //   a.href = url;
  //   a.download = `${albumName}.zip`;
  //   document.body.appendChild(a);
  //   a.click();
  //   document.body.removeChild(a);
  //   URL.revokeObjectURL(url);
  // }

  // Функция для получения кук через background.js

  // Функция для получения строки cookie
  async function getCookieString() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getCookies" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Ошибка при получении кук:", chrome.runtime.lastError);
          resolve(""); // Возвращаем пустую строку в случае ошибки
          return;
        }
        if (!response || !response.cookieString) {
          console.log("Ответ не содержит cookieString:", response);
          resolve(""); // Возвращаем пустую строку, если ответ невалидный
          return;
        }
        resolve(response.cookieString);
      });
    });
  }

  // Функция для вставки кнопки скачивания
  function insertDownloadButton() {
    const targetButton = document.querySelector(
      "div.shadow-cd.w-full"
      // body > div.relative.sm\:block.justify-start.sm\:pt-32 > div > div.short\:top-96.flex.w-full.flex-col.items-center.gap-24.sm\:sticky.sm\:top-\[calc\(var\(--header-height\)\+3\.2rem\)\].sm\:w-\[320px\].lg\:w-\[405px\]
    );

    if (!targetButton || document.getElementById("untitled-download-btn")) {
      console.log(
        "[Untitled Downloader] Кнопка уже существует или целевая кнопка не найдена"
      );
      return;
    }

    const downloadBtn = document.createElement("button");
    downloadBtn.id = "untitled-download-btn";
    downloadBtn.className =
      "btn is-secondary subhead-semibold pointer-events-auto flex h-44 w-150 items-center justify-center rounded-[12px] p-5 transition-opacity hover:opacity-80";
    // downloadBtn.style.marginRight = "12px";

    // Создаем h3
    const title = document.createElement("h3");
    title.className = "body-semibold mr-12 line-clamp-1 text-left break-all";
    title.textContent = "Download Album";

    downloadBtn.appendChild(title);

    const wrapper = document.createElement("div");
    wrapper.className = "relative mb-12";
    wrapper.style.opacity = "1";
    wrapper.style.transform = "none";
    wrapper.appendChild(downloadBtn);

    // Создаем контейнер для прогресс-бара
    const progressContainer = document.createElement("div");
    progressContainer.id = "untitled-download-progress";
    progressContainer.style.display = "none";
    progressContainer.style.marginTop = "10px";
    progressContainer.style.width = "100%";
    progressContainer.style.backgroundColor = "#eee";
    progressContainer.style.borderRadius = "4px";
    progressContainer.style.overflow = "hidden";

    const progressBar = document.createElement("div");
    progressBar.style.width = "0%";
    progressBar.style.height = "4px";
    progressBar.style.backgroundColor = "#4CAF50";
    progressBar.style.transition = "width 0.3s ease";
    progressContainer.appendChild(progressBar);

    downloadBtn.addEventListener("click", async () => {
      console.log("[Untitled Downloader] Кнопка скачивания нажата");
      if (window.__untitledDownloaderTracks) {
        try {
          progressContainer.style.display = "block";
          downloadBtn.disabled = true;
          downloadBtn.style.opacity = "0.5";

          const signedTracks = await collectSignedUrls(
            window.__untitledDownloaderTracks
          );
          console.log(
            "[Untitled Downloader] Отправляем сообщение для скачивания подписанных треков:",
            signedTracks
          );

          // Получаем название альбома из первого трека
          const albumName = window.__untitledDownloaderAlbumName;
          console.log(albumName);

          chrome.runtime.sendMessage({
            action: "downloadSigned",
            tracks: signedTracks,
            albumName: albumName,
          });
        } catch (error) {
          console.log(
            "[Untitled Downloader] Ошибка при отправке сообщения:",
            error
          );
          if (error.message.includes("Extension context invalidated")) {
            // Если расширение было перезагружено, перезагружаем страницу
            window.location.reload();
          } else {
            // В случае других ошибок, разблокируем кнопку и скрываем прогресс-бар
            downloadBtn.disabled = false;
            downloadBtn.style.opacity = "1";
            progressContainer.style.display = "none";
            progressBar.style.width = "0%";
          }
        }
      } else {
        console.warn("[Untitled Downloader] Треки ещё не загружены.");
      }
    });

    // targetButton.parentElement.insertBefore(downloadBtn, targetButton);
    targetButton.appendChild(wrapper);
    targetButton.parentElement.insertBefore(
      progressContainer,
      targetButton.nextSibling
    );

    // Слушаем сообщения о прогрессе
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "progress") {
        const progressBar = document.querySelector(
          "#untitled-download-progress div"
        );
        if (progressBar) {
          progressBar.style.width = `${message.progress}%`;

          if (message.progress === 100) {
            setTimeout(() => {
              const progressContainer = document.getElementById(
                "untitled-download-progress"
              );
              const downloadBtn = document.getElementById(
                "untitled-download-btn"
              );
              if (progressContainer) progressContainer.style.display = "none";
              if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.style.opacity = "1";
              }
            }, 1000);
          }
        }
      } else if (message.action === "error") {
        // Access message.error.message
        const displayErrorMessage =
          message.error?.message || "Произошла неизвестная ошибка.";
        console.log(
          "[Untitled Downloader] Ошибка при скачивании:",
          displayErrorMessage
        );
        // Potentially display message.error.name as well
        // alert("Ошибка: " + displayErrorMessage);
        const progressContainer = document.getElementById(
          "untitled-download-progress"
        );
        const downloadBtn = document.getElementById("untitled-download-btn");
        if (progressContainer) progressContainer.style.display = "none";
        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.style.opacity = "1";
        }
      }
    });
  }

  // Инициализация при первой загрузке
  console.log("[Untitled Downloader] Инициализация при первой загрузке");
  handleUrlChange();

  // function loadJSZip() {
  //   return new Promise((resolve, reject) => {
  //     if (window.JSZip) return resolve(window.JSZip);
  //     const script = document.createElement("script");
  //     script.src = chrome.runtime.getURL("jszip.min.js");
  //     script.onload = () => resolve(window.JSZip);
  //     script.onerror = reject;
  //     document.head.appendChild(script);
  //   });
  // }

  // Добавьте этот обработчик в content.js
  // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //   if (message.action === "downloadZip") {
  //     console.log(message);
  //     console.log("[Untitled Downloader] Скачивание ZIP запущено");
  //     const blob = message.data;
  //     console.log(blob);
  //     const albumName = message.albumName || "downloaded_tracks.zip";

  //     const url = URL.createObjectURL(blob);
  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = albumName;
  //     a.style.display = "none";
  //     document.body.appendChild(a);
  //     a.click();
  //     a.remove();
  //     URL.revokeObjectURL(url);
  //   }
  // });

  // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //   if (message.action === "downloadZipReady") {
  //     console.log(
  //       "[Untitled Downloader] Получено сообщение о готовности к скачиванию ZIP"
  //     );
  //     chrome.storage.local.get(
  //       ["zipBuffer", "albumName"],
  //       ({ zipBuffer, albumName }) => {
  //         if (!zipBuffer) return;
  //         const blob = new Blob([new Uint8Array(zipBuffer)], {
  //           type: "application/zip",
  //         });
  //         const url = URL.createObjectURL(blob);
  //         const a = document.createElement("a");
  //         a.href = url;
  //         a.download = `${albumName || "downloaded_tracks"}.zip`;
  //         document.body.appendChild(a);
  //         a.click();
  //         setTimeout(() => {
  //           URL.revokeObjectURL(url);
  //           a.remove();
  //           chrome.storage.local.remove(["zipBuffer", "albumName"]);
  //         }, 1000);
  //       }
  //     );
  //   }
  // });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "status") {
      // Покажите статус пользователю (например, в элементе на странице)
      showStatus(message.status);
    }
  });

  // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //   if (message.action === "initiateDownloadFromStorage") {
  //     console.log(
  //       "[Untitled Downloader CS] Получен сигнал 'initiateDownloadFromStorage'. Загрузка из chrome.storage.local..."
  //     );
  //     chrome.storage.local.get(
  //       ["zipArrayBufferForDownload", "albumNameForDownload"],
  //       (data) => {
  //         if (chrome.runtime.lastError) {
  //           const errMsg = `Ошибка при получении данных из storage: ${chrome.runtime.lastError.message}`;
  //           console.log("[Untitled Downloader CS]", errMsg);
  //           alert(errMsg);
  //           // Возможно, отправить сообщение об ошибке обратно в background или обновить UI
  //           return;
  //         }
  //         if (!data.zipArrayBufferForDownload || !data.albumNameForDownload) {
  //           const errMsg =
  //             "Архив или имя альбома не найдены во временном хранилище.";
  //           console.log("[Untitled Downloader CS]", errMsg, data);
  //           alert(errMsg);
  //           return;
  //         }

  //         console.log(
  //           `[Untitled Downloader CS] Получен ArrayBuffer (size: ${data.zipArrayBufferForDownload.byteLength}) и имя альбома: ${data.albumNameForDownload}`
  //         );
  //         try {
  //           const blob = new Blob([data.zipArrayBufferForDownload], {
  //             type: "application/zip",
  //           });
  //           const url = URL.createObjectURL(blob);
  //           const a = document.createElement("a");
  //           a.href = url;
  //           a.download = `${data.albumNameForDownload}.zip`;
  //           document.body.appendChild(a);
  //           console.log(
  //             "[Untitled Downloader CS] Инициирование клика по ссылке для скачивания."
  //           );
  //           a.click();
  //           console.log(
  //             "[Untitled Downloader CS] Клик по ссылке для скачивания выполнен."
  //           );

  //           // Очистка
  //           setTimeout(() => {
  //             if (a.parentElement) {
  //               document.body.removeChild(a);
  //             }
  //             URL.revokeObjectURL(url);
  //             chrome.storage.local.remove(
  //               ["zipArrayBufferForDownload", "albumNameForDownload"],
  //               () => {
  //                 if (chrome.runtime.lastError) {
  //                   console.log(
  //                     "[Untitled Downloader CS] Ошибка при очистке storage:",
  //                     chrome.runtime.lastError.message
  //                   );
  //                 } else {
  //                   console.log("[Untitled Downloader CS] Storage очищен.");
  //                 }
  //               }
  //             );
  //           }, 200);
  //         } catch (e) {
  //           const errMsg = `Ошибка в content.js при создании Blob или скачивании: ${e.message}`;
  //           console.log("[Untitled Downloader CS]", errMsg, e);
  //           alert(errMsg);
  //         }
  //       }
  //     );
  //     // Для этого сообщения content script не отправляет ответ, поэтому return true не нужен.
  //   } else if (message.action === "initiateDownloadFromIndexedDB") {
  //     console.log(
  //       "[Untitled Downloader CS] Получен сигнал 'initiateDownloadFromIndexedDB'."
  //     );
  //     const dbName = "FileStorageDB";
  //     const storeName = "zipFiles";
  //     const fileKey = "currentZipFile";

  //     console.log(
  //       `[Untitled Downloader CS] Попытка открытия IndexedDB: ${dbName}, версия: 1`
  //     );
  //     const openRequest = indexedDB.open(dbName, 1);

  //     // openRequest.onupgradeneeded = function(event) {
  //     //     console.log("[Untitled Downloader CS] onupgradeneeded FIRED.");
  //     //     const db = event.target.result;
  //     //     const transaction = event.target.transaction;
  //     //     console.log(`[Untitled Downloader CS] Текущие object store names в onupgradeneeded: ${Array.from(db.objectStoreNames).join(', ')}`);
  //     //     if (!db.objectStoreNames.contains(storeName)) {
  //     //         try {
  //     //             console.log(`[Untitled Downloader CS] Создание object store: ${storeName}`);
  //     //             db.createObjectStore(storeName);
  //     //             console.log(`[Untitled Downloader CS] Object store ${storeName} успешно ЗАПРОШЕН к созданию в onupgradeneeded.`);
  //     //         } catch (e) {
  //     //             console.log(`[Untitled Downloader CS] ОШИБКА при вызове createObjectStore '${storeName}':`, e);
  //     //             if (transaction) transaction.abort();
  //     //         }
  //     //     } else {
  //     //         console.log(`[Untitled Downloader CS] Object store ${storeName} уже существует в onupgradeneeded.`);
  //     //     }
  //     //     if (transaction) {
  //     //         transaction.oncomplete = () => console.log("[Untitled Downloader CS] Транзакция onupgradeneeded ЗАВЕРШЕНА.");
  //     //         transaction.onerror = (e) => console.log("[Untitled Downloader CS] ОШИБКА транзакции onupgradeneeded:", e.target.error);
  //     //         transaction.onabort = (e) => console.warn("[Untitled Downloader CS] Транзакция onupgradeneeded ПРЕРВАНА:", e.target.error);
  //     //     }
  //     // };

  //     openRequest.onerror = function (event) {
  //       console.log(
  //         "[Untitled Downloader CS] Ошибка ОТКРЫТИЯ IndexedDB:",
  //         event.target.error
  //       );
  //       alert(
  //         "Ошибка: не удалось получить доступ к временному хранилищу файлов (IndexedDB)."
  //       );
  //     };

  //     openRequest.onsuccess = function (event) {
  //       console.log(
  //         "[Untitled Downloader CS] IndexedDB успешно открыта (onsuccess)."
  //       );
  //       const db = event.target.result;

  //       console.log(
  //         `[Untitled Downloader CS] Версия базы данных при открытии: ${db.version}`
  //       );
  //       const storeNamesFound = Array.from(db.objectStoreNames);
  //       console.log(
  //         `[Untitled Downloader CS] Доступные object store names в onsuccess: ${
  //           storeNamesFound.join(", ") || "(пусто)"
  //         }`
  //       );

  //       if (!storeNamesFound.includes(storeName)) {
  //         console.log(
  //           `[Untitled Downloader CS] КРИТИЧЕСКАЯ ОШИБКА: Object store '${storeName}' НЕ НАЙДЕН в onsuccess. Имеющиеся сторы: [${storeNamesFound.join(
  //             ", "
  //           )}]. Попробуйте полностью перезагрузить расширение и страницу, или удалить IndexedDB вручную.`
  //         );
  //         alert(
  //           `Критическая ошибка: Хранилище файлов '${storeName}' не найдено. Это может потребовать перезагрузки расширения или очистки данных сайта.`
  //         );
  //         db.close();
  //         return;
  //       }

  //       console.log(
  //         `[Untitled Downloader CS] Попытка начать транзакцию для '${storeName}'.`
  //       );
  //       try {
  //         const transaction = db.transaction(storeName, "readonly");
  //         const store = transaction.objectStore(storeName);

  //         // Attempt to read DEBUG entry
  //         const getDebugRequest = store.get("debugTestEntry_background");
  //         getDebugRequest.onsuccess = function (debugEvent) {
  //           console.log(
  //             "[Untitled Downloader CS] DEBUG: Результат getRequest для 'debugTestEntry_background':",
  //             debugEvent.target.result
  //           );
  //         };
  //         getDebugRequest.onerror = function (debugErrEvent) {
  //           console.error(
  //             "[Untitled Downloader CS] DEBUG: Ошибка чтения 'debugTestEntry_background':",
  //             debugErrEvent.target.error
  //           );
  //         };

  //         // Attempt to read MAIN entry (currentZipFile)
  //         const getMainRequest = store.get("currentZipFile"); // Your original fileKey
  //         getMainRequest.onsuccess = function (mainEvent) {
  //           const storedData = mainEvent.target.result;
  //           console.log(
  //             "[Untitled Downloader CS] Результат getRequest для 'currentZipFile':",
  //             storedData
  //           );
  //           if (storedData && storedData.arrayBuffer) {
  //             // ... process main data
  //           } else {
  //             console.error(
  //               "[Untitled Downloader CS] Данные 'currentZipFile' не найдены или неверный формат."
  //             );
  //           }
  //         };
  //         getMainRequest.onerror = function (mainErrEvent) {
  //           console.error(
  //             "[Untitled Downloader CS] Ошибка чтения 'currentZipFile':",
  //             mainErrEvent.target.error
  //           );
  //         };

  //         transaction.oncomplete = function () {
  //           console.log("[Untitled Downloader CS] Read transaction completed.");
  //           // db.close(); // Close db after all reads are done or in their individual handlers
  //         };
  //         transaction.onerror = function () {
  //           console.error("[Untitled Downloader CS] Read transaction error.");
  //           // db.close();
  //         };
  //       } catch (e) {
  //         console.error(
  //           "[Untitled Downloader CS] Error creating read transaction:",
  //           e
  //         );
  //         // db.close();
  //       }
  //     };
  //   } else if (message.action === "error") {
  //     const displayErrorMessage =
  //       typeof message.error === "string"
  //         ? message.error
  //         : message.error?.message || "Произошла неизвестная ошибка.";
  //     console.log(
  //       "[Untitled Downloader CS] Получена ошибка от background:",
  //       displayErrorMessage
  //     );
  //     alert("Ошибка скачивания: " + displayErrorMessage);
  //     // Сброс UI, если необходимо
  //     const progressContainerEl = document.getElementById(
  //       "untitled-download-progress"
  //     );
  //     const downloadBtnEl = document.getElementById("untitled-download-btn");
  //     if (progressContainerEl) progressContainerEl.style.display = "none";
  //     if (downloadBtnEl) {
  //       downloadBtnEl.disabled = false;
  //       downloadBtnEl.style =
  //         "btn is-secondary subhead-semibold pointer-events-auto flex h-44 w-100 items-center justify-center rounded-[16px] p-0 transition-opacity hover:opacity-80";
  //     }
  //   }
  // });

  function showStatus(text) {
    let statusDiv = document.getElementById("untitled-downloader-status");
    if (!statusDiv) {
      statusDiv = document.createElement("div");
      statusDiv.id = "untitled-downloader-status";
      statusDiv.style.position = "fixed";
      statusDiv.style.bottom = "20px";
      statusDiv.style.right = "20px";
      statusDiv.style.background = "rgba(0,0,0,0.8)";
      statusDiv.style.color = "#fff";
      statusDiv.style.padding = "10px 20px";
      statusDiv.style.borderRadius = "8px";
      statusDiv.style.zIndex = 99999;
      document.body.appendChild(statusDiv);
    }
    statusDiv.textContent = text;
  }
})();

// const receivedChunks = [];
// let totalChunksExpected = 0;
// let filename = "downloaded.zip";

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "blob-chunk") {
//     console.log(
//       `[Content] Получен чанк ${message.index + 1}/${message.totalChunks}`
//     );
//     receivedChunks[message.index] = message.buffer;
//     totalChunksExpected = message.totalChunks;
//     filename = message.filename || filename;
//   }

//   if (message.action === "blob-done") {
//     console.log("[Content] Все чанки получены, собираем Blob...");
//     const blob = new Blob(receivedChunks, { type: "application/zip" });
//     сonsole.log("[Content] Blob собран, размер:", blob.size);
//     const url = URL.createObjectURL(blob);

//     const a = document.createElement("a");
//     a.href = url;
//     a.download = filename;
//     a.style.display = "none";
//     document.body.appendChild(a);
//     a.click();
//     document.body.removeChild(a);

//     console.log("[Content] Файл сохранён:", filename);
//   }
// });
