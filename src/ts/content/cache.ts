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

// Get all data from cache
async function getCache(): Promise<Record<string, any[]>> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return result[CACHE_KEY] || {};
  } catch (e) {
    console.error("[Untitled Downloader] Error reading from chrome.storage:", e);
    return {};
  }
}

// Save all data to cache
async function setCache(data: Record<string, any[]>): Promise<void> {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: data });
  } catch (e) {
    console.error("[Untitled Downloader] Error writing to chrome.storage:", e);
  }
}

// Get tracks for a specific album (URL)
async function getAlbum(url: string): Promise<any[] | null> {
  const cacheData = await getCache();
  const tracks = cacheData[url];
  if (tracks) {
    console.log("[Untitled Downloader] Got tracks from cache for", url, ":", tracks);
  }
  return tracks || null;
}

// Save tracks for a specific album (URL)
async function setAlbum(url: string, tracks: any[]): Promise<void> {
  const cacheData = await getCache();
  cacheData[url] = tracks;
  console.log("[Untitled Downloader] Saving tracks to cache for", url, ":", tracks);
  await setCache(cacheData);
}

export const cache = {
  getAlbum,
  setAlbum,
};