import * as React from 'react';
import * as ImagePicker from 'expo-image-picker';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import type { MessageAttachment } from '../types';
import { uploadChatAttachment, validateLocalFile } from '../../services/chat/chatUpload';

export function useAttachments(conversationId: string | undefined, uploaderUid: string | undefined) {
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const pickAndUploadImage = React.useCallback(async () => {
    if (!conversationId || !uploaderUid) return null;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    const mime = a.mimeType ?? 'image/jpeg';
    const v = await validateLocalFile(a.uri, mime);
    if (!v.ok) throw new Error(v.error);
    setBusy(true);
    setUploadProgress(0);
    try {
      return await uploadChatAttachment({
        conversationId,
        uploaderUid,
        localUri: a.uri,
        mimeType: mime,
        bytes: v.size,
        onProgress: setUploadProgress,
      });
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }, [conversationId, uploaderUid]);

  const pickAndUploadVideo = React.useCallback(async () => {
    if (!conversationId || !uploaderUid) return null;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    const mime = a.mimeType ?? 'video/mp4';
    const v = await validateLocalFile(a.uri, mime);
    if (!v.ok) throw new Error(v.error);
    let thumb: string | null = null;
    try {
      const t = await getThumbnailAsync(a.uri, { time: 400 });
      thumb = t.uri;
    } catch {
      thumb = null;
    }
    setBusy(true);
    setUploadProgress(0);
    try {
      const att = await uploadChatAttachment({
        conversationId,
        uploaderUid,
        localUri: a.uri,
        mimeType: mime,
        bytes: v.size,
        thumbnailUri: thumb,
        onProgress: setUploadProgress,
      });
      if (typeof a.duration === 'number' && a.duration > 0) {
        (att as MessageAttachment).durationSec = Math.round(a.duration / 1000);
      }
      return att;
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }, [conversationId, uploaderUid]);

  return { pickAndUploadImage, pickAndUploadVideo, uploadProgress, busy };
}
