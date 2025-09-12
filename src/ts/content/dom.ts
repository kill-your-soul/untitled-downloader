import { sendMessageToBackground } from "../utils";
import { collectSignedUrls } from "./api";

let downloadBtn: HTMLButtonElement | null = null;
let progressContainer: HTMLDivElement | null = null;
let progressBar: HTMLDivElement | null = null;

export function createDownloadButton(
  tracks: any[],
  albumName: string,
  targetElement: Element
) {
  if (document.getElementById("untitled-download-btn")) {
    return;
  }

  downloadBtn = document.createElement("button");
  downloadBtn.id = "untitled-download-btn";
  downloadBtn.className =
    "btn is-secondary subhead-semibold pointer-events-auto flex h-44 w-150 items-center justify-center rounded-[12px] p-5 transition-opacity hover:opacity-80";

  const title = document.createElement("h3");
  title.className = "body-semibold mr-12 line-clamp-1 text-left break-all";
  title.textContent = "Download Album";
  downloadBtn.appendChild(title);

  const wrapper = document.createElement("div");
  wrapper.className = "relative mb-12";
  wrapper.style.opacity = "1";
  wrapper.style.transform = "none";
  wrapper.appendChild(downloadBtn);

  createProgressBar(targetElement);

  downloadBtn.addEventListener("click", async () => {
    if (tracks) {
      try {
        if (progressContainer) progressContainer.style.display = "block";
        if (downloadBtn) {
          downloadBtn.disabled = true;
          downloadBtn.style.opacity = "0.5";
        }

        const signedTracks = await collectSignedUrls(tracks);
        console.log(
          "[Untitled Downloader] Отправляем сообщение для скачивания:",
          signedTracks
        );

        sendMessageToBackground({
          action: "downloadSigned",
          tracks: signedTracks,
          albumName: albumName,
        });
      } catch (error) {
        console.log("[Untitled Downloader] Ошибка при отправке сообщения:", error);
        resetButtonState();
        if (error instanceof Error && error.message.includes("Extension context invalidated")) {
          window.location.reload();
        }
      }
    } else {
      console.warn("[Untitled Downloader] Треки ещё не загружены.");
    }
  });

  targetElement.appendChild(wrapper);
}

function createProgressBar(targetElement: Element) {
    progressContainer = document.createElement("div");
    progressContainer.id = "untitled-download-progress";
    progressContainer.style.display = "none";
    progressContainer.style.marginTop = "10px";
    progressContainer.style.width = "100%";
    progressContainer.style.backgroundColor = "#eee";
    progressContainer.style.borderRadius = "4px";
    progressContainer.style.overflow = "hidden";

    progressBar = document.createElement("div");
    progressBar.style.width = "0%";
    progressBar.style.height = "4px";
    progressBar.style.backgroundColor = "#4CAF50";
    progressBar.style.transition = "width 0.3s ease";
    progressContainer.appendChild(progressBar);

    targetElement.parentElement?.insertBefore(
      progressContainer,
      targetElement.nextSibling
    );
}

export function updateProgress(progress: number) {
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    if (progress === 100) {
        setTimeout(() => {
            resetButtonState();
        }, 1000);
    }
}

export function resetButtonState() {
    if (progressContainer) progressContainer.style.display = "none";
    if (progressBar) progressBar.style.width = "0%";
    if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = "1";
    }
}

export function removeDownloadButton() {
  const btn = document.getElementById("untitled-download-btn");
  const progress = document.getElementById("untitled-download-progress");
  if (btn) {
    // Вместо прямого удаления, удаляем родительский wrapper
    btn.parentElement?.remove();
  }
  if(progress) {
    progress.remove();
  }
  downloadBtn = null;
  progressContainer = null;
  progressBar = null;
}

export function showStatus(text: string) {
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
      statusDiv.style.zIndex = "99999";
      document.body.appendChild(statusDiv);
    }
    statusDiv.textContent = text;
}

export function clearStatus() {
    let statusDiv = document.getElementById("untitled-downloader-status");
    if (statusDiv) {
      statusDiv.remove();
    }
}