import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateDataUrlSizeKb,
  fitImageDimensions,
  isValidImageDataUrl,
  MAX_RAW_IMAGE_BYTES,
  validateUploadImageFile,
} from './imageUpload';

test('validateUploadImageFile accepts PNG, JPG, WEBP and rejects unsupported or oversized files', () => {
  assert.equal(validateUploadImageFile({ type: 'image/png', size: 1024 }), null);
  assert.equal(validateUploadImageFile({ type: 'image/jpeg', size: 500_000 }), null);
  assert.equal(validateUploadImageFile({ type: 'image/webp', size: 250_000 }), null);

  assert.ok(validateUploadImageFile({ type: 'image/svg+xml', size: 1024 }) !== null);
  assert.ok(validateUploadImageFile({ type: 'application/pdf', size: 1024 }) !== null);
  assert.ok(validateUploadImageFile({ type: 'image/png', size: 0 }) !== null);
  assert.ok(
    validateUploadImageFile({ type: 'image/jpeg', size: MAX_RAW_IMAGE_BYTES + 1 }) !== null
  );
});

test('fitImageDimensions preserves aspect ratio and avoids upscaling smaller images', () => {
  assert.deepEqual(fitImageDimensions(1920, 1080, 800, 450), { width: 800, height: 450 });
  assert.deepEqual(fitImageDimensions(1000, 1000, 800, 450), { width: 450, height: 450 });
  assert.deepEqual(fitImageDimensions(400, 225, 800, 450), { width: 400, height: 225 });
});

test('isValidImageDataUrl accepts safe base64 image types and rejects html/script URIs', () => {
  assert.equal(isValidImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isValidImageDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isValidImageDataUrl('data:image/webp;base64,UklGRh4='), true);
  assert.equal(isValidImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isValidImageDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isValidImageDataUrl('javascript:alert(1)'), false);
});

test('estimateDataUrlSizeKb returns reasonable KB estimate', () => {
  const payload = 'A'.repeat(4096);
  const kb = estimateDataUrlSizeKb(`data:image/jpeg;base64,${payload}`);
  assert.equal(kb, 3);
});
