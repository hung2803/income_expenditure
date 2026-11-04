import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function SystemPage({ icon, title, children, retry = false }: { icon: ReactNode; title: string; children: ReactNode; retry?: boolean }) {
  return <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
    <section className="w-full max-w-sm text-center">
      <div aria-hidden="true" className="mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl bg-accent text-primary [&_svg]:size-9">{icon}</div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {retry && <Button onClick={() => window.location.reload()}>Thử lại</Button>}
        <Button asChild variant={retry ? 'outline' : 'default'}><Link to="/login">Về đăng nhập</Link></Button>
      </div>
    </section>
  </main>;
}
