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
        const match = track.audio_url.match(
          /private-audio\/(.+\.(mp3|m4a|wav|flac|aac|ogg|wma|alac|aiff|opus))$/i
        );
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "status") {
      // Покажите статус пользователю (например, в элементе на странице)
      showStatus(message.status);
    }
    if (message.action === "remove") {
      hideStatus();
    }
  });

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
  function hideStatus() {
    const statusDiv = document.getElementById("untitled-downloader-status");
    if (statusDiv) {
      statusDiv.remove();
    }
  }
})();
