// Accept an externally visible origin only when the frontend proxy replaced
// Origin with its own backend origin and supplied a consistent HTTPS host.
export function trustedForwardedOrigin(request: Request, environment: string): string | undefined {
  if (environment !== 'dev') return undefined;
  const origin = request.headers.get('Origin');
  const publicOrigin = request.headers.get('X-Forwarded-Origin');
  const publicHost = request.headers.get('X-Forwarded-Host');
  const publicProto = request.headers.get('X-Forwarded-Proto');
  if (!origin || origin !== new URL(request.url).origin || !publicOrigin || !publicHost || publicProto !== 'https' || publicOrigin.includes(',')) return undefined;
  try {
    const url = new URL(publicOrigin);
    if (url.protocol !== 'https:' || url.origin !== publicOrigin || url.host !== publicHost || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
