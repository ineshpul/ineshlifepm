import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Brandmark } from '../components/Brandmark';
import { TabBar } from '../components/TabBar';
import { dataService } from '../services/mockData';
import { authService } from '../services/mockAuth';

export function Today() {
  const navigate = useNavigate();
  const challenge = dataService.getTodayChallenge();
  const [timeLeft, setTimeLeft] = useState('');
  const user = authService.getCurrentUser();
  const hasPosted = user ? dataService.hasUserPostedToday(user.id) : false;

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expires = new Date(challenge.expiresAt);
      const diff = expires.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [challenge]);

  return (
    <>
      {/* Topbar */}
      <div 
        className="flex items-center justify-between gap-3"
        style={{ padding: '14px 20px 10px' }}
      >
        <div className="flex items-center gap-2.5">
          <Brandmark />
          <div>
            <div 
              style={{
                fontWeight: 800,
                fontSize: '20px',
                letterSpacing: '-.04em',
                lineHeight: 1,
                color: 'var(--ink)',
              }}
            >
              Leap
            </div>
            <div 
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '.16em',
                color: 'var(--muted-2)',
                marginTop: '2px',
                fontWeight: 600,
              }}
            >
              Today
            </div>
          </div>
        </div>
        <div 
          className="inline-flex items-center gap-1.5"
          style={{
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid var(--line)',
            background: 'var(--card)',
            fontSize: '11px',
            color: 'var(--ink-2)',
            fontWeight: 600,
            letterSpacing: '-.01em',
          }}
        >
          <span 
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--coral)',
            }}
          />
          {timeLeft}
        </div>
      </div>

      {/* Challenge */}
      <div className="flex-1 flex flex-col">
        <div 
          style={{
            margin: '0 16px 12px',
            padding: '24px 22px',
            borderRadius: '28px',
            background: 'var(--warm)',
            border: '1px solid var(--warm-2)',
            minHeight: '290px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div 
              className="inline-flex items-center gap-1.5"
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                background: 'var(--card)',
                border: '1px solid var(--line)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--muted)',
                letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}
            >
              <span 
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--coral)',
                }}
              />
              Challenge
            </div>

            <div 
              style={{
                margin: '20px 0 8px',
                fontSize: '36px',
                lineHeight: '.96',
                letterSpacing: '-.05em',
                fontWeight: 800,
                color: 'var(--ink)',
              }}
            >
              {challenge.title}
            </div>

            <div 
              style={{
                color: 'var(--muted)',
                fontSize: '13px',
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {challenge.description}
            </div>
          </div>

          <div 
            className="flex items-center justify-between gap-2.5"
            style={{ marginTop: '18px' }}
          >
            <div 
              style={{
                padding: '9px 14px',
                borderRadius: '10px',
                background: 'var(--card)',
                border: '1px solid var(--line)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--ink-2)',
                letterSpacing: '-.01em',
              }}
            >
              Expires: {timeLeft}
            </div>
            <div className="flex items-center gap-2">
              <div 
                style={{
                  width: '64px',
                  height: '5px',
                  borderRadius: '999px',
                  background: 'rgba(0,0,0,.06)',
                  overflow: 'hidden',
                }}
              >
                <div 
                  style={{
                    width: '38%',
                    height: '100%',
                    background: 'var(--coral)',
                    borderRadius: 'inherit',
                  }}
                />
              </div>
              <div 
                style={{
                  color: 'var(--muted-2)',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {challenge.participantCount} live
              </div>
            </div>
          </div>
        </div>

        <div 
          className="flex flex-col items-center gap-2.5"
          style={{ marginTop: 'auto', padding: '0 16px 16px' }}
        >
          <button
            onClick={() => navigate('/record')}
            style={{
              width: '164px',
              height: '54px',
              borderRadius: '999px',
              border: 0,
              background: 'var(--moss-dark)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              boxShadow: '0 12px 32px rgba(15,17,23,.16)',
              cursor: 'pointer',
              transition: 'transform .12s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span 
              style={{
                fontSize: '14px',
                fontWeight: 800,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
              }}
            >
              {hasPosted ? 'POSTED' : 'Leap'}
            </span>
            <span 
              style={{
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.5)',
              }}
            >
              {hasPosted ? 'View feed' : 'Tap to record'}
            </span>
          </button>
          <div 
            style={{
              color: 'var(--muted-2)',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            One Day. One Leap.
          </div>
        </div>
      </div>

      <TabBar />
    </>
  );
}