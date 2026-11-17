export const MAX_TOURNAMENT_BANNER_LENGTH = 200_000;
export const TARGET_COMPRESSED_DATA_URL_LENGTH = 160_000;
export const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_IMAGE_INPUT_ACCEPT = 'image/png,image/jpeg,image/webp';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CompressedBannerResult {
  dataUrl: string;
  width: number;
  height: number;
  approxKb: number;
}

export function validateUploadImageFile(file: {
  type?: string;
  size?: number;
  name?: string;
}): string | null {
  const mime = (file.type || '').toLowerCase().trim();
  const isAllowedMime = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  if (!isAllowedMime) {
    return 'Please upload a PNG, JPG, or WEBP image file.';
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return 'Selected image file appears empty.';
  }
  if (file.size > MAX_RAW_IMAGE_BYTES) {
    return 'Image file must be 15 MB or smaller before compression.';
  }
  return null;
}

export function fitImageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = 800,
  maxHeight = 450
): ImageDimensions {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function isValidImageDataUrl(value: string): boolean {
  if (!value.startsWith('data:image/')) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function estimateDataUrlSizeKb(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  const bytes = Math.floor((base64Len * 3) / 4);
  return Math.max(1, Math.round(bytes / 1024));
}

async function decodeImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      cleanup: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to read image file.'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export async function compressImageFileToDataUrl(
  file: File
): Promise<CompressedBannerResult> {
  const validationError = validateUploadImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const decoded = await decodeImageSource(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas unavailable for image compression.');
    }

    const sizeSteps: [number, number][] = [
      [800, 450],
      [640, 360],
      [480, 270],
    ];
    const qualitySteps = [0.84, 0.74, 0.62, 0.5];

    for (const [maxW, maxH] of sizeSteps) {
      const fitted = fitImageDimensions(decoded.width, decoded.height, maxW, maxH);
      canvas.width = fitted.width;
      canvas.height = fitted.height;
      ctx.fillStyle = '#09090B';
      ctx.fillRect(0, 0, fitted.width, fitted.height);
      decoded.draw(ctx, fitted.width, fitted.height);

      for (const quality of qualitySteps) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= TARGET_COMPRESSED_DATA_URL_LENGTH) {
          return {
            dataUrl,
            width: fitted.width,
            height: fitted.height,
            approxKb: estimateDataUrlSizeKb(dataUrl),
          };
        }
      }
    }

    throw new Error('Image is still too large after compression. Try a smaller photo.');
  } finally {
    decoded.cleanup();
  }
}
