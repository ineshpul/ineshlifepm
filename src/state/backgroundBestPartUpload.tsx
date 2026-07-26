import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { cleanupStagedBestPartMedia, stageBestPartMedia } from '../lib/stageBestPartMedia';
import {
  allocateBestPartStoragePaths,
  runBestPartPostUpload,
  type BestPartPostUploadParams,
  type CancelableUpload,
} from '../services/bestPartUpload';
import {
  clearBestPartUploadProgressNotification,
  notifyBestPartUploadComplete,
  notifyBestPartUploadFailed,
  notifyBestPartUploadProgress,
} from '../services/bestPartUploadNotifications';
import { bestPartDocId } from '../types/bestPart';
import { showError } from '../utils/ui';
import { BackgroundPostAbortedError } from './backgroundPostUploadControl';
import type { BackgroundUploadPhase } from './backgroundPostUpload';
import {
  clearPendingBestPartUpload,
  loadPendingBestPartUpload,
  savePendingBestPartUpload,
} from './pendingBestPartUpload';

export type PendingBestPartPlayback = {
  id: string;
  uid: string;
  username: string;
  dateKey: string;
  caption: string;
  mediaType: BestPartPostUploadParams['mediaType'];
  localUri: string;
  secondaryUri: string | null;
  dualFrontIsPrimary: boolean;
  isPrivate: boolean;
  durationSeconds?: number;
};

type BackgroundBestPartUploadValue = {
  phase: BackgroundUploadPhase;
  progress: number;
  isActive: boolean;
  errorMessage: string | null;
  pendingBestPart: PendingBestPartPlayback | null;
  startBackgroundBestPart: (params: BestPartPostUploadParams) => void;
  retryBackgroundBestPart: () => void;
  dismissFailure: () => void;
  clearPendingBestPart: () => void;
  cancelBackgroundBestPart: () => void;
};

const BackgroundBestPartUploadContext = React.createContext<BackgroundBestPartUploadValue | null>(
  null
);

function buildPending(params: BestPartPostUploadParams): PendingBestPartPlayback {
  return {
    id: bestPartDocId(params.uid, params.dateKey),
    uid: params.uid,
    username: params.username,
    dateKey: params.dateKey,
    caption: params.caption,
    mediaType: params.mediaType,
    localUri: params.localUri,
    secondaryUri: params.secondaryUri ?? null,
    dualFrontIsPrimary: params.dualFrontIsPrimary === true,
    isPrivate: params.isPrivate,
    durationSeconds: params.durationSeconds,
  };
}

function withStableStoragePaths(params: BestPartPostUploadParams): BestPartPostUploadParams {
  if (params.primaryStoragePath) return params;
  const allocated = allocateBestPartStoragePaths({
    uid: params.uid,
    dateKey: params.dateKey,
    mediaType: params.mediaType,
    hasSecondary: Boolean(params.secondaryUri),
  });
  return {
    ...params,
    primaryStoragePath: allocated.primaryStoragePath,
    secondaryStoragePath: allocated.secondaryStoragePath,
  };
}

export function BackgroundBestPartUploadProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<BackgroundUploadPhase>('idle');
  const [progress, setProgress] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pendingBestPart, setPendingBestPart] = React.useState<PendingBestPartPlayback | null>(null);
  const jobRef = React.useRef<BestPartPostUploadParams | null>(null);
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
    void clearPendingBestPartUpload();
  }, []);

  const clearPendingBestPart = React.useCallback(() => {
    setPendingBestPart(null);
    void cleanupStagedBestPartMedia();
  }, []);

  const cancelBackgroundBestPart = React.useCallback(() => {
    uploadSessionIdRef.current += 1;
    try {
      uploadTaskRef.current?.cancel();
    } catch {
      /* ignore */
    }
    uploadTaskRef.current = null;
    runningRef.current = false;
    clearPendingBestPart();
    resetIdle();
    void clearBestPartUploadProgressNotification();
  }, [clearPendingBestPart, resetIdle]);

  const persistJob = React.useCallback(async (params: BestPartPostUploadParams) => {
    if (!params.primaryStoragePath) return;
    await savePendingBestPartUpload({
      params,
      primaryStoragePath: params.primaryStoragePath,
      secondaryStoragePath: params.secondaryStoragePath ?? null,
      savedAtMs: Date.now(),
    });
  }, []);

  const runJob = React.useCallback(
    async (params: BestPartPostUploadParams) => {
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
      void notifyBestPartUploadProgress(0, 'uploading');

      try {
        let uploadParams = stableParams;
        try {
          const [stagedPrimary, stagedSecondary] = await Promise.all([
            stageBestPartMedia(stableParams.localUri, 'primary', stableParams.mediaType),
            stableParams.secondaryUri
              ? stageBestPartMedia(stableParams.secondaryUri, 'pip', stableParams.mediaType)
              : Promise.resolve(null),
          ]);
          if (sessionId !== uploadSessionIdRef.current) {
            throw new BackgroundPostAbortedError();
          }
          setPendingBestPart({
            ...buildPending(stableParams),
            localUri: stagedPrimary,
            secondaryUri: stagedSecondary,
          });
          uploadParams = {
            ...stableParams,
            localUri: stagedPrimary,
            secondaryUri: stagedSecondary,
          };
          void persistJob(uploadParams);
        } catch (e) {
          if (e instanceof BackgroundPostAbortedError) throw e;
          const msg = String((e as Error)?.message ?? e);
          if (msg.includes('no longer on this device') || msg.includes('No media to stage')) {
            throw e;
          }
          setPendingBestPart(buildPending(stableParams));
        }

        await runBestPartPostUpload(uploadParams, {
          onProgress: (pct) => {
            setProgress(pct);
            void notifyBestPartUploadProgress(pct, 'uploading');
          },
          onSaving: () => {
            setPhase('saving');
            void notifyBestPartUploadProgress(100, 'saving');
          },
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
        clearPendingBestPart();
        resetIdle();
        void notifyBestPartUploadComplete();
      } catch (e) {
        if (e instanceof BackgroundPostAbortedError) {
          void clearBestPartUploadProgressNotification();
          return;
        }
        const msg = e instanceof Error ? e.message : 'Upload failed. Try again.';
        setErrorMessage(msg);
        setPhase('failed');
        setProgress(0);
        runningRef.current = false;
        void notifyBestPartUploadFailed(msg);
        showError('Moment failed to post', e);
      }
    },
    [clearPendingBestPart, persistJob, resetIdle]
  );

  const startBackgroundBestPart = React.useCallback(
    (params: BestPartPostUploadParams) => {
      uploadSessionIdRef.current += 1;
      try {
        uploadTaskRef.current?.cancel();
      } catch {
        /* ignore */
      }
      const stable = withStableStoragePaths(params);
      setPendingBestPart(buildPending(stable));
      void runJob(stable);
    },
    [runJob]
  );

  const retryBackgroundBestPart = React.useCallback(() => {
    const job = jobRef.current;
    if (!job || runningRef.current) return;
    void runJob(job);
  }, [runJob]);

  const dismissFailure = React.useCallback(() => {
    if (phase !== 'failed') return;
    clearPendingBestPart();
    resetIdle();
  }, [phase, clearPendingBestPart, resetIdle]);

  // Resume unfinished posts after force-quit / process death.
  React.useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    let cancelled = false;
    void (async () => {
      const pending = await loadPendingBestPartUpload();
      if (cancelled || !pending || runningRef.current) return;
      jobRef.current = pending.params;
      setPendingBestPart(buildPending(pending.params));
      void runJob(pending.params);
    })();
    return () => {
      cancelled = true;
    };
  }, [runJob]);

  // If a background URLSession finished while suspended, kick progress when we return.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (runningRef.current || phase === 'failed') return;
      void (async () => {
        const pending = await loadPendingBestPartUpload();
        if (!pending || runningRef.current) return;
        jobRef.current = pending.params;
        setPendingBestPart(buildPending(pending.params));
        void runJob(pending.params);
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [phase, runJob]);

  const isActive = phase === 'uploading' || phase === 'saving';

  const value = React.useMemo(
    (): BackgroundBestPartUploadValue => ({
      phase,
      progress,
      isActive,
      errorMessage,
      pendingBestPart,
      startBackgroundBestPart,
      retryBackgroundBestPart,
      dismissFailure,
      clearPendingBestPart,
      cancelBackgroundBestPart,
    }),
    [
      phase,
      progress,
      isActive,
      errorMessage,
      pendingBestPart,
      startBackgroundBestPart,
      retryBackgroundBestPart,
      dismissFailure,
      clearPendingBestPart,
      cancelBackgroundBestPart,
    ]
  );

  return (
    <BackgroundBestPartUploadContext.Provider value={value}>
      {children}
    </BackgroundBestPartUploadContext.Provider>
  );
}

export function useBackgroundBestPartUpload() {
  const ctx = React.useContext(BackgroundBestPartUploadContext);
  if (!ctx) {
    throw new Error('useBackgroundBestPartUpload must be used within BackgroundBestPartUploadProvider');
  }
  return ctx;
}
