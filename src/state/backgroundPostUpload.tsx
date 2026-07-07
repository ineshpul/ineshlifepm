import * as React from 'react';
import type { UploadTask } from 'firebase/storage';

import { isFirebaseConfigured } from '../firebase/firebase';
import { cleanupStagedFeedPlaybackClips, stageFeedPlaybackClip } from '../lib/stageFeedPlaybackClip';
import {
  PostVideoUploadParams,
  refundPostAttemptIfFailed,
  runPostVideoUpload,
} from '../services/postVideoUpload';
import { showError } from '../utils/ui';
import { useAppState } from './appState';
import {
  BackgroundPostAbortedError,
  registerBackgroundPostCancel,
} from './backgroundPostUploadControl';
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
  cancelBackgroundPost: () => void;
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
  const uploadSessionIdRef = React.useRef(0);
  const uploadTaskRef = React.useRef<UploadTask | null>(null);

  const resetIdle = React.useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setErrorMessage(null);
    jobRef.current = null;
    runningRef.current = false;
    uploadTaskRef.current = null;
  }, []);

  const clearPendingFeedPlayback = React.useCallback(() => {
    setPendingFeedPlayback(null);
    void cleanupStagedFeedPlaybackClips();
  }, []);

  const cancelBackgroundPost = React.useCallback(() => {
    uploadSessionIdRef.current += 1;
    try {
      uploadTaskRef.current?.cancel();
    } catch {
      /* ignore */
    }
    uploadTaskRef.current = null;
    runningRef.current = false;
    clearPostedOverride();
    clearPendingFeedPlayback();
    resetIdle();
  }, [clearPostedOverride, resetIdle, clearPendingFeedPlayback]);

  React.useEffect(() => {
    registerBackgroundPostCancel(cancelBackgroundPost);
    return () => registerBackgroundPostCancel(null);
  }, [cancelBackgroundPost]);

  const runJob = React.useCallback(
    async (params: PostVideoUploadParams) => {
      if (runningRef.current) {
        uploadSessionIdRef.current += 1;
        try {
          uploadTaskRef.current?.cancel();
        } catch {
          /* ignore */
        }
      }
      const sessionId = uploadSessionIdRef.current;
      runningRef.current = true;
      jobRef.current = params;
      setPhase('uploading');
      setProgress(0);
      setErrorMessage(null);

      try {
        let uploadParams = params;
        try {
          const [stagedPrimary, stagedSecondary] = await Promise.all([
            stageFeedPlaybackClip(params.clipUri, 'primary'),
            params.secondaryClipUri
              ? stageFeedPlaybackClip(params.secondaryClipUri, 'pip')
              : Promise.resolve(null),
          ]);
          if (sessionId !== uploadSessionIdRef.current) {
            throw new BackgroundPostAbortedError();
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
        } catch (e) {
          if (e instanceof BackgroundPostAbortedError) throw e;
          const msg = String((e as Error)?.message ?? e);
          if (msg.includes('no longer on this device') || msg.includes('No video to stage')) {
            throw e;
          }
          // Fall back to camera temp paths when staging fails for transient reasons.
          setPendingFeedPlayback(buildPending(params));
        }

        await runPostVideoUpload(uploadParams, {
          onProgress: setProgress,
          onSaving: () => setPhase('saving'),
          shouldAbort: () => sessionId !== uploadSessionIdRef.current,
          onUploadTask: (task) => {
            uploadTaskRef.current = task;
          },
        });
        if (sessionId !== uploadSessionIdRef.current) return;
        resetIdle();
      } catch (e) {
        if (e instanceof BackgroundPostAbortedError) {
          return;
        }
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
        // Keep staged clips so Retry can read the file again.
        const msg = e instanceof Error ? e.message : 'Upload failed. Try again.';
        setErrorMessage(msg);
        setPhase('failed');
        setProgress(0);
        runningRef.current = false;
        showError('Post failed', e);
      }
    },
    [clearPostedOverride, resetIdle]
  );

  const startBackgroundPost = React.useCallback(
    (params: PostVideoUploadParams) => {
      uploadSessionIdRef.current += 1;
      try {
        uploadTaskRef.current?.cancel();
      } catch {
        /* ignore */
      }
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
    clearPendingFeedPlayback();
    resetIdle();
  }, [phase, resetIdle, clearPendingFeedPlayback]);

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
      cancelBackgroundPost,
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
      cancelBackgroundPost,
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
