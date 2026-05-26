import { createPermissionHook } from "expo-modules-core";
import ExpoDualCameraModule from "./ExpoDualCameraModule";
export { DualCameraFrontView, DualCameraBackView } from "./DualCameraView";
export { useIsDualCameraReady } from "./useIsDualCameraReady";
/** Check if the device supports simultaneous front + back cameras. */
export async function isSupported() {
    return await ExpoDualCameraModule.isSupported();
}
/** Checks user's permissions for accessing camera. */
export async function getCameraPermissionsAsync() {
    return await ExpoDualCameraModule.getCameraPermissionsAsync();
}
/** Asks the user to grant permissions for accessing camera. */
export async function requestCameraPermissionsAsync() {
    return await ExpoDualCameraModule.requestCameraPermissionsAsync();
}
/**
 * Check or request permissions to access the camera.
 *
 * @example
 * ```ts
 * const [status, requestPermission] = useCameraPermissions();
 * ```
 */
export const useCameraPermissions = createPermissionHook({
    getMethod: getCameraPermissionsAsync,
    requestMethod: requestCameraPermissionsAsync,
});
/**
 * Capture a photo from the specified camera.
 * @returns An object containing the file `uri`, `width`, and `height`.
 */
export async function takePictureAsync(side, options) {
    return await ExpoDualCameraModule.takePictureAsync(side, options);
}
/** Pause the camera session without tearing it down. */
export function pausePreview() {
    ExpoDualCameraModule.pausePreview();
}
/** Resume a paused camera session. Fires `onCameraReady` again on both views. */
export function resumePreview() {
    ExpoDualCameraModule.resumePreview();
}
/** @type {{ resolve: (v: any) => void, reject: (e: any) => void, maxTimer?: ReturnType<typeof setTimeout>, settled?: boolean } | null} */
let pendingRecord = null;
/** @type {Promise<void> | null} */
let startInFlight = null;
function settlePendingRecord(result, isError = false) {
    const pending = pendingRecord;
    if (!pending || pending.settled) {
        return;
    }
    pending.settled = true;
    if (pending.maxTimer) {
        clearTimeout(pending.maxTimer);
    }
    pendingRecord = null;
    if (isError) {
        pending.reject(result);
    }
    else {
        pending.resolve(result);
    }
}
/** Start dual-cam PiP video recording (iOS MultiCam). */
export async function startRecording(options) {
    if (pendingRecord) {
        throw new Error('A dual-camera recording is already in progress');
    }
    if (startInFlight) {
        await startInFlight;
        return;
    }
    startInFlight = ExpoDualCameraModule.startRecording(options);
    try {
        await startInFlight;
    }
    finally {
        startInFlight = null;
    }
}
/** Stop recording and return the composited MP4 file. */
export async function stopRecording() {
    if (startInFlight) {
        await startInFlight.catch(() => { });
    }
    const result = await ExpoDualCameraModule.stopRecording();
    settlePendingRecord(result);
    return result;
}
/**
 * Record until `stopRecording()` is called (matches expo-camera `recordAsync` ergonomics).
 * Awaits native `startRecording` before arming the stop promise so `stopRecording` cannot race ahead of start.
 */
export async function recordAsync(options) {
    if (pendingRecord) {
        throw new Error('A dual-camera recording is already in progress');
    }
    const { onRecordingStarted, ...nativeOptions } = options ?? {};
    await startRecording(nativeOptions);
    onRecordingStarted?.();
    return await new Promise((resolve, reject) => {
        const maxMs = Math.max(1, Math.round((nativeOptions?.maxDurationSec || 60) * 1000));
        const timer = setTimeout(() => {
            void stopRecording().catch(() => { });
        }, maxMs + 650);
        pendingRecord = { resolve, reject, maxTimer: timer, settled: false };
    });
}
//# sourceMappingURL=index.js.map
