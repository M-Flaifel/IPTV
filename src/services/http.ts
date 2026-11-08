/**
 * HTTP seam for the Xtream API.
 *
 * The browser build uses fetch. Windows (Tauri), Android (Capacitor) and Tizen
 * packaging can install a native transport at startup to bypass browser CORS
 * without changing the data service.
 */
export type HttpTransport = (
  url: string,
  init: RequestInit
) => Promise<Response>;

let transport: HttpTransport = (url, init) => fetch(url, init);

export function setHttpTransport(next: HttpTransport): void {
  transport = next;
}

export async function httpGetText(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  const response = await transport(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }

  return response.text();
}
