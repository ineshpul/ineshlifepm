import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import ffmpegStatic from 'ffmpeg-static';

/** Bump when encode settings change so existing `_feed.mp4` objects are rebuilt. */
export const FEED_ENCODE_VERSION = '720p-v1';

function firebaseDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

/** Leap camera clips: videos/{uid}/{yyyy-mm-dd}/{file}.mp4 */
const LEAP_VIDEO_PATH_RE = /^videos\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/([^/]+\.mp4)$/i;

/** Best Part clips: bestParts/{uid}/{yyyy-mm-dd}/{file}.mp4 */
const BEST_PART_VIDEO_PATH_RE = /^bestParts\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/([^/]+\.mp4)$/i;

type ClipRole = 'primary' | 'pip';

type ParsedFeedClip = {
  kind: 'leap' | 'bestPart';
  uid: string;
  dayKey: string;
  fileName: string;
  role: ClipRole;
  feedObjectPath: string;
  docCollection: 'videos' | 'bestParts';
  docId: string;
};

function feedFileNameForSource(fileName: string, isPip: boolean): string {
  return isPip
    ? fileName.replace(/_pip\.mp4$/i, '_pip_feed.mp4')
    : fileName.replace(/\.mp4$/i, '_feed.mp4');
}

export function parseLeapVideoPath(objectPath: string): ParsedFeedClip | null {
  const m = objectPath.match(LEAP_VIDEO_PATH_RE);
  if (!m) return null;
  const uid = m[1];
  const dayKey = m[2];
  const fileName = m[3];
  if (/_feed\.mp4$/i.test(fileName)) return null;

  const isPip = /_pip\.mp4$/i.test(fileName);
  const feedFileName = feedFileNameForSource(fileName, isPip);
  return {
    kind: 'leap',
    uid,
    dayKey,
    fileName,
    role: isPip ? 'pip' : 'primary',
    feedObjectPath: `videos/${uid}/${dayKey}/${feedFileName}`,
    docCollection: 'videos',
    docId: `${uid}_${dayKey}`,
  };
}

export function parseBestPartVideoPath(objectPath: string): ParsedFeedClip | null {
  const m = objectPath.match(BEST_PART_VIDEO_PATH_RE);
  if (!m) return null;
  const uid = m[1];
  const dayKey = m[2];
  const fileName = m[3];
  if (/_feed\.mp4$/i.test(fileName)) return null;

  const isPip = /_pip\.mp4$/i.test(fileName);
  const feedFileName = feedFileNameForSource(fileName, isPip);
  return {
    kind: 'bestPart',
    uid,
    dayKey,
    fileName,
    role: isPip ? 'pip' : 'primary',
    feedObjectPath: `bestParts/${uid}/${dayKey}/${feedFileName}`,
    docCollection: 'bestParts',
    docId: `${uid}_${dayKey}`,
  };
}

export function parseFeedVideoPath(objectPath: string): ParsedFeedClip | null {
  return parseLeapVideoPath(objectPath) ?? parseBestPartVideoPath(objectPath);
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegStatic;
  if (!bin) {
    return Promise.reject(new Error('ffmpeg-static binary missing for this platform'));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });
  });
}

/**
 * Phone-feed encode: max width 720, H.264 + AAC, moov-at-front.
 * Keeps portrait 9:16 as ~720×1280. Does not upscale smaller sources.
 */
function runFfmpegFeedEncode(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    "scale='min(720,iw)':-2",
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-maxrate',
    '3500k',
    '-bufsize',
    '7000k',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

/** First-frame JPEG for instant feed paint while the MP4 buffers. */
function runFfmpegPoster(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-ss',
    '0.05',
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '5',
    '-vf',
    "scale='min(720,iw)':-2",
    outputPath,
  ]);
}

function posterObjectPathForFeed(feedObjectPath: string): string {
  if (/_pip_feed\.mp4$/i.test(feedObjectPath)) {
    return feedObjectPath.replace(/_pip_feed\.mp4$/i, '_pip_poster.jpg');
  }
  return feedObjectPath.replace(/_feed\.mp4$/i, '_poster.jpg');
}

async function downloadToTemp(
  bucket: ReturnType<ReturnType<typeof admin.storage>['bucket']>,
  objectPath: string,
  localPath: string
): Promise<void> {
  await bucket.file(objectPath).download({ destination: localPath });
}

