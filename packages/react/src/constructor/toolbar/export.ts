/**
 * Saves text as a file through a temporary object URL. Returns false where downloads are unavailable.
 * @param text File content.
 * @param filename Suggested file name.
 * @returns Whether the download started.
 */
export function downloadText(text: string, filename: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-yaml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/**
 * Copies text to the clipboard. Returns false when the browser refuses (no permission, no API).
 * @param text Text to copy.
 * @returns Whether the clipboard accepted it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
