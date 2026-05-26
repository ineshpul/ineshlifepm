import { useCallback, useRef, useState } from "react";
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
export function useIsDualCameraReady() {
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const readyRef = useRef({ front: false, back: false });
    const check = () => {
        if (readyRef.current.front && readyRef.current.back) {
            setIsReady(true);
        }
    };
    const onFrontCameraReady = useCallback(() => {
        readyRef.current.front = true;
        check();
    }, []);
    const onBackCameraReady = useCallback(() => {
        readyRef.current.back = true;
        check();
    }, []);
    const onFrontMountError = useCallback((e) => {
        setError(e.nativeEvent.message);
        setIsReady(false);
    }, []);
    const onBackMountError = useCallback((e) => {
        setError(e.nativeEvent.message);
        setIsReady(false);
    }, []);
    /** Reset state when tearing down or switching modes. */
    const reset = useCallback(() => {
        readyRef.current = { front: false, back: false };
        setIsReady(false);
        setError(null);
    }, []);
    return {
        isReady,
        error,
        onFrontCameraReady,
        onBackCameraReady,
        onFrontMountError,
        onBackMountError,
        reset,
    };
}
//# sourceMappingURL=useIsDualCameraReady.js.map