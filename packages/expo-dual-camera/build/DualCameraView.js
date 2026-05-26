import { requireNativeViewManager } from "expo-modules-core";
import React from "react";
const NativeDualCamera = requireNativeViewManager("ExpoDualCamera");
export function DualCameraFrontView({ style, zoom, mirror, autofocus, onCameraReady, onMountError, }) {
    return (<NativeDualCamera style={style} side="front" zoom={zoom} mirror={mirror} autofocus={autofocus} onCameraReady={onCameraReady} onMountError={onMountError}/>);
}
export function DualCameraBackView({ style, lens = "wide", zoom, enableTorch, flash, mirror, autofocus, onCameraReady, onMountError, }) {
    return (<NativeDualCamera style={style} side="back" lens={lens} zoom={zoom} enableTorch={enableTorch} flash={flash} mirror={mirror} autofocus={autofocus} onCameraReady={onCameraReady} onMountError={onMountError}/>);
}
//# sourceMappingURL=DualCameraView.js.map