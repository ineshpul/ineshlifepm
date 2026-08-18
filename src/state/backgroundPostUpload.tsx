import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AppState, type AppStateStatus } from 'react-native';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { blocksSoloLeapRepost } from '../lib/leapVideoDoc';
import {
  cleanupStagedFeedPlaybackClips,
  localMediaFileExists,
  stageFeedPlaybackClip,
} from '../lib/stageFeedPlaybackClip';
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
  const persistEpochRef = React.useRef(0);
  const resumeCheckedRef = React.useRef(false);

  const resetIdle = React.useCallback(() => {
    const epoch = ++persistEpochRef.current;
    setPhase('idle');
    setProgress(0);
    setErrorMessage(null);
    jobRef.current = null;
    runningRef.current = false;
    uploadTaskRef.current = null;
    void (async () => {
      await clearPendingPostUpload();
      if (persistEpochRef.current !== epoch) {
        const job = jobRef.current;
        if (job?.primaryStoragePath) {
          await savePendingPostUpload({
            params: job,
            primaryStoragePath: job.primaryStoragePath,
            secondaryStoragePath: job.secondaryStoragePath ?? null,
            savedAtMs: Date.now(),
            sessionId: uploadSessionIdRef.current,
          });
        }
      }
    })();
  }, []);

  const clearPendingFeedPlayback = React.useCallback(() => {
    // A replacement post may already be running (same leap-day doc id). Never
    // delete that take's staged files because the user deleted the previous one.
    if (runningRef.current) return;
    setPendingFeedPlayback(null);
    const sessionToClean = uploadSessionIdRef.current;
    void cleanupStagedFeedPlaybackClips(sessionToClean);
  }, []);

  const cancelBackgroundPost = React.useCallback(() => {
    const cancelledSession = uploadSessionIdRef.current;
    uploadSessionIdRef.current += 1;
    persistEpochRef.current += 1;
    try {
      uploadTaskRef.current?.cancel();
    } catch {
      /* ignore */
    }
    uploadTaskRef.current = null;
    runningRef.current = false;
    clearPostedOverride();
    setPendingFeedPlayback(null);
    void cleanupStagedFeedPlaybackClips(cancelledSession);
    resetIdle();
  }, [clearPostedOverride, resetIdle]);

  React.useEffect(() => {
    registerBackgroundPostCancel(cancelBackgroundPost);
    return () => registerBackgroundPostCancel(null);
  }, [cancelBackgroundPost]);

  const persistJob = React.useCallback(async (params: PostVideoUploadParams) => {
    if (!params.primaryStoragePath) return;
    const epoch = persistEpochRef.current;
    await savePendingPostUpload({
      params,
      primaryStoragePath: params.primaryStoragePath,
      secondaryStoragePath: params.secondaryStoragePath ?? null,
      savedAtMs: Date.now(),
      sessionId: uploadSessionIdRef.current,
    });
    if (persistEpochRef.current !== epoch && !jobRef.current) {
      await clearPendingPostUpload();
    }
  }, []);

  const stageClips = React.useCallback(
    async (params: PostVideoUploadParams, sessionId: number): Promise<PostVideoUploadParams> => {
      const mediaType = params.mediaType === 'photo' ? 'photo' : 'video';
      const stageOne = async (
        preferred: string,
        fallback: string | null | undefined,
        tag: 'primary' | 'pip'
      ) => {
        const candidates = [preferred, fallback].filter((u, i, all): u is string => {
          if (!u || u.startsWith('demo://')) return false;
          return all.indexOf(u) === i;
        });
        let lastErr: unknown = new Error('No video to stage.');
        for (const uri of candidates) {
          try {
            return await stageFeedPlaybackClip(uri, tag, { sessionId, mediaType });
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr;
      };

      const [stagedPrimary, stagedSecondary] = await Promise.all([
        stageOne(params.clipUri, params.sourceClipUri, 'primary'),
        params.secondaryClipUri || params.sourceSecondaryClipUri
          ? stageOne(
              params.secondaryClipUri || params.sourceSecondaryClipUri || '',
              params.sourceSecondaryClipUri,
              'pip'
            )
          : Promise.resolve(null),
      ]);

      return {
        ...params,
        clipUri: stagedPrimary,
        secondaryClipUri: stagedSecondary,
        sourceClipUri: params.sourceClipUri || params.clipUri,
        sourceSecondaryClipUri:
          params.sourceSecondaryClipUri !== undefined
            ? params.sourceSecondaryClipUri
            : params.secondaryClipUri,
      };
    },
    []
  );

  const runJob = React.useCallback(
    async (params: PostVideoUploadParams) => {
      if (runningRef.current) {
        const previousSession = uploadSessionIdRef.current;
        uploadSessionIdRef.current += 1;
        try {
          uploadTaskRef.current?.cancel();
        } catch {
          /* ignore */
        }
        void cleanupStagedFeedPlaybackClips(previousSession);
      }
      const sessionId = uploadSessionIdRef.current;
      runningRef.current = true;
      persistEpochRef.current += 1;
      const withSources: PostVideoUploadParams = {
        ...params,
        sourceClipUri: params.sourceClipUri || params.clipUri,
        sourceSecondaryClipUri:
          params.sourceSecondaryClipUri !== undefined
            ? params.sourceSecondaryClipUri
            : params.secondaryClipUri,
      };
      const stableParams = withStableStoragePaths(withSources);
      jobRef.current = stableParams;
      setPhase('uploading');
      setProgress(0);
      setErrorMessage(null);

      try {
        // Copy off camera temp BEFORE any network so iOS/Android can reclaim
        // the recording as soon as Record unmounts.
        let uploadParams = stableParams;
        try {
          uploadParams = await stageClips(stableParams, sessionId);
          if (sessionId !== uploadSessionIdRef.current) {
            throw new BackgroundPostAbortedError();
          }
          jobRef.current = uploadParams;
          setPendingFeedPlayback(buildPending(uploadParams));
          void persistJob(uploadParams);
        } catch (e) {
          if (e instanceof BackgroundPostAbortedError) throw e;
          const msg = String((e as Error)?.message ?? e);
          if (msg.includes('no longer on this device') || msg.includes('No video to stage')) {
            throw e;
          }
          setPendingFeedPlayback(buildPending(stableParams));
          void persistJob(stableParams);
        }

        if (await alreadyPostedLeap(uploadParams.uid, uploadParams.viewingChallengeDateKey)) {
          if (sessionId !== uploadSessionIdRef.current) return;
          markPostedToday();
          resetIdle();
          return;
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
        markPostedToday();
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
    [clearPostedOverride, markPostedToday, persistJob, resetIdle, stageClips]
  );

  const startBackgroundPost = React.useCallback(
    (params: PostVideoUploadParams) => {
      const previousSession = uploadSessionIdRef.current;
      uploadSessionIdRef.current += 1;
      persistEpochRef.current += 1;
      try {
        uploadTaskRef.current?.cancel();
      } catch {
        /* ignore */
      }
      runningRef.current = false;
      void cleanupStagedFeedPlaybackClips(previousSession);
      const stable = withStableStoragePaths({
        ...params,
        sourceClipUri: params.sourceClipUri || params.clipUri,
        sourceSecondaryClipUri:
          params.sourceSecondaryClipUri !== undefined
            ? params.sourceSecondaryClipUri
            : params.secondaryClipUri,
      });
      setPendingFeedPlayback(buildPending(stable));
      void runJob(stable);
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
    clearPostedOverride();
    clearPendingFeedPlayback();
    resetIdle();
  }, [phase, resetIdle, clearPendingFeedPlayback, clearPostedOverride]);

  const resumeIfPending = React.useCallback(async () => {
    if (runningRef.current) return;
    const pending = await loadPendingPostUpload();
    if (!pending || runningRef.current) return;
    if (
      pending.sessionId != null &&
      pending.sessionId !== uploadSessionIdRef.current &&
      uploadSessionIdRef.current !== 0
    ) {
      return;
    }
    const clipReady =
      (await localMediaFileExists(pending.params.clipUri)) ||
      (pending.params.sourceClipUri
        ? await localMediaFileExists(pending.params.sourceClipUri)
        : false);
    if (!clipReady) {
      await clearPendingPostUpload();
      return;
    }
    if (await alreadyPostedLeap(pending.params.uid, pending.params.viewingChallengeDateKey)) {
      await clearPendingPostUpload();
      return;
    }
    jobRef.current = pending.params;
    if (pending.sessionId && pending.sessionId > uploadSessionIdRef.current) {
      uploadSessionIdRef.current = pending.sessionId;
    }
    setPendingFeedPlayback(buildPending(pending.params));
    void runJob(pending.params);
  }, [runJob]);

  // Resume unfinished posts after force-quit / process death.
  React.useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await resumeIfPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeIfPending]);

  // If a background URLSession finished while suspended, kick progress when we return.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (runningRef.current || phase === 'failed') return;
      void resumeIfPending();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [phase, resumeIfPending]);

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
