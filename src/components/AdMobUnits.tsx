import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, X } from 'lucide-react';
import type { AdminSettings } from '../types/esports';
import {
  resolveEffectiveAdMobConfig,
  shouldDisplayBannerAtScreen,
  type AdBannerScreen,
} from '../utils/admobHelpers';
import {
  getAdMobIntegrationStatus,
  subscribeAdMobStatus,
  type AdMobIntegrationStatus,
} from '../lib/admobBridge';

interface BannerAdProps {
  settings: AdminSettings;
  screen?: AdBannerScreen;
  placementLabel?: string;
  consentAccepted?: boolean;
  onAcceptConsent?: () => void;
}

export function AdMobBannerSlot({
  settings,
  screen = 'home',
  placementLabel = 'Arena Sponsor',
  consentAccepted = true,
  onAcceptConsent,
}: BannerAdProps) {
  const [status, setStatus] = useState<AdMobIntegrationStatus>(() => getAdMobIntegrationStatus());

  useEffect(() => {
    return subscribeAdMobStatus(setStatus);
  }, []);

  const config = resolveEffectiveAdMobConfig(settings, {
    forceTestMode: Boolean(import.meta.env?.DEV),
  });
  const allowedByPlacement = shouldDisplayBannerAtScreen(settings, screen);

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (!allowedByPlacement || isOffline) {
    return null;
  }

  // Native Android (Capacitor): only reserve space when banner ad actually loaded or displayed
  if (status.isNativeAndroid) {
    const bannerVisible =
      status.android.bannerState === 'loaded' || status.android.bannerState === 'displayed';
    if (!bannerVisible) {
      return null;
    }
    return <div className="mt-6 h-16" aria-hidden="true" />;
  }

  // Web / PWA Browser Preview: render an honest development placeholder (no native SDK call, no fake impressions)
  return (
    <aside
      aria-label="AdMob Development Placeholder"
      data-testid="admob-web-placeholder"
      className="mt-8 rounded-xl border border-dashed border-white/15 bg-[#121216] p-4 space-y-2.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
              <Smartphone className="w-3.5 h-3.5" />
              Dev Placeholder
            </span>
            <span aria-hidden="true">·</span>
            <span>Google AdMob ({config.isTestMode ? 'Official Test IDs' : 'Production Config'})</span>
            <span aria-hidden="true">·</span>
            <span>{placementLabel}</span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-zinc-200">
            Web/PWA preview placeholder — live Google Mobile Ads SDK banners render inside the native Android APK build (zero fake impressions or clicks generated in browser).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!consentAccepted && onAcceptConsent && (
            <button
              type="button"
              onClick={onAcceptConsent}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#E11D48]" />
              Accept Ad Consent
            </button>
          )}
          <div className="text-right space-y-0.5">
            <div className="text-[11px] font-mono-tabular text-zinc-400">
              Unit: {config.bannerId}
            </div>
            <div className="text-[10px] font-mono-tabular text-zinc-500">
              App: {config.appId}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface InterstitialAdModalProps {
  open: boolean;
  settings: AdminSettings;
  onClose: () => void;
}

/**
 * Retained strictly as a safe no-op unless explicitly opened; Web/PWA never triggers fake interstitials.
 */
export function InterstitialAdModal({ open, settings, onClose }: InterstitialAdModalProps) {
  if (!open) return null;

  const config = resolveEffectiveAdMobConfig(settings, {
    forceTestMode: Boolean(import.meta.env?.DEV),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AdMob Development Notice"
    >
      <div className="w-full max-w-md rounded-2xl border border-dashed border-white/15 bg-[#121216] p-6 space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Web/PWA Dev Placeholder · {config.isTestMode ? 'TEST' : 'PRODUCTION'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notice"
            className="min-h-[40px] px-3 rounded-lg border border-white/10 text-zinc-200 hover:bg-white/5 flex items-center gap-1.5"
          >
            Close
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="rounded-xl bg-[#09090B] border border-white/5 p-6 text-center space-y-2">
          <p className="font-display text-xl font-bold text-white">
            Native Android Interstitial Slot
          </p>
          <p className="text-xs text-zinc-400">
            Interstitial ads load and render only inside the native Android APK using Google Mobile Ads SDK.
          </p>
          <p className="text-[11px] font-mono-tabular text-zinc-500 pt-1">{config.interstitialId}</p>
        </div>
      </div>
    </div>
  );
}

interface ConsentBarProps {
  visible: boolean;
  onAccept: () => void;
}

export function AdConsentBanner({ visible, onAccept }: ConsentBarProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-40 rounded-xl border border-white/15 bg-[#121216] p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white">Privacy &amp; AdMob Consent</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            SPIDER ESPORTS uses Google AdMob to keep all tournaments 100% free. Manage ad preferences anytime in your Profile.
          </p>
          <button
            type="button"
            onClick={onAccept}
            className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
          >
            Acknowledge &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
}
