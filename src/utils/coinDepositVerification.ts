import { isValidImageDataUrl, MAX_TOURNAMENT_BANNER_LENGTH } from './imageUpload';

export const MIN_ADD_COIN_RUPEES = 10;
export const MAX_ADD_COIN_RUPEES = 10_000;
export const ADD_COIN_PRESETS = [50, 100, 250, 500, 1000] as const;

const SEQUENTIAL_ASC = '01234567890123456789';
const SEQUENTIAL_DESC = '98765432109876543210';

export function normalizeUtrInput(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

export function validateDepositAmount(rawAmount: number):
  | { valid: true; rupees: number; coins: number }
  | { valid: false; error: string } {
  if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount)) {
    return {
      valid: false,
      error: 'Enter a whole rupee amount (1 Rupee = 1 Spider Coin).',
    };
  }
  if (rawAmount < MIN_ADD_COIN_RUPEES) {
    return {
      valid: false,
      error: `Minimum Add Coin amount is ₹${MIN_ADD_COIN_RUPEES} (${MIN_ADD_COIN_RUPEES} Coins).`,
    };
  }
  if (rawAmount > MAX_ADD_COIN_RUPEES) {
    return {
      valid: false,
      error: `Maximum single Add Coin deposit is ₹${MAX_ADD_COIN_RUPEES.toLocaleString()} (${MAX_ADD_COIN_RUPEES.toLocaleString()} Coins).`,
    };
  }
  return {
    valid: true,
    rupees: rawAmount,
    coins: rawAmount,
  };
}

export function validateUtrNumber(rawUtr: string):
  | { valid: true; utr: string }
  | { valid: false; error: string } {
  const utr = normalizeUtrInput(rawUtr);
  if (!/^[0-9]{12}$/.test(utr)) {
    return {
      valid: false,
      error: 'Enter the exact 12-digit UPI UTR / Reference Number from your payment app.',
    };
  }
  // Reject trivial repeating digits (e.g., 000000000000, 111111111111)
  if (/^(\d)\1{11}$/.test(utr)) {
    return {
      valid: false,
      error: 'Invalid UTR number: repeating digits cannot be a valid UPI transaction reference.',
    };
  }
  // Reject trivial 12-digit sequential numbers (e.g., 123456789012, 987654321098)
  if (SEQUENTIAL_ASC.includes(utr) || SEQUENTIAL_DESC.includes(utr)) {
    return {
      valid: false,
      error: 'Invalid UTR number: sequential test digits are not accepted.',
    };
  }
  // Require at least 3 distinct digits for real NPCI RRN/UTR entropy
  if (new Set(utr.split('')).size < 3) {
    return {
      valid: false,
      error: 'UTR reference looks invalid. Please copy the exact 12-digit UTR from your UPI receipt.',
    };
  }
  return { valid: true, utr };
}

export function validateOptionalPayerUpi(rawUpi?: string):
  | { valid: true; payerUpi?: string }
  | { valid: false; error: string } {
  const trimmed = (rawUpi || '').trim();
  if (!trimmed) return { valid: true };
  if (!/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Payer UPI ID format looks invalid (e.g. yourname@okaxis), or leave it blank.',
    };
  }
  return { valid: true, payerUpi: trimmed };
}

export function verifyCoinDepositSubmission(params: {
  amountRupees: number;
  utr: string;
  payerUpi?: string;
  screenshotUrl?: string;
  hasPaymentQrConfigured: boolean;
}):
  | {
      valid: true;
      rupees: number;
      coins: number;
      utr: string;
      payerUpi?: string;
      screenshotUrl?: string;
      verificationNote: string;
    }
  | { valid: false; error: string } {
  if (!params.hasPaymentQrConfigured) {
    return {
      valid: false,
      error: 'Payment QR is not configured by the administrator yet. Please check back shortly.',
    };
  }

  const amountCheck = validateDepositAmount(params.amountRupees);
  if (!amountCheck.valid) return amountCheck;

  const utrCheck = validateUtrNumber(params.utr);
  if (!utrCheck.valid) return utrCheck;

  const upiCheck = validateOptionalPayerUpi(params.payerUpi);
  if (!upiCheck.valid) return upiCheck;

  let cleanScreenshot: string | undefined;
  if (params.screenshotUrl && params.screenshotUrl.trim().length > 0) {
    const trimmedShot = params.screenshotUrl.trim();
    if (!isValidImageDataUrl(trimmedShot) || trimmedShot.length > MAX_TOURNAMENT_BANNER_LENGTH) {
      return {
        valid: false,
        error: 'Payment screenshot must be a valid compressed PNG/JPG/WEBP image.',
      };
    }
    cleanScreenshot = trimmedShot;
  }

  return {
    valid: true,
    rupees: amountCheck.rupees,
    coins: amountCheck.coins,
    utr: utrCheck.utr,
    ...(upiCheck.payerUpi ? { payerUpi: upiCheck.payerUpi } : {}),
    ...(cleanScreenshot ? { screenshotUrl: cleanScreenshot } : {}),
    verificationNote: `Auto-verified 12-digit UTR ${utrCheck.utr} · ₹${amountCheck.rupees} = +${amountCheck.coins} Spider Coins`,
  };
}
