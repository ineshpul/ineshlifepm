import { createBrowserRouter, Navigate } from 'react-router';
import { MobileShell } from './components/MobileShell';
import { Auth } from './pages/Auth';
import { Today } from './pages/Today';
import { Record } from './pages/Record';
import { Feed } from './pages/Feed';
import { Leaderboard } from './pages/Leaderboard';
import { Profile } from './pages/Profile';
import { authService } from './services/mockAuth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = authService.getCurrentUser();
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function Root() {
  const user = authService.getCurrentUser();
  
  if (user) {
    return <Navigate to="/today" replace />;
  }
  
  return (
    <MobileShell>
      <Auth />
    </MobileShell>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
  },
  {
    path: '/today',
    element: (
      <ProtectedRoute>
        <MobileShell>
          <Today />
        </MobileShell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/record',
    element: (
      <ProtectedRoute>
        <MobileShell>
          <Record />
        </MobileShell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/feed',
    element: (
      <ProtectedRoute>
        <MobileShell>
          <Feed />
        </MobileShell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/leaderboard',
    element: (
      <ProtectedRoute>
        <MobileShell>
          <Leaderboard />
        </MobileShell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <MobileShell>
          <Profile />
        </MobileShell>
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
