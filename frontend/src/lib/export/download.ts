export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadStringFile(
  filename: string,
  content: string,
  mime = 'application/xml;charset=utf-8'
): void {
  downloadBlobFile(filename, new Blob([content], { type: mime }));
}
