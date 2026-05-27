import type { PermissionResponse } from "expo-modules-core";
import type { DualCameraCapturedPicture, DualCameraPictureOptions, DualCameraRecordingOptions, DualCameraRecordingResult } from "./ExpoDualCamera.types";
export { DualCameraFrontView, DualCameraBackView } from "./DualCameraView";
export type { DualCameraFrontViewProps, DualCameraBackViewProps, DualCameraCapturedPicture, DualCameraPictureOptions, DualCameraNormalizedPip, DualCameraRecordingOptions, DualCameraRecordingResult, FlashMode, FocusMode, CameraMountError, PermissionResponse, } from "./ExpoDualCamera.types";
export { useIsDualCameraReady } from "./useIsDualCameraReady";
/** Check if the device supports simultaneous front + back cameras. */
export declare function isSupported(): Promise<boolean>;
/** Checks user's permissions for accessing camera. */
export declare function getCameraPermissionsAsync(): Promise<PermissionResponse>;
/** Asks the user to grant permissions for accessing camera. */
export declare function requestCameraPermissionsAsync(): Promise<PermissionResponse>;
/**
 * Check or request permissions to access the camera.
 *
 * @example
 * ```ts
 * const [status, requestPermission] = useCameraPermissions();
 * ```
 */
export declare const useCameraPermissions: (options?: import("expo-modules-core").PermissionHookOptions<object> | undefined) => [PermissionResponse | null, () => Promise<PermissionResponse>, () => Promise<PermissionResponse>];
/**
 * Capture a photo from the specified camera.
 * @returns An object containing the file `uri`, `width`, and `height`.
 */
export declare function takePictureAsync(side: "front" | "back", options?: DualCameraPictureOptions): Promise<DualCameraCapturedPicture>;
/** Pause the camera session without tearing it down. */
export declare function pausePreview(): void;
/** Resume a paused camera session. Fires `onCameraReady` again on both views. */
export declare function resumePreview(): void;
/** Swap which camera is full-frame vs PiP while dual-cam recording (iOS MultiCam). */
export declare function swapRecordingLayout(): void;
/** Merge single-camera flip segments into one clip (iOS). */
export declare function concatVideoSegments(options: {
    uris: string[];
}): Promise<DualCameraRecordingResult>;
/** Start dual-cam PiP video recording (iOS MultiCam). */
export declare function startRecording(options: DualCameraRecordingOptions): Promise<void>;
/** Stop recording and return the composited MP4 file. */
export declare function stopRecording(): Promise<DualCameraRecordingResult>;
/**
 * Record until `stopRecording()` is called (matches expo-camera `recordAsync` ergonomics).
 */
export declare function recordAsync(options: DualCameraRecordingOptions): Promise<DualCameraRecordingResult>;
//# sourceMappingURL=index.d.ts.map