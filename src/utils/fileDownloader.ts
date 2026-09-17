// Universal File Downloader for TeleForge
// Seamlessly routes downloads to Android native MediaStore via TeleForgeBridge
// or triggers standard browser anchor downloads in web/desktop.

import { showToast } from '../components/Toast';

export async function downloadFileToDevice(
  urlOrBlob: string | Blob,
  fileName: string,
  mimeType = 'application/octet-stream'
): Promise<void> {
  try {
    const isAndroidBridge = Boolean((window as any).TeleForgeBridge?.saveFile);

    if (isAndroidBridge) {
      let base64Data = '';
      if (urlOrBlob instanceof Blob) {
        base64Data = await blobToBase64(urlOrBlob);
      } else if (typeof urlOrBlob === 'string') {
        if (urlOrBlob.startsWith('data:')) {
          base64Data = urlOrBlob;
        } else {
          // Fetch blob from blob: or http: URL
          const resp = await fetch(urlOrBlob);
          const blob = await resp.blob();
          base64Data = await blobToBase64(blob);
        }
      }

      if (base64Data) {
        (window as any).TeleForgeBridge.saveFile(base64Data, fileName, mimeType);
        return;
      }
    }

    // Web / Desktop Browser Fallback
    let downloadUrl = '';
    let shouldRevoke = false;

    if (urlOrBlob instanceof Blob) {
      downloadUrl = URL.createObjectURL(urlOrBlob);
      shouldRevoke = true;
    } else {
      downloadUrl = urlOrBlob;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      if (shouldRevoke) URL.revokeObjectURL(downloadUrl);
    }, 2000);

    showToast(`Downloading ${fileName}...`, 'info');
  } catch (err: any) {
    console.warn('[Downloader] Failed to save file:', err);
    showToast('Failed to download file', 'error');
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
