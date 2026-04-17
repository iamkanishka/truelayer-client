import { vi } from "vitest";

/** Stub globalThis.fetch to return a single JSON response. */
export function mockFetch(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const headers = new Headers({
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(bodyStr, { status, headers }),
    ),
  );
}

/** Stub globalThis.fetch to return a sequence of responses (cycles last if exhausted). */
export function mockFetchSequence(
  responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>,
): void {
  let idx = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      const r = idx < responses.length ? responses[idx]! : responses[responses.length - 1]!;
      idx++;
      const h = new Headers({ "Content-Type": "application/json", ...(r.headers ?? {}) });
      return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status, headers: h }));
    }),
  );
}
