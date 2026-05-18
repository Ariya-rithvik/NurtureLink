import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-8 py-10 lg:px-12 lg:py-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
