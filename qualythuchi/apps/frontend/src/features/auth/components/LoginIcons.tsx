import type { ReactNode, SVGProps } from 'react';

type IconName = 'user' | 'lock' | 'eye' | 'eye-off' | 'arrow' | 'key' | 'shield' | 'apple';

export function LoginIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    user: <><circle cx="12" cy="7" r="4" fill="currentColor" stroke="none" /><path d="M4 21v-2a8 8 0 0 1 16 0v2Z" fill="currentColor" stroke="none" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" fill="currentColor" stroke="none" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 15v2" stroke="white" strokeWidth="2" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 3.9M6.1 6.1A24 24 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.2-1.4M10 10a2.8 2.8 0 0 0 4 4" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    key: <><path d="m14 13-8 8H3v-3l2-2v-3l4-4" fill="currentColor" strokeLinejoin="round" /><circle cx="15" cy="8" r="6" fill="currentColor" /><circle cx="17" cy="6" r="1.6" fill="white" stroke="none" /></>,
    shield: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z" fill="currentColor" stroke="none" /><path d="m8.5 11.7 2.3 2.3 4.7-5" stroke="white" strokeWidth="1.8" /></>,
    apple: <path stroke="none" fill="currentColor" d="M17.1 12.5c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3-1.6-1.3-.2-2.5.8-3.2.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9  .7 1.1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7 1.9-1.1 2.6-2.1c.8-1.2 1.1-2.3 1.2-2.4-.1 0-2.2-.8-2.2-3.1ZM15.1 6.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.6-1.2 1.8-1.1 2.9 1.1.1 2.2-.5 2.9-1.3Z" />
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
