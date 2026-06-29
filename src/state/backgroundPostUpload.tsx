import * as React from 'react';

import { isFirebaseConfigured } from '../firebase/firebase';
import { cleanupStagedFeedPlaybackClips, stageFeedPlaybackClip } from '../lib/stageFeedPlaybackClip';
import {
  PostVideoUploadParams,
  refundPostAttemptIfFailed,
  runPostVideoUpload,
} from '../services/postVideoUpload';
import { showError } from '../utils/ui';
import { useAppState } from './appState';
import { todayVideoDocId } from './posting';

export type BackgroundUploadPhase = 'idle' | 'uploading' | 'saving' | 'failed';

/** Local clip URIs for instant feed playback after post — avoids re-downloading from Storage. */
export type PendingFeedPlayback = {
  videoDocId: string;
  uid: string;
  viewingChallengeDateKey: string;
  username: string;
  challengeTitle: string;
  maxDurationSeconds: number;
  clipUri: string;
  secondaryClipUri: string | null;
  dualFrontIsPrimary: boolean;
};

type BackgroundPostUploadValue = {
  phase: BackgroundUploadPhase;
  progress: number;
  isActive: boolean;
  errorMessage: string | null;
  pendingFeedPlayback: PendingFeedPlayback | null;
  startBackgroundPost: (params: PostVideoUploadParams) => void;
  retryBackgroundPost: () => void;
  dismissFailure: () => void;
  clearPendingFeedPlayback: () => void;
};

const BackgroundPostUploadContext = React.createContext<BackgroundPostUploadValue | null>(null);

function buildPending(params: PostVideoUploadParams): PendingFeedPlayback {
  return {
    videoDocId: todayVideoDocId(params.uid, params.viewingChallengeDateKey),
    uid: params.uid,
    viewingChallengeDateKey: params.viewingChallengeDateKey,
    username: params.username,
    challengeTitle: params.challengeTitle,
    maxDurationSeconds: params.maxDurationSeconds,
    clipUri: params.clipUri,
    secondaryClipUri: params.secondaryClipUri,
    dualFrontIsPrimary: params.dualFrontIsPrimary,
  };
}

export function BackgroundPostUploadProvider({ children }: { children: React.ReactNode }) {
  const { markPostedToday, clearPostedOverride } = useAppState();
  const [phase, setPhase] = React.useState<BackgroundUploadPhase>('idle');
  const [progress, setProgress] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pendingFeedPlayback, setPendingFeedPlayback] = React.useState<PendingFeedPlayback | null>(null);
  const jobRef = React.useRef<PostVideoUploadParams | null>(null);
  const runningRef = React.useRef(false);

  const resetIdle = React.useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setErrorMessage(null);
    jobRef.current = null;
    runningRef.current = false;
  }, []);

  const clearPendingFeedPlayback = React.useCallback(() => {
    setPendingFeedPlayback(null);
    void cleanupStagedFeedPlaybackClips();
  }, []);

  const runJob = React.useCallback(
    async (params: PostVideoUploadParams) => {
      if (runningRef.current) return;
      runningRef.current = true;
      jobRef.current = params;
      setPhase('uploading');
      setProgress(0);
      setErrorMessage(null);

      let uploadParams = params;
      try {
        const stagedPrimary = await stageFeedPlaybackClip(params.clipUri, 'primary');
        let stagedSecondary: string | null = null;
        if (params.secondaryClipUri) {
          stagedSecondary = await stageFeedPlaybackClip(params.secondaryClipUri, 'pip');
        }
        setPendingFeedPlayback({
          ...buildPending(params),
          clipUri: stagedPrimary,
          secondaryClipUri: stagedSecondary,
        });
        uploadParams = {
          ...params,
          clipUri: stagedPrimary,
          secondaryClipUri: stagedSecondary,
        };
        jobRef.current = uploadParams;
      } catch {
        // Fall back to camera temp paths — still better than waiting on Storage.
        setPendingFeedPlayback(buildPending(params));
      }

      try {
        await runPostVideoUpload(uploadParams, {
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
        clearPendingFeedPlayback();
        const msg = e instanceof Error ? e.message : 'Upload failed. Try again.';
        setErrorMessage(msg);
        setPhase('failed');
        setProgress(0);
        runningRef.current = false;
        showError('Post failed', e);
      }
    },
    [markPostedToday, clearPostedOverride, resetIdle, clearPendingFeedPlayback]
  );

  const startBackgroundPost = React.useCallback(
    (params: PostVideoUploadParams) => {
      setPendingFeedPlayback(buildPending(params));
      markPostedToday();
      void runJob(params);
    },
    [runJob, markPostedToday]
  );

  const retryBackgroundPost = React.useCallback(() => {
    const job = jobRef.current;
    if (!job || runningRef.current) return;
    markPostedToday();
    void runJob(job);
  }, [runJob, markPostedToday]);

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
      pendingFeedPlayback,
      startBackgroundPost,
      retryBackgroundPost,
      dismissFailure,
      clearPendingFeedPlayback,
    }),
    [
      phase,
      progress,
      isActive,
      errorMessage,
      pendingFeedPlayback,
      startBackgroundPost,
      retryBackgroundPost,
      dismissFailure,
      clearPendingFeedPlayback,
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
