import { Outlet } from 'react-router-dom';

export function AppShell() {
  return <div className="mx-auto min-h-svh max-w-lg px-5 py-8">
    <header className="mb-8"><p className="text-sm text-primary">Tài chính cá nhân</p><h1 className="text-2xl font-semibold">Quản lý thu chi</h1></header>
    <main><Outlet /></main>
  </div>;
}
