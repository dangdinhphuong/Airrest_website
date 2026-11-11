import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { AppError } from './errors';

// Cloudflare R2 qua API S3. Trình duyệt tải thẳng lên R2 bằng URL ký sẵn, file không đi qua API.
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 300;
export const MEDIA_FOLDERS = ['hotels', 'rooms'] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

let client: { s3: S3Client; bucket: string } | undefined;
function r2() {
  if (client) return client;
  const { R2_ACCOUNT_ID: acc, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = env;
  if (!acc || !key || !secret || !bucket) throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Chưa cấu hình lưu trữ media (R2_*)');
  client = { bucket, s3: new S3Client({ region: 'auto', endpoint: `https://${acc}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } }) };
  return client;
}

// Khóa object do server đặt (không dùng tên file của client): chống ghi đè và ký tự lạ.
export const newMediaKey = (folder: MediaFolder, type: ImageType): string => `${folder}/${new Date().getUTCFullYear()}/${randomUUID()}.${IMAGE_TYPES[type]}`;

/**
 * URL PUT có chữ ký, hết hạn sau 5 phút, buộc đúng Content-Type đã khai báo.
 * shortcut: kích thước chỉ kiểm theo số client khai (R2 không ép trong URL ký này); chặn thật bằng lifecycle/quota của bucket khi cần.
 */
export async function presignImageUpload(folder: MediaFolder, type: ImageType) {
  const { s3, bucket } = r2();
  const key = newMediaKey(folder, type);
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type }), { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { key, uploadUrl, method: 'PUT' as const, headers: { 'Content-Type': type }, expiresIn: UPLOAD_URL_TTL_SECONDS, publicUrl: publicUrl(key) };
}

// Bucket công khai: ghép với R2_PUBLIC_BASE_URL. Bucket riêng tư: không có URL này, dùng presignDownload.
export const publicUrl = (key: string): string | undefined => (env.R2_PUBLIC_BASE_URL ? `${env.R2_PUBLIC_BASE_URL}/${key}` : undefined);

export async function presignDownload(key: string, expiresIn = 600): Promise<string> {
  const { s3, bucket } = r2();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

export async function deleteMedia(key: string): Promise<void> {
  const { s3, bucket } = r2();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Dùng cho script kiểm tra kết nối: ghi một object nhỏ, đọc lại, xóa.
export async function roundTripCheck(): Promise<{ bucket: string; ok: boolean }> {
  const { s3, bucket } = r2();
  const key = `healthcheck/${randomUUID()}.txt`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }));
  const got = await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body?.transformToString();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { bucket, ok: got === 'ok' };
}
