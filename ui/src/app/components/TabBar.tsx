import { useNavigate, useLocation } from 'react-router';

interface Tab {
  icon: string;
  label: string;
  path: string;
}

const tabs: Tab[] = [
  { icon: '◎', label: 'Today', path: '/today' },
  { icon: '▣', label: 'Feed', path: '/feed' },
  { icon: '＋', label: 'Record', path: '/record' },
  { icon: '↟', label: 'Top', path: '/leaderboard' },
  { icon: '◉', label: 'Me', path: '/profile' },
];

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div 
      className="flex items-center justify-around"
      style={{
        padding: '10px 10px 20px',
        borderTop: '1px solid var(--line-2)',
        background: 'rgba(255,255,255,.96)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="flex flex-col items-center gap-1 cursor-pointer transition-colors"
            style={{
              color: isActive ? 'var(--ink)' : 'var(--muted-2)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}
          >
            <div 
              className="grid place-items-center"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '8px',
                fontSize: '12px',
                ...(isActive && {
                  background: 'var(--coral-soft)',
                  color: 'var(--coral)',
                }),
              }}
            >
              {tab.icon}
            </div>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
