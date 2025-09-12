// const CACHE_KEY = "untitled_albums_cache";

// interface CacheData {
//   [url: string]: any[];
// }

// export const cache = {
//   get: (): CacheData => {
//     try {
//       const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
//       return data;
//     } catch (e) {
//       console.log("[Untitled Downloader] Ошибка чтения кеша:", e);
//       return {};
//     }
//   },
//   set: (data: CacheData) => {
//     try {
//       localStorage.setItem(CACHE_KEY, JSON.stringify(data));
//     } catch (e) {
//       console.log("[Untitled Downloader] Ошибка записи в кеш:", e);
//     }
//   },
//   getAlbum: (url: string): any[] | null => {
//     const cacheData = cache.get();
//     return cacheData[url] || null;
//   },
//   setAlbum: (url: string, tracks: any[]) => {
//     const cacheData = cache.get();
//     cacheData[url] = tracks;
//     cache.set(cacheData);
//   },
// };

const CACHE_KEY = "untitled_albums_cache";

// Получить все данные из кеша
async function getCache(): Promise<Record<string, any[]>> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return result[CACHE_KEY] || {};
  } catch (e) {
    console.error("[Untitled Downloader] Ошибка чтения из chrome.storage:", e);
    return {};
  }
}

// Записать все данные в кеш
async function setCache(data: Record<string, any[]>): Promise<void> {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: data });
  } catch (e) {
    console.error("[Untitled Downloader] Ошибка записи в chrome.storage:", e);
  }
}

// Получить треки для конкретного альбома (URL)
async function getAlbum(url: string): Promise<any[] | null> {
  const cacheData = await getCache();
  const tracks = cacheData[url];
  if (tracks) {
    console.log("[Untitled Downloader] Получены треки из кеша для", url, ":", tracks);
  }
  return tracks || null;
}

// Сохранить треки для конкретного альбома (URL)
async function setAlbum(url: string, tracks: any[]): Promise<void> {
  const cacheData = await getCache();
  cacheData[url] = tracks;
  console.log("[Untitled Downloader] Сохраняем треки в кеш для", url, ":", tracks);
  await setCache(cacheData);
}

export const cache = {
  getAlbum,
  setAlbum,
};