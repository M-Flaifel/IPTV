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

/** A non-2xx response; carries the status for callers that need it. */
export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Request failed with HTTP ${status}.`);
    this.status = status;
  }
}

export interface HttpTextResult {
  status: number;
  ok: boolean;
  text: string;
}

/**
 * Fetches text together with its response status, without throwing on
 * non-2xx responses. The credential check needs the status (401 vs 500) to
 * tell wrong credentials apart from a broken server.
 */
export async function httpGetTextResult(
  url: string,
  headers?: Record<string, string>
): Promise<HttpTextResult> {
  const response = await transport(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
  };
}

export async function httpGetText(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  const result = await httpGetTextResult(url, headers);

  if (!result.ok) {
    throw new HttpStatusError(result.status);
  }

  return result.text;
}
