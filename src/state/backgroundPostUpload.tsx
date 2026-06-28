import * as React from 'react';

import { isFirebaseConfigured } from '../firebase/firebase';
import {
  PostVideoUploadParams,
  refundPostAttemptIfFailed,
  runPostVideoUpload,
} from '../services/postVideoUpload';
import { showError } from '../utils/ui';
import { useAppState } from './appState';

export type BackgroundUploadPhase = 'idle' | 'uploading' | 'saving' | 'failed';

type BackgroundPostUploadValue = {
  phase: BackgroundUploadPhase;
  progress: number;
  isActive: boolean;
  errorMessage: string | null;
  startBackgroundPost: (params: PostVideoUploadParams) => void;
  retryBackgroundPost: () => void;
  dismissFailure: () => void;
};

const BackgroundPostUploadContext = React.createContext<BackgroundPostUploadValue | null>(null);

export function BackgroundPostUploadProvider({ children }: { children: React.ReactNode }) {
  const { markPostedToday, clearPostedOverride } = useAppState();
  const [phase, setPhase] = React.useState<BackgroundUploadPhase>('idle');
  const [progress, setProgress] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const jobRef = React.useRef<PostVideoUploadParams | null>(null);
  const runningRef = React.useRef(false);

  const resetIdle = React.useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setErrorMessage(null);
    jobRef.current = null;
    runningRef.current = false;
  }, []);

  const runJob = React.useCallback(
    async (params: PostVideoUploadParams) => {
      if (runningRef.current) return;
      runningRef.current = true;
      jobRef.current = params;
      setPhase('uploading');
      setProgress(0);
      setErrorMessage(null);
      markPostedToday();

      try {
        await runPostVideoUpload(params, {
          onProgress: setProgress,
          onSaving: () => setPhase('saving'),
        });
        resetIdle();
      } catch (e) {
        if (isFirebaseConfigured()) {
          try {
            await refundPostAttemptIfFailed({
              uid: params.uid,
              challengeDate: params.viewingChallengeDateKey,
            });
          } catch {
            // ignore ledger cleanup failures
          }
        }
        clearPostedOverride();
        const msg = e instanceof Error ? e.message : 'Upload failed. Try again.';
        setErrorMessage(msg);
        setPhase('failed');
        setProgress(0);
        runningRef.current = false;
        showError('Post failed', e);
      }
    },
    [markPostedToday, clearPostedOverride, resetIdle]
  );

  const startBackgroundPost = React.useCallback(
    (params: PostVideoUploadParams) => {
      void runJob(params);
    },
    [runJob]
  );

  const retryBackgroundPost = React.useCallback(() => {
    const job = jobRef.current;
    if (!job || runningRef.current) return;
    void runJob(job);
  }, [runJob]);

  const dismissFailure = React.useCallback(() => {
    if (phase !== 'failed') return;
    resetIdle();
  }, [phase, resetIdle]);

  const isActive = phase === 'uploading' || phase === 'saving';

  const value = React.useMemo(
    (): BackgroundPostUploadValue => ({
      phase,
      progress,
      isActive,
      errorMessage,
      startBackgroundPost,
      retryBackgroundPost,
      dismissFailure,
    }),
    [
      phase,
      progress,
      isActive,
      errorMessage,
      startBackgroundPost,
      retryBackgroundPost,
      dismissFailure,
    ]
  );

  return (
    <BackgroundPostUploadContext.Provider value={value}>{children}</BackgroundPostUploadContext.Provider>
  );
}

export function useBackgroundPostUpload() {
  const ctx = React.useContext(BackgroundPostUploadContext);
  if (!ctx) {
    throw new Error('useBackgroundPostUpload must be used within BackgroundPostUploadProvider');
  }
  return ctx;
}
