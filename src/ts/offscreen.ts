import { sendMessageToActiveTab } from "./utils";

navigator.serviceWorker.onmessage = async (e: MessageEvent) => {
    const event = e.data as {blob: Blob, archiveName: string};
    await downloadBlob(event.blob, event.archiveName);
}


async function downloadBlob(blob: Blob, archiveName: string): Promise<void> {
    const blobUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = blobUrl;
    downloadLink.download = `${archiveName}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);
    // await sendMessageToActiveTab({ action: "status", status: "Creating archive..." });
    chrome.runtime.sendMessage({ action: "remove" });
}