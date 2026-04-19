import { useState } from 'react';
import { Brandmark } from '../components/Brandmark';
import { TabBar } from '../components/TabBar';
import { dataService } from '../services/mockData';
import { authService } from '../services/mockAuth';

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<'jumps' | 'users'>('jumps');
  const leaderboard = dataService.getLeaderboard();
  const user = authService.getCurrentUser();

  const userRank = leaderboard.findIndex(entry => entry.userId === user?.id) + 1;
  const userEntry = leaderboard.find(entry => entry.userId === user?.id);

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
              Leaderboard
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
          {user?.vertical || 0}"
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div style={{ padding: '12px 20px 10px' }}>
          <div 
            style={{
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.16em',
              color: 'var(--muted-2)',
            }}
          >
            Leaderboard
          </div>
          <div 
            className="flex justify-between items-center gap-2"
            style={{
              fontSize: '19px',
              lineHeight: 1,
              letterSpacing: '-.04em',
              fontWeight: 800,
              color: 'var(--ink)',
            }}
          >
            <span className="whitespace-nowrap">How high can you jump?</span>
          </div>
        </div>

        {/* User card */}
        {userEntry && (
          <div 
            className="flex items-center justify-between gap-3"
            style={{
              margin: '0 16px 10px',
              padding: '14px 16px',
              borderRadius: '20px',
              background: 'var(--card)',
              border: '1px solid var(--line)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div 
                className="relative overflow-hidden"
                style={{
                  width: '10px',
                  height: '56px',
                  borderRadius: '999px',
                  background: 'var(--line-2)',
                }}
              >
                <div 
                  className="absolute left-0 right-0 bottom-0"
                  style={{
                    height: `${(user.vertical / 72) * 100}%`,
                    background: 'var(--ink)',
                    borderRadius: 'inherit',
                  }}
                />
              </div>
              <div>
                <div 
                  style={{
                    fontSize: '9px',
                    color: 'var(--muted-2)',
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Your jump
                </div>
                <div 
                  style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    letterSpacing: '-.04em',
                    marginTop: '2px',
                  }}
                >
                  {user.vertical}"
                </div>
                <div 
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    fontWeight: 500,
                  }}
                >
                  rank #{userRank} of {leaderboard.length}
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
              {user.vertical}"
            </div>
          </div>
        )}

        {/* Tabs */}
        <div 
          className="flex gap-2"
          style={{ margin: '0 16px 10px' }}
        >
          <button
            onClick={() => setActiveTab('jumps')}
            className="flex-1 text-center"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: activeTab === 'jumps' ? 'var(--ink)' : 'var(--card)',
              border: `1px solid ${activeTab === 'jumps' ? 'var(--ink)' : 'var(--line)'}`,
              color: activeTab === 'jumps' ? 'white' : 'var(--muted-2)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Highest Jumps
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className="flex-1 text-center"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: activeTab === 'users' ? 'var(--ink)' : 'var(--card)',
              border: `1px solid ${activeTab === 'users' ? 'var(--ink)' : 'var(--line)'}`,
              color: activeTab === 'users' ? 'white' : 'var(--muted-2)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Top users
          </button>
        </div>

        {/* List */}
        <div 
          className="flex-1 overflow-auto"
          style={{ padding: '0 16px 14px' }}
        >
          {leaderboard.map((entry, index) => {
            const isFirst = index === 0;
            
            return (
              <div 
                key={entry.userId}
                className="flex items-center gap-3"
                style={{
                  padding: '11px 14px',
                  borderRadius: '16px',
                  background: 'white',
                  border: '1px solid var(--line-2)',
                  marginBottom: '6px',
                }}
              >
                <div 
                  className="text-center"
                  style={{
                    width: '22px',
                    fontSize: '14px',
                    fontWeight: 800,
                    color: 'var(--muted-2)',
                  }}
                >
                  {index + 1}
                </div>

                <div 
                  className="grid place-items-center"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: isFirst ? 'var(--coral-soft)' : 'var(--line-2)',
                    color: isFirst ? 'var(--coral)' : 'var(--muted)',
                    border: `1px solid ${isFirst ? 'rgba(232,80,58,.12)' : 'var(--line)'}`,
                  }}
                >
                  {entry.avatar}
                </div>

                <div className="flex-1">
                  <div 
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--ink)',
                    }}
                  >
                    {entry.username}
                  </div>
                  <div 
                    style={{
                      fontSize: '10px',
                      color: 'var(--muted-2)',
                      marginTop: '2px',
                      fontWeight: 500,
                    }}
                  >
                    {entry.challengesCompleted} challenges · {entry.streak} day streak
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div 
                    className="relative overflow-hidden"
                    style={{
                      width: '8px',
                      height: '46px',
                      borderRadius: '999px',
                      background: 'var(--line-2)',
                    }}
                  >
                    <div 
                      className="absolute left-0 right-0 bottom-0"
                      style={{
                        height: `${(entry.vertical / 72) * 100}%`,
                        background: isFirst ? 'var(--coral)' : 'var(--ink)',
                        borderRadius: 'inherit',
                      }}
                    />
                  </div>
                  <div className="text-right" style={{ minWidth: '44px' }}>
                    <div 
                      style={{
                        fontSize: '17px',
                        fontWeight: 800,
                        letterSpacing: '-.03em',
                      }}
                    >
                      {entry.vertical}
                    </div>
                    <div 
                      style={{
                        fontSize: '9px',
                        color: 'var(--muted-2)',
                        fontWeight: 700,
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      in
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TabBar />
    </>
  );
}