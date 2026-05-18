import * as MediaLibrary from 'expo-media-library';

export async function saveVideoToCameraRoll(uri: string): Promise<void> {
  if (!uri || uri.startsWith('demo://')) {
    throw new Error('No video to save.');
  }
  const p = await MediaLibrary.requestPermissionsAsync();
  if (!p.granted) {
    throw new Error('Permission was not granted.');
  }
  await MediaLibrary.saveToLibraryAsync(uri);
}
