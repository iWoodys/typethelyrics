export async function readJsonBody<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  try { return JSON.parse(raw) as T; }
  catch { throw new Error("INVALID_JSON"); }
}
