// Client-side image optimization for member photos.
// Square center-crops + downscales to 400×400 and re-encodes as WebP (~0.8
// quality), producing ~20-40KB files. Keeps uploads tiny for mobile-first
// users on 3G/4G. Runs entirely in the browser before upload.

const TARGET = 400;
const QUALITY = 0.8;

export async function optimizeImage(file: File | Blob): Promise<Blob> {
  const bitmap = await loadBitmap(file);

  // Center-crop to a square ("cover"): take the largest centered square.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = TARGET;
  canvas.height = TARGET;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET, TARGET);

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY),
  );
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  // Prefer createImageBitmap (faster, off-main-thread decode) where available.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> fallback (e.g. some Safari/HEIC cases)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
