navigator.serviceWorker.onmessage = (e: MessageEvent) => {
    const event = e.data as {blob: Blob, archiveName: string};
    downloadBlob(event.blob, event.archiveName);
}

function downloadBlob(blob: Blob, archiveName: string): void {
    const blobUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = blobUrl;
    downloadLink.download = `${archiveName}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);
}