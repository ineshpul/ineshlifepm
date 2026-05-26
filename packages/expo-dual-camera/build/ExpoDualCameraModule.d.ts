import { NativeModule } from "expo";
import type { PermissionResponse } from "expo-modules-core";
import type { DualCameraCapturedPicture, DualCameraPictureOptions, DualCameraRecordingOptions, DualCameraRecordingResult } from "./ExpoDualCamera.types";
declare class ExpoDualCameraModule extends NativeModule {
    isSupported(): Promise<boolean>;
    getCameraPermissionsAsync(): Promise<PermissionResponse>;
    requestCameraPermissionsAsync(): Promise<PermissionResponse>;
    takePictureAsync(side: "front" | "back", options?: DualCameraPictureOptions): Promise<DualCameraCapturedPicture>;
    startRecording(options?: DualCameraRecordingOptions): Promise<void>;
    stopRecording(): Promise<DualCameraRecordingResult>;
    pausePreview(): void;
    resumePreview(): void;
}
declare const _default: ExpoDualCameraModule;
export default _default;
//# sourceMappingURL=ExpoDualCameraModule.d.ts.map