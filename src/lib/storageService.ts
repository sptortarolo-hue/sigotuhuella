export function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ data: base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function filesToBase64(files: File[]): Promise<{ data: string; mimeType: string }[]> {
  return Promise.all(files.map(fileToBase64));
}
