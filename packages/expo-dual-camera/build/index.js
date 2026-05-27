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
/** Swap which camera is full-frame vs PiP while dual-cam recording (iOS MultiCam). */
export function swapRecordingLayout() {
    ExpoDualCameraModule.swapRecordingLayout();
}
/** Merge single-camera flip segments into one clip (iOS). */
export async function concatVideoSegments(options) {
    return await ExpoDualCameraModule.concatVideoSegments(options);
}
let pendingRecord = null;
/** Start dual-cam PiP video recording (iOS MultiCam). */
export async function startRecording(options) {
    if (pendingRecord) {
        throw new Error('A dual-camera recording is already in progress');
    }
    await ExpoDualCameraModule.startRecording(options);
}
/** Stop recording and return the composited MP4 file. */
export async function stopRecording() {
    const result = await ExpoDualCameraModule.stopRecording();
    if (pendingRecord) {
        if (pendingRecord.maxTimer) {
            clearTimeout(pendingRecord.maxTimer);
        }
        pendingRecord.resolve(result);
        pendingRecord = null;
    }
    return result;
}
/**
 * Record until `stopRecording()` is called (matches expo-camera `recordAsync` ergonomics).
 */
export function recordAsync(options) {
    if (pendingRecord) {
        return Promise.reject(new Error('A dual-camera recording is already in progress'));
    }
    return new Promise((resolve, reject) => {
        const maxMs = Math.max(1, Math.round((options?.maxDurationSec || 60) * 1000));
        const timer = setTimeout(() => {
            stopRecording().catch(() => { });
        }, maxMs + 650);
        pendingRecord = { resolve, reject, maxTimer: timer };
        ExpoDualCameraModule.startRecording(options).catch((e) => {
            clearTimeout(timer);
            pendingRecord = null;
            reject(e);
        });
    });
}
//# sourceMappingURL=index.js.map