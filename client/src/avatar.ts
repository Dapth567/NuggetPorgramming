import { LIMITS } from "@chat/shared";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Crops a picture to a small square and returns it as a JPEG data URL, so a phone photo of
 * several megabytes becomes a few kilobytes before it goes over the socket.
 * Rejects when the file is too big, is not an image, or cannot be made small enough.
 */
export async function toAvatar(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too big");

  const bitmap = await createImageBitmap(file);
  const size = LIMITS.avatarSize;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  // JPEG has no transparency, so a transparent PNG would otherwise turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= LIMITS.avatarMaxLength) return url;
  }
  throw new Error("Image is too detailed");
}
