# expo-dual-camera

Native dual camera support for Expo apps using AVCaptureMultiCamSession (iOS) and CameraX (Android).

## Features

- True simultaneous front and back camera capture
- Two standalone components — style them like any React Native view
- Standard `ViewStyle` props: `position`, `borderRadius`, `zIndex`, `overflow` all just work
- Back camera lens selection: wide, ultra-wide, telephoto
- iOS 13+ with AVCaptureMultiCamSession
- Android API 24+ with CameraX

## Installation

```bash
npx expo install expo-dual-camera
```

## Usage

```tsx
import { DualCameraFront, DualCameraBack, isSupported } from "expo-dual-camera";
import { StyleSheet, View } from "react-native";
```

### Picture-in-Picture

```tsx
<View style={styles.container}>
  <DualCameraBack style={StyleSheet.absoluteFill} />
  <DualCameraFront style={styles.pip} />
</View>
```

### Swapped PiP (front big, back small)

```tsx
<View style={styles.container}>
  <DualCameraFront style={StyleSheet.absoluteFill} />
  <DualCameraBack style={styles.pip} lens="ultraWide" />
</View>
```

### Side by Side

```tsx
<View style={styles.container}>
  <DualCameraBack style={styles.left} />
  <DualCameraFront style={styles.right} />
</View>
```

### With Other React Native Views

```tsx
<View style={styles.container}>
  <DualCameraBack style={StyleSheet.absoluteFill} />
  <DualCameraFront style={styles.pip} />
  <Text style={styles.label}>Recording...</Text>
  <TouchableOpacity style={styles.button} onPress={capture}>
    <View style={styles.captureCircle} />
  </TouchableOpacity>
</View>
```

### Example Styles

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  pip: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: "hidden",
  },
  left: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "50%",
    height: "100%",
  },
  right: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "50%",
    height: "100%",
  },
});
```

## Components

### `<DualCameraBack />`

Renders the back (rear) camera preview.

| Prop    | Type                                   | Default  | Description                                                                       |
| ------- | -------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `style` | `StyleProp<ViewStyle>`                 | —        | Standard React Native styles                                                      |
| `lens`  | `'wide' \| 'ultraWide' \| 'telephoto'` | `'wide'` | Physical lens to use (iOS selects the actual lens; Android approximates via zoom) |

### `<DualCameraFront />`

Renders the front (selfie) camera preview.

| Prop    | Type                   | Default | Description                  |
| ------- | ---------------------- | ------- | ---------------------------- |
| `style` | `StyleProp<ViewStyle>` | —       | Standard React Native styles |

### Session Lifecycle

The camera session starts automatically when both `DualCameraFront` and `DualCameraBack` are mounted, and stops when either is unmounted. No manual start/stop is needed.

## Functions

### `isSupported()`

Returns `Promise<boolean>` indicating whether the device supports simultaneous dual camera capture.

```tsx
const supported = await isSupported();
if (!supported) {
  // Fall back to single camera
}
```

## Lens Selection (iOS)

On iOS, `lens` selects the physical camera lens:

| Value         | Lens                          | Approx. zoom |
| ------------- | ----------------------------- | ------------ |
| `'wide'`      | Built-in wide angle (default) | 1×           |
| `'ultraWide'` | Built-in ultra wide angle     | 0.5×         |
| `'telephoto'` | Built-in telephoto            | 2×–5×        |

Not all devices have all lenses. If the requested lens isn't available, it falls back to wide angle.

On Android, `lens` is approximated using CameraX zoom ratios on the default back camera.

## Permissions

Camera permissions must be granted before the views will display a preview. Use `expo-camera`'s permission APIs or handle permissions in your app before rendering the components.

## Requirements

- iOS 13+ on a device that supports `AVCaptureMultiCamSession` (iPhone XS and later)
- Android API 24+ with CameraX concurrent camera support
- Requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) — does not work in Expo Go

## License

MIT
