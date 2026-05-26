import type { CameraMountError } from "./ExpoDualCamera.types";
/**
 * Tracks readiness of the dual camera session.
 *
 * Both views must fire `onCameraReady` before `isReady` becomes `true`.
 *
 * ```tsx
 * const {
 *   isReady,
 *   onFrontCameraReady,
 *   onBackCameraReady,
 *   onFrontMountError,
 *   onBackMountError,
 * } = useIsDualCameraReady();
 *
 * <DualCameraFrontView
 *   onCameraReady={onFrontCameraReady}
 *   onMountError={onFrontMountError}
 *   style={styles.front}
 * />
 * <DualCameraBackView
 *   onCameraReady={onBackCameraReady}
 *   onMountError={onBackMountError}
 *   style={styles.back}
 * />
 *
 * <Button disabled={!isReady} title="Take Photo" onPress={snap} />
 * ```
 */
export declare function useIsDualCameraReady(): {
    readonly isReady: boolean;
    readonly error: string | null;
    readonly onFrontCameraReady: () => void;
    readonly onBackCameraReady: () => void;
    readonly onFrontMountError: (e: {
        nativeEvent: CameraMountError;
    }) => void;
    readonly onBackMountError: (e: {
        nativeEvent: CameraMountError;
    }) => void;
    readonly reset: () => void;
};
//# sourceMappingURL=useIsDualCameraReady.d.ts.map