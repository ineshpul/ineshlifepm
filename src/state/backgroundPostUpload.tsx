import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AppState, type AppStateStatus } from 'react-native';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { blocksSoloLeapRepost } from '../lib/leapVideoDoc';
import { cleanupStagedFeedPlaybackClips, stageFeedPlaybackClip } from '../lib/stageFeedPlaybackClip';
import {
  allocateLeapStoragePaths,
  type CancelableUpload,
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
import {
  clearPendingPostUpload,
  loadPendingPostUpload,
  savePendingPostUpload,
} from './pendingPostUpload';
import { todayVideoDocId } from './posting';

async function alreadyPostedLeap(uid: string, challengeDate: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firestore(), 'videos', todayVideoDocId(uid, challengeDate)));
    if (!snap.exists()) return false;
    return blocksSoloLeapRepost(snap.data(), uid);
  } catch {
    return false;
  }
}

export type BackgroundUploadPhase = 'idle' | 'uploading' | 'saving' | 'failed';

/** Local clip URIs for instant feed playback after post ΓÇö avoids re-downloading from Storage. */
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
  mediaType?: 'video' | 'photo';
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
    mediaType: params.mediaType === 'photo' ? 'photo' : 'video',
  };
}

function withStableStoragePaths(params: PostVideoUploadParams): PostVideoUploadParams {
  if (params.primaryStoragePath) return params;
  const mediaType = params.mediaType === 'photo' ? 'photo' : 'video';
  const allocated = allocateLeapStoragePaths({
    uid: params.uid,
    challengeDate: params.viewingChallengeDateKey,
    hasSecondary: mediaType === 'video' && Boolean(params.secondaryClipUri),
    mediaType,
  });
  return {
    ...params,
    primaryStoragePath: allocated.primaryStoragePath,
    secondaryStoragePath: allocated.secondaryStoragePath,
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
  const uploadTaskRef = React.useRef<CancelableUpload | null>(null);
  const resumeCheckedRef = React.useRef(false);

  const resetIdle = React.useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setErrorMessage(null);
    jobRef.current = null;
    runningRef.current = false;
    uploadTaskRef.current = null;
    void clearPendingPostUpload();
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

  const persistJob = React.useCallback(async (params: PostVideoUploadParams) => {
    if (!params.primaryStoragePath) return;
    await savePendingPostUpload({
      params,
      primaryStoragePath: params.primaryStoragePath,
      secondaryStoragePath: params.secondaryStoragePath ?? null,
      savedAtMs: Date.now(),
    });
  }, []);

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
      const stableParams = withStableStoragePaths(params);
      jobRef.current = stableParams;
      setPhase('uploading');
      setProgress(0);
      setErrorMessage(null);
      void persistJob(stableParams);

      try {
        if (await alreadyPostedLeap(stableParams.uid, stableParams.viewingChallengeDateKey)) {
          if (sessionId !== uploadSessionIdRef.current) return;
          markPostedToday();
          resetIdle();
          return;
        }

        let uploadParams = stableParams;
        try {
          const [stagedPrimary, stagedSecondary] = await Promise.all([
            stageFeedPlaybackClip(stableParams.clipUri, 'primary'),
            stableParams.secondaryClipUri
              ? stageFeedPlaybackClip(stableParams.secondaryClipUri, 'pip')
              : Promise.resolve(null),
          ]);
          if (sessionId !== uploadSessionIdRef.current) {
            throw new BackgroundPostAbortedError();
          }
          setPendingFeedPlayback({
            ...buildPending(stableParams),
            clipUri: stagedPrimary,
            secondaryClipUri: stagedSecondary,
          });
          uploadParams = {
            ...stableParams,
            clipUri: stagedPrimary,
            secondaryClipUri: stagedSecondary,
          };
          void persistJob(uploadParams);
        } catch (e) {
          if (e instanceof BackgroundPostAbortedError) throw e;
          const msg = String((e as Error)?.message ?? e);
          if (msg.includes('no longer on this device') || msg.includes('No video to stage')) {
            throw e;
          }
          // Fall back to camera temp paths when staging fails for transient reasons.
          setPendingFeedPlayback(buildPending(stableParams));
        }

        await runPostVideoUpload(uploadParams, {
          onProgress: setProgress,
          onSaving: () => setPhase('saving'),
          shouldAbort: () => sessionId !== uploadSessionIdRef.current,
          onUploadTask: (task) => {
            uploadTaskRef.current = task;
          },
          onStoragePaths: (paths) => {
            const next = {
              ...uploadParams,
              primaryStoragePath: paths.primaryStoragePath,
              secondaryStoragePath: paths.secondaryStoragePath,
            };
            jobRef.current = next;
            void persistJob(next);
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
              uid: stableParams.uid,
              challengeDate: stableParams.viewingChallengeDateKey,
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
    [clearPostedOverride, markPostedToday, persistJob, resetIdle]
  );

  const startBackgroundPost = React.useCallback(
    (params: PostVideoUploadParams) => {
      uploadSessionIdRef.current += 1;
      try {
        uploadTaskRef.current?.cancel();
      } catch {
        /* ignore */
      }
      const stable = withStableStoragePaths(params);
      setPendingFeedPlayback(buildPending(stable));
      markPostedToday();
      void runJob(stable);
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

  // Resume unfinished posts after force-quit / process death.
  React.useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    let cancelled = false;
    void (async () => {
      const pending = await loadPendingPostUpload();
      if (cancelled || !pending || runningRef.current) return;
      jobRef.current = pending.params;
      setPendingFeedPlayback(buildPending(pending.params));
      markPostedToday();
      void runJob(pending.params);
    })();
    return () => {
      cancelled = true;
    };
  }, [markPostedToday, runJob]);

  // If a background URLSession finished while suspended, kick progress when we return.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (runningRef.current || phase === 'failed') return;
      void (async () => {
        const pending = await loadPendingPostUpload();
        if (!pending || runningRef.current) return;
        jobRef.current = pending.params;
        setPendingFeedPlayback(buildPending(pending.params));
        markPostedToday();
        void runJob(pending.params);
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [markPostedToday, phase, runJob]);

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
