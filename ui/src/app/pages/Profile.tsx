import { useNavigate } from 'react-router';
import { Brandmark } from '../components/Brandmark';
import { TabBar } from '../components/TabBar';
import { authService } from '../services/mockAuth';
import { dataService } from '../services/mockData';

export function Profile() {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();
  const userVideos = user ? dataService.getUserVideos(user.id) : [];

  if (!user) {
    navigate('/');
    return null;
  }

  const handleSignOut = () => {
    authService.signOut();
    navigate('/');
  };

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
              Profile
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            fontSize: '11px',
            color: 'var(--muted-2)',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-auto">
        {/* Profile card */}
        <div 
          className="text-center"
          style={{
            margin: '4px 16px 12px',
            padding: '20px',
            borderRadius: '28px',
            background: 'var(--card)',
            border: '1px solid var(--line)',
          }}
        >
          <div 
            className="mx-auto grid place-items-center"
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '22px',
              background: 'var(--warm)',
              border: '1px solid var(--warm-2)',
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--ink-2)',
            }}
          >
            {user.avatar}
          </div>
          <div 
            style={{
              marginTop: '12px',
              fontSize: '18px',
              fontWeight: 800,
              letterSpacing: '-.03em',
            }}
          >
            {user.username}
          </div>
          <div 
            style={{
              marginTop: '3px',
              fontSize: '12px',
              color: 'var(--muted)',
              fontWeight: 500,
            }}
          >
            @{user.username.toLowerCase()}
          </div>
          <div 
            className="inline-flex items-center gap-1.5 mt-2.5"
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              border: '1px solid var(--line)',
              background: '#FAFBFC',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--muted)',
            }}
          >
            {user.campus}
          </div>
        </div>

        {/* Vertical meter */}
        <div 
          style={{
            margin: '0 16px 10px',
            padding: '16px',
            borderRadius: '20px',
            background: 'white',
            border: '1px solid var(--line-2)',
          }}
        >
          <div 
            className="flex items-end justify-between gap-3 mb-3"
          >
            <div>
              <div 
                style={{
                  fontSize: '9px',
                  color: 'var(--muted-2)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                }}
              >
                Jump height
              </div>
              <div 
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  letterSpacing: '-.05em',
                }}
              >
                {user.vertical}"
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
              IN
            </div>
          </div>

          <div className="flex items-end gap-3.5">
            <div 
              className="relative overflow-hidden"
              style={{
                width: '16px',
                height: '140px',
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
            <div className="flex-1">
              <div 
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '-.02em',
                }}
              >
                You are getting higher.
              </div>
              <div 
                style={{
                  marginTop: '4px',
                  color: 'var(--muted)',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  fontWeight: 400,
                }}
              >
                Track your best jump in inches. More reps means more lift and a higher ceiling.
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div 
          className="grid grid-cols-3 gap-1.5"
          style={{ margin: '0 16px 10px' }}
        >
          <div 
            className="text-center"
            style={{
              background: 'white',
              border: '1px solid var(--line-2)',
              borderRadius: '16px',
              padding: '12px 8px',
            }}
          >
            <div 
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-.03em',
              }}
            >
              {user.challengesCompleted}
            </div>
            <div 
              style={{
                marginTop: '3px',
                fontSize: '8px',
                color: 'var(--muted-2)',
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              Challenges<br />completed
            </div>
          </div>

          <div 
            className="text-center"
            style={{
              background: 'white',
              border: '1px solid var(--line-2)',
              borderRadius: '16px',
              padding: '12px 8px',
            }}
          >
            <div 
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-.03em',
              }}
            >
              {user.streak}
            </div>
            <div 
              style={{
                marginTop: '3px',
                fontSize: '8px',
                color: 'var(--muted-2)',
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              Day<br />streak
            </div>
          </div>

          <div 
            className="text-center"
            style={{
              background: 'white',
              border: '1px solid var(--line-2)',
              borderRadius: '16px',
              padding: '12px 8px',
            }}
          >
            <div 
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-.03em',
              }}
            >
              {user.likesReceived}
            </div>
            <div 
              style={{
                marginTop: '3px',
                fontSize: '8px',
                color: 'var(--muted-2)',
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              Likes<br />received
            </div>
          </div>
        </div>

        {/* Posts */}
        <div style={{ margin: '0 16px 14px' }}>
          <div 
            style={{
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--muted-2)',
              textTransform: 'uppercase',
              letterSpacing: '.16em',
              marginBottom: '8px',
            }}
          >
            Your leaps
          </div>
          
          {userVideos.length === 0 ? (
            <div 
              style={{
                color: 'var(--muted-2)',
                fontSize: '11px',
                fontWeight: 500,
                lineHeight: 1.5,
              }}
            >
              Make the profile feel like a scoreboard, not a résumé. Post your first challenge to get started!
            </div>
          ) : (
            userVideos.map((video) => (
              <div 
                key={video.id}
                className="flex items-center justify-between gap-3"
                style={{
                  padding: '11px 14px',
                  borderRadius: '14px',
                  border: '1px solid var(--line-2)',
                  background: 'white',
                  marginBottom: '6px',
                }}
              >
                <div>
                  <div 
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {video.challengeTitle}
                  </div>
                  <div 
                    style={{
                      fontSize: '10px',
                      color: 'var(--muted-2)',
                      marginTop: '2px',
                      fontWeight: 500,
                    }}
                  >
                    {new Date(video.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div 
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ink)',
                  }}
                >
                  {video.vertical}"
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <TabBar />
    </>
  );
}