async function uploadFeedFile(args: {
  bucket: ReturnType<ReturnType<typeof admin.storage>['bucket']>;
  localPath: string;
  feedObjectPath: string;
  sourceObjectPath: string;
  docId: string;
  role: ClipRole;
  kind: 'leap' | 'bestPart';
}): Promise<string> {
  const { bucket, localPath, feedObjectPath, sourceObjectPath, docId, role, kind } = args;
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination: feedObjectPath,
    metadata: {
      contentType: 'video/mp4',
      metadata: {
        feedEncodeVersion: FEED_ENCODE_VERSION,
        faststart: 'true',
        sourceObjectPath,
        videoDocId: docId,
        role,
        kind,
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  return firebaseDownloadUrl(bucket.name, feedObjectPath, token);
}

async function patchDocFeedUrl(args: {
  collection: 'videos' | 'bestParts';
  docId: string;
  role: ClipRole;
  feedUrl: string;
  feedStoragePath: string;
  posterUrl?: string;
  posterStoragePath?: string;
}): Promise<boolean> {
  const { collection, docId, role, feedUrl, feedStoragePath, posterUrl, posterStoragePath } = args;
  const ref = admin.firestore().doc(`${collection}/${docId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    logger.info('Doc not ready yet; feed file uploaded, will patch on create', {
      collection,
      docId,
      role,
      feedStoragePath,
    });
    return false;
  }

  const patch: Record<string, unknown> = {
    faststartReady: true,
    feedEncodeVersion: FEED_ENCODE_VERSION,
    faststartUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (role === 'pip') {
    patch.feedSecondaryUrl = feedUrl;
    patch.feedSecondaryStoragePath = feedStoragePath;
  } else {
    patch.feedUrl = feedUrl;
    patch.feedStoragePath = feedStoragePath;
    if (posterUrl && posterStoragePath) {
      patch.posterUrl = posterUrl;
      patch.posterStoragePath = posterStoragePath;
    }
  }
  await ref.set(patch, { merge: true });
  logger.info('Patched doc with feed encode URL', { collection, docId, role, version: FEED_ENCODE_VERSION });
  return true;
}

async function uploadPosterFile(args: {
  bucket: ReturnType<ReturnType<typeof admin.storage>['bucket']>;
  localPath: string;
  posterObjectPath: string;
  sourceObjectPath: string;
  docId: string;
  kind: 'leap' | 'bestPart';
}): Promise<string> {
  const { bucket, localPath, posterObjectPath, sourceObjectPath, docId, kind } = args;
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination: posterObjectPath,
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=31536000',
      metadata: {
        feedEncodeVersion: FEED_ENCODE_VERSION,
        sourceObjectPath,
        videoDocId: docId,
        kind,
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  return firebaseDownloadUrl(bucket.name, posterObjectPath, token);
}

async function ensurePrimaryPoster(args: {
  bucket: ReturnType<ReturnType<typeof admin.storage>['bucket']>;
  sourceObjectPath: string;
  feedObjectPath: string;
  feedLocalPath?: string;
  docId: string;
  kind: 'leap' | 'bestPart';
  forceRebuild?: boolean;
}): Promise<{ posterUrl: string; posterStoragePath: string } | null> {
  const { bucket, sourceObjectPath, feedObjectPath, feedLocalPath, docId, kind, forceRebuild } = args;
  const posterObjectPath = posterObjectPathForFeed(feedObjectPath);
  const posterFile = bucket.file(posterObjectPath);

  if (!forceRebuild) {
    const [exists] = await posterFile.exists();
    if (exists) {
      const [meta] = await posterFile.getMetadata();
      const existingToken = meta.metadata?.firebaseStorageDownloadTokens;
      let token = typeof existingToken === 'string' && existingToken ? existingToken : '';
      if (!token) {
        token = randomUUID();
        await posterFile.setMetadata({
          metadata: {
            ...(meta.metadata ?? {}),
            firebaseStorageDownloadTokens: token,
          },
        });
      }
      return {
        posterUrl: firebaseDownloadUrl(bucket.name, posterObjectPath, token),
        posterStoragePath: posterObjectPath,
      };
    }
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leap-feed-poster-'));
  const posterPath = path.join(tmpRoot, 'poster.jpg');
  const inPath = path.join(tmpRoot, 'in.mp4');
  try {
    if (feedLocalPath && fs.existsSync(feedLocalPath)) {
      await runFfmpegPoster(feedLocalPath, posterPath);
    } else {
      const [feedExists] = await bucket.file(feedObjectPath).exists();
      await downloadToTemp(
        bucket,
        feedExists ? feedObjectPath : sourceObjectPath,
        inPath
      );
      await runFfmpegPoster(inPath, posterPath);
    }
    const st = fs.statSync(posterPath);
    if (st.size < 32) throw new Error('poster output too small');
    const posterUrl = await uploadPosterFile({
      bucket,
      localPath: posterPath,
      posterObjectPath,
      sourceObjectPath,
      docId,
      kind,
    });
    return { posterUrl, posterStoragePath: posterObjectPath };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function existingFeedUrlIfCurrent(
  feedFile: ReturnType<ReturnType<ReturnType<typeof admin.storage>['bucket']>['file']>
): Promise<string | null> {
  const [exists] = await feedFile.exists();
  if (!exists) return null;

  const [meta] = await feedFile.getMetadata();
  const version = meta.metadata?.feedEncodeVersion;
  if (version !== FEED_ENCODE_VERSION) {
    return null;
  }

  const existingToken = meta.metadata?.firebaseStorageDownloadTokens;
  let token = typeof existingToken === 'string' && existingToken ? existingToken : '';
  if (!token) {
    token = randomUUID();
    await feedFile.setMetadata({
      metadata: {
        ...(meta.metadata ?? {}),
        feedEncodeVersion: FEED_ENCODE_VERSION,
        faststart: 'true',
        firebaseStorageDownloadTokens: token,
      },
    });
  }
  return firebaseDownloadUrl(feedFile.bucket.name, feedFile.name, token);
}

/**
 * Encode a raw camera MP4 to a 720p feed derivative and attach URL fields on the doc.
 * Idempotent for the current FEED_ENCODE_VERSION; older remux-only `_feed` files are rebuilt.
 */
export async function ensureFeedClipEncode(args: {
  bucketName: string;
  sourceObjectPath: string;
  /** Re-encode even when a current-version feed object already exists. */
  forceRebuild?: boolean;
}): Promise<{ feedObjectPath: string; feedUrl: string } | null> {
  const parsed = parseFeedVideoPath(args.sourceObjectPath);
  if (!parsed) return null;

  const bucket = admin.storage().bucket(args.bucketName);
  const { feedObjectPath, docId, role, docCollection, kind } = parsed;
  const feedFile = bucket.file(feedObjectPath);

  let feedUrl: string | null = null;
  if (!args.forceRebuild) {
    feedUrl = await existingFeedUrlIfCurrent(feedFile);
  }

  let encodedLocalPath: string | undefined;
  let tmpRoot: string | undefined;
  if (!feedUrl) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leap-feed-encode-'));
    const inPath = path.join(tmpRoot, 'in.mp4');
    const outPath = path.join(tmpRoot, 'out.mp4');
    try {
      await downloadToTemp(bucket, args.sourceObjectPath, inPath);
      await runFfmpegFeedEncode(inPath, outPath);
      const outStat = fs.statSync(outPath);
      if (outStat.size < 64) {
        throw new Error('feed encode output too small');
      }
      feedUrl = await uploadFeedFile({
        bucket,
        localPath: outPath,
        feedObjectPath,
        sourceObjectPath: args.sourceObjectPath,
        docId,
        role,
        kind,
      });
      encodedLocalPath = outPath;
    } catch (e) {
      try {
        if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
      throw e;
    }
  }

  let posterUrl: string | undefined;
  let posterStoragePath: string | undefined;
  if (role === 'primary') {
    try {
      const poster = await ensurePrimaryPoster({
        bucket,
        sourceObjectPath: args.sourceObjectPath,
        feedObjectPath,
        feedLocalPath: encodedLocalPath,
        docId,
        kind,
        forceRebuild: args.forceRebuild,
      });
      if (poster) {
        posterUrl = poster.posterUrl;
        posterStoragePath = poster.posterStoragePath;
      }
    } catch (e) {
      logger.warn('feed poster failed (non-fatal)', { sourceObjectPath: args.sourceObjectPath, err: e });
    }
  }

  if (tmpRoot) {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }

  await patchDocFeedUrl({
    collection: docCollection,
    docId,
    role,
    feedUrl,
    feedStoragePath: feedObjectPath,
    posterUrl,
    posterStoragePath,
  });

  return { feedObjectPath, feedUrl };
}

/** @deprecated Prefer ensureFeedClipEncode — kept for existing imports/scripts. */
export async function ensureLeapClipFaststart(args: {
  bucketName: string;
  sourceObjectPath: string;
  forceRebuild?: boolean;
}): Promise<{ feedObjectPath: string; feedUrl: string } | null> {
  return ensureFeedClipEncode(args);
}
