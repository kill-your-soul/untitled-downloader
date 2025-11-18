// import { getCookieString } from "../utils";

// async function getSignedUrl(objectPath: string): Promise<string> {
//   const cookieString = await getCookieString();
//   if (!cookieString) {
//     throw new Error("Не удалось получить куки");
//   }

//   const response = await fetch(
//     "https://untitled.stream/api/storage/buckets/private-audio/objects/" +
//       encodeURIComponent(objectPath) +
//       "/signedUrl",
//     {
//       method: "POST",
//       headers: {
//         accept: "*/*",
//         "accept-language": "en-US,en;q=0.9",
//         "content-type": "application/json",
//         cookie: cookieString,
//         origin: "https://untitled.stream",
//         referer: window.location.href,
//       },
//       body: JSON.stringify({ durationInSeconds: 10800 }),
//       credentials: "include",
//     }
//   );

//   if (!response.ok) {
//     throw new Error(`HTTP error! status: ${response.status}`);
//   }
//   const data = await response.json();
//   if (!data.url) {
//     throw new Error("Ответ не содержит url");
//   }
//   return data.url;
// }

// export async function collectSignedUrls(tracks: any[]): Promise<{ signedUrl: string; filename: string }[]> {
//   const signedTracks = [];
//   for (const track of tracks) {
//     if (!track.audio_url) {
//       console.log("[Untitled Downloader] Трек не содержит audio_url:", track);
//       continue;
//     }

//     try {
//       const match = track.audio_url.match(/private-audio\/(.+\.(mp3|m4a|wav|flac|aac|ogg|wma|alac|aiff|opus))$/i);
//       if (!match) {
//         console.log("[Untitled Downloader] Неверный формат URL:", track.audio_url);
//         continue;
//       }

//       const objectPath = match[1];
//       const signedUrl = await getSignedUrl(objectPath);
//       const filename = `${track.title}.${track.file_type || "mp3"}`;

//       signedTracks.push({ signedUrl, filename });
//     } catch (error) {
//       console.log("[Untitled Downloader] Ошибка при получении подписанной ссылки:", error);
//       continue;
//     }
//   }
//   return signedTracks;
// }

import { getCookieString } from "../utils";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function getSignedUrl(objectPath: string): Promise<string> {
  const cookieString = await getCookieString();
  if (!cookieString) {
    throw new Error("Failed to get cookies");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
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

      if (response.ok) {
        const data = await response.json();
        if (!data.url) {
          throw new Error("Response does not contain url");
        }
        return data.url;
      }

      if (response.status === 504 && attempt < MAX_RETRIES) {
        console.warn(`[Untitled Downloader] Attempt ${attempt}: Error 504 (Gateway Timeout). Retrying in ${RETRY_DELAY} ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }

      throw new Error(`HTTP error! status: ${response.status}`);

    } catch (error) {
      console.error(`[Untitled Downloader] Error getting signedUrl (attempt ${attempt}):`, error);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        throw error; // Rethrow error after last attempt
      }
    }
  }
  throw new Error("Failed to get signed URL after multiple attempts.");
}

export async function collectSignedUrls(tracks: any[]): Promise<{ signedUrl: string; filename: string }[]> {
  const signedTracks = [];
  for (const track of tracks) {
    if (!track.audio_url) {
      console.warn("[Untitled Downloader] Track does not contain audio_url:", track);
      continue;
    }

    try {
      const match = track.audio_url.match(/private-audio\/(.+\.(mp3|m4a|wav|flac|aac|ogg|wma|alac|aiff|opus))$/i);
      if (!match) {
        console.warn("[Untitled Downloader] Invalid URL format:", track.audio_url);
        continue;
      }

      const objectPath = match[1];
      const signedUrl = await getSignedUrl(objectPath);
      const filename = `${track.title}.${track.file_type || "mp3"}`;

      signedTracks.push({ signedUrl, filename });
    } catch (error) {
      console.error("[Untitled Downloader] Error getting signed URL for track:", track.title, error);
      // Continue collecting remaining tracks, even if one fails
      continue;
    }
  }
  return signedTracks;
}