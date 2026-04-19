import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Brandmark } from '../components/Brandmark';
import { TabBar } from '../components/TabBar';
import { dataService, Video } from '../services/mockData';
import { authService } from '../services/mockAuth';

export function Feed() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const user = authService.getCurrentUser();
  const hasPosted = user ? dataService.hasUserPostedToday(user.id) : false;

  useEffect(() => {
    if (hasPosted) {
      setVideos(dataService.getFeed());
    }
  }, [hasPosted]);

  const handleLike = async (videoId: string) => {
    await dataService.likeVideo(videoId);
    setVideos(dataService.getFeed());
  };

  if (!hasPosted) {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div 
            className="flex flex-col items-center gap-6 text-center"
            style={{
              maxWidth: '280px',
            }}
          >
            <div 
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: 'var(--warm)',
                border: '1px solid var(--warm-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
              }}
            >
              🔒
            </div>
            <div>
              <div 
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  letterSpacing: '-.04em',
                  color: 'var(--ink)',
                  marginBottom: '8px',
                }}
              >
                Post to continue
              </div>
              <div 
                style={{
                  color: 'var(--muted)',
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                Post today's challenge to unlock the feed and see what everyone else is doing.
              </div>
            </div>
            <button
              onClick={() => navigate('/record')}
              style={{
                padding: '14px 28px',
                borderRadius: '999px',
                border: 0,
                background: 'var(--moss-dark)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(15,17,23,.12)',
              }}
            >
              Leap
            </button>
          </div>
        </div>
        <TabBar />
      </>
    );
  }

  const currentVideo = videos[currentIndex];

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
              Feed
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
          {videos.length} live
        </div>
      </div>

      {/* Banner */}
      <div 
        className="relative overflow-hidden"
        style={{
          margin: '0 16px 12px',
          borderRadius: '28px',
          background: 'var(--ink)',
          color: 'white',
          padding: '22px 20px',
          minHeight: '136px',
        }}
      >
        <div 
          style={{
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '.16em',
            fontWeight: 700,
            opacity: .4,
          }}
        >
          Today's feed
        </div>
        <div 
          style={{
            marginTop: '10px',
            fontSize: '32px',
            lineHeight: '.96',
            letterSpacing: '-.05em',
            fontWeight: 800,
          }}
        >
          Jump<br />higher.
        </div>
        <div 
          style={{
            marginTop: '10px',
            fontSize: '12px',
            lineHeight: 1.5,
            fontWeight: 400,
            opacity: .45,
            maxWidth: '22ch',
          }}
        >
          Short-form clips, reactions, and posts that feel alive.
        </div>
      </div>

      {/* Video */}
      {currentVideo && (
        <div 
          className="flex-1 relative overflow-hidden"
          style={{
            margin: '0 16px 16px',
            borderRadius: '28px',
            background: 'linear-gradient(165deg, #2A2D3A 0%, #3D4150 50%, #2A2D3A 100%)',
          }}
        >
          {/* Gradient overlay */}
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.5) 100%)',
              zIndex: 1,
            }}
          />

          {/* Rank badge */}
          <div 
            className="absolute top-3.5 left-3.5 z-10"
            style={{
              padding: '5px 10px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,.1)',
              color: 'rgba(255,255,255,.8)',
              border: '1px solid rgba(255,255,255,.08)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '.02em',
            }}
          >
            #{currentIndex + 1}
          </div>

          {/* Actions */}
          <div 
            className="absolute right-3.5 bottom-20 z-10 flex flex-col gap-3.5 items-center"
            style={{ color: 'white' }}
          >
            <button
              onClick={() => handleLike(currentVideo.id)}
              className="flex flex-col items-center gap-1"
            >
              <div 
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.08)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                  cursor: 'pointer',
                }}
              >
                ▲
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                {currentVideo.likes}
              </div>
              <div 
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  opacity: .5,
                }}
              >
                Likes
              </div>
            </button>

            <div className="flex flex-col items-center gap-1">
              <div 
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.08)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                }}
              >
                ◌
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                {currentVideo.comments}
              </div>
              <div 
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  opacity: .5,
                }}
              >
                Reply
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div 
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.08)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                }}
              >
                ↗
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                {currentVideo.shares}
              </div>
              <div 
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  opacity: .5,
                }}
              >
                Share
              </div>
            </div>
          </div>

          {/* Video info */}
          <div 
            className="absolute left-4 right-20 bottom-4 z-10"
            style={{ color: 'white' }}
          >
            <div 
              style={{
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '-.02em',
              }}
            >
              @{currentVideo.username}
            </div>
            <div 
              style={{
                fontSize: '11px',
                opacity: .5,
                marginTop: '3px',
                fontWeight: 400,
              }}
            >
              {currentVideo.challengeTitle} · {(currentVideo.views / 1000).toFixed(1)}k views
            </div>
          </div>

          {/* Navigation arrows */}
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(prev => prev - 1)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,.1)',
                border: '1px solid rgba(255,255,255,.08)',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                transform: 'translate(-80px, -50%) rotate(-90deg)',
              }}
            >
              ▼
            </button>
          )}
          {currentIndex < videos.length - 1 && (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,.1)',
                border: '1px solid rgba(255,255,255,.08)',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                transform: 'translate(80px, -50%) rotate(90deg)',
              }}
            >
              ▼
            </button>
          )}
        </div>
      )}

      <TabBar />
    </>
  );
}