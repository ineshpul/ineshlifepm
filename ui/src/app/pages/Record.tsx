import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { TabBar } from '../components/TabBar';
import { dataService } from '../services/mockData';
import { authService } from '../services/mockAuth';

export function Record() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useFallbackMode, setUseFallbackMode] = useState(false);

  const challenge = dataService.getTodayChallenge();
  const user = authService.getCurrentUser();

  useEffect(() => {
    // Request camera access
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
        setStream(mediaStream);
        setCameraError(null);
        setUseFallbackMode(false);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        // Silently enable fallback mode without console errors
        setUseFallbackMode(true);
        
        if (err.name === 'NotFoundError') {
          setCameraError('No camera found. Using demo mode.');
        } else if (err.name === 'NotAllowedError') {
          setCameraError('Camera access denied. Using demo mode.');
        } else {
          setCameraError('Camera unavailable. Using demo mode.');
        }
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = () => {
    if (attemptsLeft === 0) return;

    // Fallback mode: simulate recording without actual camera
    if (useFallbackMode) {
      setIsRecording(true);
      setRecordingTime(0);
      return;
    }

    if (!stream) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
  };

  const stopRecording = () => {
    // Fallback mode: create a mock blob
    if (useFallbackMode) {
      setIsRecording(false);
      setAttemptsLeft(prev => prev - 1);
      // Create a minimal mock blob for demo purposes
      const mockBlob = new Blob(['mock video data'], { type: 'video/webm' });
      setRecordedBlob(mockBlob);
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAttemptsLeft(prev => prev - 1);
    }
  };

  const submitVideo = async () => {
    if (!recordedBlob || !user) return;

    try {
      await dataService.submitVideo(
        user.id,
        user.username,
        challenge.id,
        recordedBlob,
        3 - attemptsLeft
      );

      // Update user stats
      authService.updateUser({
        challengesCompleted: user.challengesCompleted + 1,
        streak: user.streak + 1,
      });

      navigate('/feed');
    } catch (err) {
      console.error('Failed to submit video:', err);
    }
  };

  const retake = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="flex-1 flex flex-col">
        <div 
          className="flex-1 relative overflow-hidden"
          style={{
            margin: '0 14px 14px',
            borderRadius: '32px',
            background: 'linear-gradient(175deg, #1A1D26 0%, #0E1016 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)',
          }}
        >
          {/* Video preview or fallback */}
          {!useFallbackMode ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div 
              className="absolute inset-0 w-full h-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #2A2D3A 0%, #1A1D26 100%)',
              }}
            >
              <div className="text-center px-8">
                <div 
                  style={{
                    fontSize: '48px',
                    marginBottom: '16px',
                  }}
                >
                  🎥
                </div>
                <div 
                  style={{
                    color: 'rgba(255,255,255,.9)',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '8px',
                  }}
                >
                  Demo Mode
                </div>
                <div 
                  style={{
                    color: 'rgba(255,255,255,.5)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                  }}
                >
                  {cameraError}
                  <br />
                  You can still test the recording flow!
                </div>
              </div>
            </div>
          )}

          {/* Top bar */}
          <div 
            className="absolute top-4 left-4 right-4 flex items-center justify-center z-10"
          >
            <button
              onClick={() => navigate('/today')}
              className="absolute left-0"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.08)',
                display: 'grid',
                placeItems: 'center',
                color: 'rgba(255,255,255,.7)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>

            {isRecording && (
              <div 
                className="flex items-center justify-center gap-2"
                style={{
                  minWidth: '78px',
                  padding: '7px 14px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.08)',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '-.01em',
                }}
              >
                <span 
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--coral)',
                    boxShadow: '0 0 0 3px rgba(232,80,58,.2)',
                    animation: 'pulse 1.4s ease-in-out infinite',
                  }}
                />
                <span>{formatTime(recordingTime)}</span>
              </div>
            )}

            {attemptsLeft > 0 && !recordedBlob && (
              <button
                onClick={retake}
                className="absolute right-0"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.08)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'rgba(255,255,255,.7)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                ↺
              </button>
            )}
          </div>

          {/* Challenge title */}
          <div 
            className="absolute left-4 right-4 top-16 z-10"
            style={{
              padding: '10px 14px',
              borderRadius: '14px',
              background: 'rgba(0,0,0,.4)',
              color: 'white',
              border: '1px solid rgba(255,255,255,.06)',
              backdropFilter: 'blur(12px)',
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '-.01em',
            }}
          >
            {challenge.title}
          </div>

          {/* Bottom controls */}
          <div 
            className="absolute left-0 right-0 bottom-7 z-10 flex flex-col items-center gap-2"
          >
            {!recordedBlob ? (
              <>
                <div 
                  style={{
                    fontSize: '9px',
                    color: 'rgba(255,255,255,.35)',
                    fontWeight: 700,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  60s max · {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left
                </div>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={attemptsLeft === 0}
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    cursor: attemptsLeft > 0 ? 'pointer' : 'not-allowed',
                    opacity: attemptsLeft === 0 ? 0.5 : 1,
                  }}
                >
                  <div 
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: isRecording ? '8px' : '50%',
                      background: 'var(--coral)',
                      transition: 'border-radius .2s',
                    }}
                  />
                </button>
                <div 
                  style={{
                    fontSize: '9px',
                    color: 'rgba(255,255,255,.45)',
                    fontWeight: 700,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isRecording ? 'Tap to stop' : 'Tap to record'}
                </div>
              </>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={retake}
                  disabled={attemptsLeft === 0}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,.2)',
                    background: 'rgba(255,255,255,.1)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: attemptsLeft > 0 ? 'pointer' : 'not-allowed',
                    opacity: attemptsLeft === 0 ? 0.5 : 1,
                  }}
                >
                  Retake ({attemptsLeft} left)
                </button>
                <button
                  onClick={submitVideo}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '999px',
                    border: 0,
                    background: 'var(--coral)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Submit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <TabBar />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
      `}</style>
    </>
  );
}