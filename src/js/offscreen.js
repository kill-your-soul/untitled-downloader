navigator.serviceWorker.onmessage = e => {
    console.log(e);
    const event = e.data;
    console.log("[Untitled Downloader] Получено сообщение от Service Worker:", event);
    downloadBlob(event.blob, event.archiveName);
}

function downloadBlob(blob, archiveName) {
  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = blobUrl;
  downloadLink.download = `${archiveName}.zip`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(blobUrl);
}
