/** Limits for scalable, safe chat. Tune per product. */
export const CHAT_MAX_MESSAGE_CHARS = 4000;
export const CHAT_MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const CHAT_MAX_GROUP_MEMBERS = 50;
export const CHAT_MESSAGES_PAGE_SIZE = 40;

/** Storage / upload */
export const CHAT_MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
export const CHAT_MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const CHAT_MAX_DOC_BYTES = 25 * 1024 * 1024;
export const CHAT_MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export const CHAT_ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const CHAT_ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/quicktime'];
export const CHAT_ALLOWED_AUDIO_MIMES = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
export const CHAT_ALLOWED_DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const CHAT_TYPING_TTL_MS = 5000;
export const CHAT_MIN_MESSAGE_INTERVAL_MS = 400; // soft anti-flood (client)

export const CHAT_REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👍', '👎', '🎉'] as const;
