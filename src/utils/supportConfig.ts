import type { AdminSettings } from '../types/esports';

export const TELEGRAM_SUPPORT_MAX_URL_LENGTH = 160;
export const TELEGRAM_SUPPORT_MAX_LABEL_LENGTH = 80;

export type TelegramValidationResult =
  | { valid: true; url: string; displayHandle: string }
  | { valid: false; error: string };

/**
 * Normalizes and strictly validates an admin-entered Telegram support handle or link.
 * Accepts:
 * - empty string (disconnects Telegram support)
 * - "@username" or "username" (5-32 chars, letters/digits/underscores)
 * - "t.me/username", "https://t.me/username", "https://t.me/+invite", "https://telegram.me/..."
 * Rejects any non-Telegram domain or unsafe protocol (e.g. javascript:, data:, external sites).
 */
export function normalizeAndValidateTelegramSupport(rawInput: string): TelegramValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: true, url: '', displayHandle: '' };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      error: 'Telegram username or link cannot contain spaces.',
    };
  }

  let candidate = trimmed;
  if (candidate.startsWith('@')) {
    const handle = candidate.slice(1);
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(handle)) {
      return {
        valid: false,
        error: 'Telegram @username must be 5–32 letters, numbers, or underscores.',
      };
    }
    candidate = `https://t.me/${handle}`;
  } else if (/^[a-zA-Z0-9_]{5,32}$/.test(candidate)) {
    candidate = `https://t.me/${candidate}`;
  } else if (/^(t|telegram)\.me\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  } else if (/^http:\/\/(t|telegram)\.me\//i.test(candidate)) {
    candidate = `https://${candidate.slice('http://'.length)}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      error: 'Enter a valid Telegram @username or t.me link (e.g. @spider_support or https://t.me/spider_support).',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only secure https:// Telegram links are allowed.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 't.me' && hostname !== 'telegram.me') {
    return {
      valid: false,
      error: 'Link must point to Telegram (t.me or telegram.me) or be a Telegram @username.',
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (!cleanPath || cleanPath === '/' || !/^\/[a-zA-Z0-9_+\-/]{2,120}$/.test(cleanPath)) {
    return {
      valid: false,
      error: 'Enter your Telegram username or group invite path after t.me/ (e.g. https://t.me/your_support).',
    };
  }

  const normalizedUrl = `https://${hostname}${cleanPath}`;
  if (normalizedUrl.length > TELEGRAM_SUPPORT_MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `Telegram link must be ${TELEGRAM_SUPPORT_MAX_URL_LENGTH} characters or less.`,
    };
  }

  const segment = cleanPath.slice(1);
  const displayHandle =
    segment.startsWith('+') || segment.startsWith('joinchat/')
      ? 'Telegram Support Group'
      : `@${segment.split('/')[0]}`;

  return {
    valid: true,
    url: normalizedUrl,
    displayHandle,
  };
}

export function validateTelegramSupportLabel(
  rawLabel: string
): { valid: true; label: string } | { valid: false; error: string } {
  const trimmed = rawLabel.trim();
  if (trimmed.length > TELEGRAM_SUPPORT_MAX_LABEL_LENGTH) {
    return {
      valid: false,
      error: `Support label must be ${TELEGRAM_SUPPORT_MAX_LABEL_LENGTH} characters or less.`,
    };
  }
  return { valid: true, label: trimmed };
}

export interface TelegramSupportInfo {
  configured: boolean;
  url: string;
  displayHandle: string;
  label: string;
}

export function getTelegramSupportInfo(
  adminSettings?: Pick<AdminSettings, 'telegramSupportUrl' | 'telegramSupportLabel'> | null
): TelegramSupportInfo {
  const rawUrl = adminSettings?.telegramSupportUrl?.trim() || '';
  const validated = normalizeAndValidateTelegramSupport(rawUrl);
  const customLabel = adminSettings?.telegramSupportLabel?.trim() || '';

  if (!validated.valid || !validated.url) {
    return {
      configured: false,
      url: '',
      displayHandle: '',
      label: customLabel || 'Customer Support 24/7',
    };
  }

  return {
    configured: true,
    url: validated.url,
    displayHandle: validated.displayHandle,
    label: customLabel || '24/7 Telegram Support',
  };
}
