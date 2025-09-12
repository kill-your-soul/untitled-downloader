export function initObserver(callback: (data: any) => void) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const url = entry.name;
      const decoded = decodeURIComponent(url);

      if (decoded.includes("_data=routes/library.project.$projectSlug")) {
        console.log("[Untitled Downloader] Обнаружен проектный запрос:", decoded);

        fetch(url, { credentials: "include" })
          .then(async (res) => {
            if (!res.ok) return;
            const json = await res.json().catch(() => null);
            if (json) {
              callback(json);
            }
          })
          .catch((err) => {
            console.log("[Untitled Downloader] Ошибка запроса:", err);
          });
      }
    }
  });

  observer.observe({ type: "resource", buffered: true });
}