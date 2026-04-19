import { ReactNode } from 'react';

interface MobileShellProps {
  children: ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F0F1F4' }}>
      <div 
        className="relative overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '390px',
          height: '844px',
          background: 'var(--card)',
          border: '1px solid rgba(0,0,0,.06)',
          borderRadius: '44px',
          boxShadow: '0 20px 60px rgba(15,17,23,.08), 0 1px 3px rgba(15,17,23,.06)',
        }}
      >
        {/* Inner border glow */}
        <div 
          className="absolute pointer-events-none z-10"
          style={{
            inset: '6px',
            borderRadius: '40px',
            border: '1px solid rgba(255,255,255,.7)',
          }}
        />
        
        {/* Screen content */}
        <div className="relative w-full h-full flex flex-col" style={{ background: '#FAFBFC' }}>
          {/* Notch */}
          <div 
            className="mx-auto relative z-30"
            style={{
              width: '80px',
              height: '24px',
              borderRadius: '0 0 18px 18px',
              background: 'var(--ink)',
            }}
          >
            <div 
              className="absolute"
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#1C1F28',
                border: '2px solid #2A2D38',
                right: '16px',
                top: '7px',
              }}
            />
          </div>

          {/* Status bar */}
          <div 
            className="flex items-center justify-between px-6"
            style={{
              height: '28px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--ink-2)',
              letterSpacing: '-.01em',
            }}
          >
            <span>9:41</span>
            <span>5G ▦ 🔋</span>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
