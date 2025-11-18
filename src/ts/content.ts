// import { cache } from "./content/cache";
// import { createDownloadButton, removeDownloadButton, updateProgress, resetButtonState, showStatus } from "./content/dom";
// import { initObserver } from "./content/observer";

// console.log("[Untitled Downloader] content.js инициализирован");

// interface TrackData {
//   tracks: any[];
//   albumName: string;
// }

// let currentTrackData: TrackData | null = null;

// function main() {
//   initObserver(handleTrackData);
//   setupUrlChangeHandlers();
//   setupMessageListener();
//   handleUrlChange();
// }

// function handleTrackData(json: any) {
//   const tracks = json?.project?.tracks;
//   const albumName = json?.project?.project?.title || "Unknown Album";

//   if (!Array.isArray(tracks) || tracks.length === 0) {
//     return;
//   }

//   currentTrackData = { tracks, albumName };
//   cache.setAlbum(window.location.href, tracks);
  
//   // Если мы на странице проекта, сразу вставляем кнопку
//   if (window.location.href.includes('/library/project/')) {
//     insertButtonForCurrentPage();
//   }
// }

// function insertButtonForCurrentPage() {
//     const targetElement = document.querySelector("div.shadow-cd.w-full");
//     if (targetElement && currentTrackData) {
//         createDownloadButton(currentTrackData.tracks, currentTrackData.albumName, targetElement);
//     }
// }

// function resetState() {
//   console.log("[Untitled Downloader] Сброс состояния");
//   removeDownloadButton();
//   currentTrackData = null;
// }

// function handleUrlChange() {
//   console.log("[Untitled Downloader] Обработка изменения URL:", window.location.href);
//   resetState();
  
//   const cachedTracks = cache.getAlbum(window.location.href);
//   if (cachedTracks) {
//     console.log("[Untitled Downloader] Используем кешированные треки");
//     // Нам нужно получить название альбома, которого нет в кеше треков.
//     // Пока просто сохраняем треки, `handleTrackData` должен будет обновить и название.
//     currentTrackData = { tracks: cachedTracks, albumName: "Unknown Album" };
//     insertButtonForCurrentPage();
//   }
// }

// function setupUrlChangeHandlers() {
//   window.addEventListener("popstate", handleUrlChange);

//   const originalPushState = history.pushState;
//   history.pushState = function (...args) {
//     originalPushState.apply(this, args);
//     handleUrlChange();
//   };

//   const originalReplaceState = history.replaceState;
//   history.replaceState = function (...args) {
//     originalReplaceState.apply(this, args);
//     handleUrlChange();
//   };
// }

// function setupMessageListener() {
//     chrome.runtime.onMessage.addListener((message) => {
//         if (message.action === "progress") {
//             updateProgress(message.progress);
//         } else if (message.action === "error") {
//             console.log("[Untitled Downloader] Ошибка при скачивании:", message.error);
//             resetButtonState();
//         } else if (message.action === "status") {
//             showStatus(message.status);
//         }
//     });
// }

// main();

import { cache } from "./content/cache";
import { createDownloadButton, removeDownloadButton, updateProgress, resetButtonState, showStatus, clearStatus } from "./content/dom";
import { initObserver } from "./content/observer";

console.log("[Untitled Downloader] content.ts initialized");

interface TrackData {
  tracks: any[];
  albumName: string;
}

let currentTrackData: TrackData | null = null;

function main() {
  initObserver(handleTrackData);
  setupUrlChangeHandlers();
  setupMessageListener();
  handleUrlChange();
}

async function handleTrackData(json: any) {
  const tracks = json?.project?.tracks;
  const albumName = json?.project?.project?.title || "Unknown Album";

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return;
  }

  currentTrackData = { tracks, albumName };
  await cache.setAlbum(window.location.href, tracks);
  
  // Если мы на странице проекта, сразу вставляем кнопку
  if (window.location.href.includes('/library/project/')) {
    insertButtonForCurrentPage();
  }
}

function insertButtonForCurrentPage() {
    const targetElement = document.querySelector("div.shadow-cd.w-full");
    if (targetElement && currentTrackData) {
        createDownloadButton(currentTrackData.tracks, currentTrackData.albumName, targetElement);
    }
}

function resetState() {
  console.log("[Untitled Downloader] Сброс состояния");
  removeDownloadButton();
  currentTrackData = null;
}

async function handleUrlChange() {
  console.log("[Untitled Downloader] Обработка изменения URL:", window.location.href);
  resetState();
  
  const cachedTracks = await cache.getAlbum(window.location.href);
  if (cachedTracks) {
    console.log("[Untitled Downloader] Используем кешированные треки");
    // Нам нужно получить название альбома, которого нет в кеше треков.
    // Пока просто сохраняем треки, `handleTrackData` должен будет обновить и название.
    currentTrackData = { tracks: cachedTracks, albumName: "Unknown Album" };
    insertButtonForCurrentPage();
  }
}

function setupUrlChangeHandlers() {
  window.addEventListener("popstate", handleUrlChange);

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleUrlChange();
  };
}

function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "progress") {
            updateProgress(message.progress);
        } else if (message.action === "error") {
            console.error("[Untitled Downloader] Ошибка при скачивании:", message.error);
            resetButtonState();
        } else if (message.action === "status") {
            showStatus(message.status);
        } else if (message.action === "clear-status") {
            clearStatus();
        }
    });
}

main();