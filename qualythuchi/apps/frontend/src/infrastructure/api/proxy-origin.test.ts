import { expect, it } from 'vitest';
import { backendProxyHeaders, backendRequestOrigin } from './proxy-origin';

it('preserves the loopback frontend origin for WebAuthn while leaving foreign origins untouched', () => {
  const target = 'http://127.0.0.1:8788';
  expect(backendProxyHeaders('http://localhost:4173', 'localhost:4173', false, target)).toEqual({ origin: 'http://localhost:4173' });
  expect(backendProxyHeaders('http://127.0.0.1:4173', '127.0.0.1:4173', false, target)).toEqual({ origin: 'http://127.0.0.1:4173' });
  expect(backendProxyHeaders('http://192.0.2.10:4173', '192.0.2.10:4173', false, target)).toEqual({ origin: target });
  expect(backendProxyHeaders('https://foreign.example', 'localhost:4173', false, target)).toEqual({ origin: 'https://foreign.example' });
});

it('proxies same-origin phone and local auth without allowing a foreign or missing Origin', () => {
  const target = 'http://backend:8787';
  expect(backendRequestOrigin('http://192.168.1.12:5173', '192.168.1.12:5173', false, target)).toBe(target);
  expect(backendRequestOrigin('http://localhost:5173', 'localhost:5173', false, target)).toBe(target);
  expect(backendRequestOrigin('https://evil.test', '192.168.1.12:5173', false, target)).toBe('https://evil.test');
  expect(backendRequestOrigin('https://localhost:5173', 'localhost:5173', false, target)).toBe('https://localhost:5173');
  expect(backendRequestOrigin(undefined, 'localhost:5173', false, target)).toBeUndefined();
});

it('forwards Pinggy HTTPS only when the browser origin, forwarded host, and local host match', () => {
  const expected = { origin: 'http://backend:8787', forwardedOrigin: 'https://sample.run.pinggy-free.link', forwardedHost: 'sample.run.pinggy-free.link' };
  expect(backendProxyHeaders(expected.forwardedOrigin, expected.forwardedHost, false, 'http://backend:8787', 'https', expected.forwardedHost)).toEqual(expected);
  expect(backendProxyHeaders('https://evil.example', expected.forwardedHost, false, 'http://backend:8787', 'https', expected.forwardedHost)).toEqual({ origin: 'https://evil.example' });
  expect(backendProxyHeaders(expected.forwardedOrigin, '127.0.0.1:5173', false, 'http://backend:8787', 'https', expected.forwardedHost)).toEqual({ origin: expected.forwardedOrigin });
  expect(backendProxyHeaders(expected.forwardedOrigin, expected.forwardedHost, false, 'http://backend:8787', 'http', expected.forwardedHost)).toEqual({ origin: expected.forwardedOrigin });
});

it('forwards Cloudflare HTTPS only when Cloudflare edge headers and the public origin agree', () => {
  const origin = 'https://random.trycloudflare.com';
  const target = 'http://backend:8787';
  expect(backendProxyHeaders(origin, 'random.trycloudflare.com', false, target, 'https', undefined, true)).toEqual({
    origin: target,
    forwardedOrigin: origin,
    forwardedHost: 'random.trycloudflare.com'
  });
  expect(backendProxyHeaders(origin, 'random.trycloudflare.com', false, target, 'https')).toEqual({ origin });
  expect(backendProxyHeaders('https://evil.example', 'random.trycloudflare.com', false, target, 'https', undefined, true)).toEqual({ origin: 'https://evil.example' });
});

it('infers the Cloudflare HTTPS origin for same-host requests that omit Origin', () => {
  const target = 'http://backend:8787';
  expect(backendProxyHeaders(undefined, 'random.trycloudflare.com', false, target, 'https', undefined, true)).toEqual({
    origin: target,
    forwardedOrigin: 'https://random.trycloudflare.com',
    forwardedHost: 'random.trycloudflare.com'
  });
  expect(backendProxyHeaders(undefined, 'random.trycloudflare.com', false, target, 'https')).toEqual({});
  expect(backendProxyHeaders(undefined, 'random.trycloudflare.com', false, target, 'https', 'other.trycloudflare.com', true)).toEqual({});
  expect(backendProxyHeaders(undefined, 'random.trycloudflare.com', false, target, 'http', undefined, true)).toEqual({});
});
