export interface BackendProxyHeaders {
  origin?: string;
  forwardedOrigin?: string;
  forwardedHost?: string;
}

// The dev proxy translates same-origin browser requests to the backend origin.
// Pinggy's HTTPS forwarding headers are accepted only when all public origin
// values agree, so an unrelated browser origin stays blocked by the backend.
export function backendProxyHeaders(
  origin: string | undefined,
  host: string | undefined,
  secure: boolean,
  target: string,
  forwardedProto?: string,
  forwardedHost?: string,
  cloudflareEdge?: boolean
): BackendProxyHeaders {
  if (host && origin === `${secure ? 'https' : 'http'}://${host}`) return { origin: new URL(target).origin };
  const publicHost = forwardedHost ?? (cloudflareEdge ? host : undefined);
  const publicOrigin = origin ?? (cloudflareEdge && publicHost ? `https://${publicHost}` : undefined);
  if (host && publicHost && forwardedProto === 'https' && publicHost === host && publicOrigin === `https://${publicHost}`) {
    return { origin: new URL(target).origin, forwardedOrigin: publicOrigin, forwardedHost: publicHost };
  }
  return { origin };
}

export function backendRequestOrigin(origin: string | undefined, host: string | undefined, secure: boolean, target: string): string | undefined {
  if (host && origin === `${secure ? 'https' : 'http'}://${host}`) return new URL(target).origin;
  return origin;
}
