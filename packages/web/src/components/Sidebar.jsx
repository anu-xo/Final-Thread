import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

// Why fetch communities in the sidebar?
// Reddit-style: the sidebar shows the communities you've joined so you can quickly jump
// between them. We'll load public top communities for now; on Day 7 we'll filter to
// subscribed communities.
export default function Sidebar() {
  const { accessToken } = useAuthStore();
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['sidebar-communities'],
    queryFn: () => api.get('/communities?limit=10').then(r => r.data),
    enabled: !!accessToken,   // Only fetch if logged in
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes — sidebar doesn't need live data
  });

  return (
    <aside className="w-56 shrink-0 pt-2">
      <nav className="space-y-0.5">
        <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Feeds</p>
        <SidebarLink to="/home" label="🏠 Home" active={location.pathname === '/home'} />
        <SidebarLink to="/popular" label="🔥 Popular" active={location.pathname === '/popular'} />
        <SidebarLink to="/all" label="🌐 All" active={location.pathname === '/all'} />

        {data?.data?.length > 0 && (
          <>
            <p className="px-3 py-2 mt-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Communities</p>
            {data.data.map(community => (
              <SidebarLink
                key={community._id}
                to={`/r/${community.slug}`}
                label={`r/${community.slug}`}
                active={location.pathname === `/r/${community.slug}`}
              />
            ))}
          </>
        )}

        <hr className="my-3 border-gray-100" />
        <SidebarLink to="/communities/create" label="+ Create Community" active={false} />
        <SidebarLink to="/tiptap-smoke" label="🧪 Tiptap Smoke" active={location.pathname === '/tiptap-smoke'} />
      </nav>
    </aside>
  );
}

function SidebarLink({ to, label, active }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? 'bg-orange-50 text-orange-600 font-medium'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  );
}