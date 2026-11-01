import { apiBlob } from '@/lib/api';

/** Private files need the session token, so they are fetched and handed to the browser as a download. */
export async function openPrivateFile(url: string, name: string): Promise<void> {
  const blob = await apiBlob(url);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
