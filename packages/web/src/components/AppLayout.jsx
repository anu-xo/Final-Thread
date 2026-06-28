// Why a layout component?
// React Router v6 supports "nested routes" where a parent route renders a layout
// and child routes render inside it via <Outlet />.
// Every authenticated page uses this layout — we define Header + Sidebar once here.
import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      {/* pt-14 pushes content below the fixed header */}
      <div className="pt-14 max-w-6xl mx-auto px-4 flex gap-6">
        <Sidebar />
        {/* Main content area — child routes render here */}
        <main className="flex-1 py-4 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}