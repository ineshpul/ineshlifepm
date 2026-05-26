import type { ViewStyle, StyleProp } from "react-native";
import type { PermissionResponse } from "expo-modules-core";
/**
 * Flash mode for the back camera.
 * - `off` - Flash is disabled.
 * - `on` - Flash will fire for every capture.
 * - `auto` - Flash will fire automatically when required.
 */
export type FlashMode = "off" | "on" | "auto";
/**
 * Focus mode for the camera.
 * - `on` - Autofocus once and lock.
 * - `off` - Continuous autofocus.
 * @default 'off'
 */
export type FocusMode = "on" | "off";
export type CameraMountError = {
    message: string;
};
export type DualCameraCapturedPicture = {
    /** File URI pointing to the captured JPEG. */
    uri: string;
    /** Image width in pixels. */
    width: number;
    /** Image height in pixels. */
    height: number;
    /** Base64 representation of the image, if requested. */
    base64?: string;
};
/** Normalized PiP rect (0–1) relative to the camera preview. */
export type DualCameraNormalizedPip = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type DualCameraRecordingOptions = {
    pip: DualCameraNormalizedPip;
    maxDurationSec: number;
    /** Mirror the front PiP in the composite. @default true */
    mirrorFront?: boolean;
    /** Injected by native when the capture session has a mic track. Omit in app code. */
    recordsAudio?: boolean;
    /** Called after native `startRecording` succeeds, before waiting for `stopRecording`. */
    onRecordingStarted?: () => void;
};
export type DualCameraRecordingResult = {
    uri: string;
    durationMs: number;
    width: number;
    height: number;
};
export type DualCameraPictureOptions = {
    /**
     * Compression quality from `0` to `1`. `0` = small size, `1` = max quality.
     * @default 1
     */
    quality?: number;
    /** Whether to also include the image data in Base64 format. */
    base64?: boolean;
};
export type DualCameraFrontViewProps = {
    style?: StyleProp<ViewStyle>;
    /**
     * A value between `0` and `1` being a percentage of device's max zoom.
     * @default 0
     */
    zoom?: number;
    /**
     * Whether to mirror the camera preview.
     * @default false
     */
    mirror?: boolean;
    /**
     * Focus mode.
     * @default 'off'
     */
    autofocus?: FocusMode;
    /** Callback invoked when camera preview has been set. */
    onCameraReady?: () => void;
    /** Callback invoked when camera preview could not start. */
    onMountError?: (event: {
        nativeEvent: CameraMountError;
    }) => void;
};
export type DualCameraBackViewProps = {
    style?: StyleProp<ViewStyle>;
    /**
     * Which back lens to use.
     * @default 'wide'
     */
    lens?: "wide" | "ultraWide" | "telephoto";
    /**
     * A value between `0` and `1` being a percentage of device's max zoom.
     * @default 0
     */
    zoom?: number;
    /**
     * Enable the torch.
     * @default false
     */
    enableTorch?: boolean;
    /**
     * Flash mode for photo capture.
     * @default 'off'
     */
    flash?: FlashMode;
    /**
     * Whether to mirror the camera preview.
     * @default false
     */
    mirror?: boolean;
    /**
     * Focus mode.
     * @default 'off'
     */
    autofocus?: FocusMode;
    /** Callback invoked when camera preview has been set. */
    onCameraReady?: () => void;
    /** Callback invoked when camera preview could not start. */
    onMountError?: (event: {
        nativeEvent: CameraMountError;
    }) => void;
};
export { PermissionResponse };
//# sourceMappingURL=ExpoDualCamera.types.d.ts.map