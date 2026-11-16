import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Info, Lock, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { openAdPrivacyOptions } from '../lib/admobBridge';
import { getAdConsentSummary, SPIDER_AD_CONSENT_STORAGE_KEY } from '../utils/adConsent';

interface ConsentManagementModalProps {
  open: boolean;
  consentAccepted: boolean;
  onUpdateConsent: (personalizedAdsEnabled: boolean) => void;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export function ConsentManagementModal({
  open,
  consentAccepted,
  onUpdateConsent,
  onClose,
  onToast,
}: ConsentManagementModalProps) {
  const [openingUmp, setOpeningUmp] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStatusNotice(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isNative = Capacitor.isNativePlatform();
  const optedOut = !consentAccepted;
  const summary = getAdConsentSummary(consentAccepted);

  const handleToggleOptOut = () => {
    const nextOptedOut = !optedOut;
    const nextPersonalized = !nextOptedOut;
    onUpdateConsent(nextPersonalized);
    const msg = nextOptedOut
      ? 'Opted out globally — only non-personalized ads will be requested.'
      : 'Personalized ad consent saved globally.';
    setStatusNotice(msg);
    onToast?.(msg);
  };

  const handleOpenNativeUmp = async () => {
    setOpeningUmp(true);
    try {
      const outcome = await openAdPrivacyOptions();
      if (outcome === 'native_opened') {
        const msg = 'Google UMP privacy options updated.';
        setStatusNotice(msg);
        onToast?.(msg);
      }
    } finally {
      setOpeningUmp(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdpr-consent-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#121216] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/10 shrink-0">
          <div className="space-y-1">
            <h2
              id="gdpr-consent-modal-title"
              className="font-display text-2xl font-extrabold text-white flex items-center gap-2"
            >
              <ShieldCheck className="w-5 h-5 text-[#E11D48]" />
              GDPR Consent &amp; Ad Privacy
            </h2>
            <p className="text-xs text-zinc-400">
              Control ad personalization across SPIDER ESPORTS. Your choice applies globally.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ad privacy consent modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          {/* Active Mode Summary */}
          <div
            data-testid="consent-status-banner"
            className={`rounded-xl border p-4 space-y-1.5 ${
              optedOut
                ? 'border-emerald-500/35 bg-emerald-950/15'
                : 'border-amber-500/30 bg-amber-950/15'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">{summary.modeHeadline}</span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  optedOut
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/35 bg-amber-500/15 text-amber-300'
                }`}
              >
                {summary.shortLabel}
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{summary.modeDescription}</p>
          </div>

          {/* Clear Opt-Out Toggle */}
          <div className="rounded-xl border border-white/15 bg-[#09090B] p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <label
                htmlFor="gdpr-opt-out-switch"
                className="text-sm font-semibold text-white block cursor-pointer"
              >
                Opt out of personalized ads
              </label>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Turn ON to opt out of behavioral ad targeting and restrict Google AdMob requests to non-personalized contextual ads (<span className="font-mono-tabular text-zinc-300">npa=1</span>).
              </p>
            </div>
            <button
              id="gdpr-opt-out-switch"
              type="button"
              role="switch"
              aria-checked={optedOut}
              aria-label="Opt out of personalized ads"
              data-testid="gdpr-opt-out-toggle"
              onClick={handleToggleOptOut}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] ${
                optedOut
                  ? 'border-emerald-400/50 bg-emerald-500'
                  : 'border-white/20 bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  optedOut ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {statusNotice && (
            <div
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* Explicit Ad Personalization Explanation (GDPR) */}
          <div className="rounded-xl border border-white/10 bg-[#09090B] p-4 space-y-3 text-xs text-zinc-300 leading-relaxed">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-[#E11D48] shrink-0" />
              How Ad Personalization &amp; GDPR Consent Work
            </h3>
            <div className="space-y-2.5">
              <div>
                <p className="font-semibold text-zinc-100">1. Personalized Ads (When Opt-Out is OFF)</p>
                <p className="text-zinc-400 mt-0.5">
                  With your consent, Google AdMob and its mediation partners may access your device Advertising ID, approximate region, and in-app interaction signals to tailor ads to your interests.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-100">2. Non-Personalized Ads (When Opt-Out is ON)</p>
                <p className="text-zinc-400 mt-0.5">
                  When you opt out, SPIDER ESPORTS sends the non-personalized flag (<span className="font-mono-tabular text-zinc-300">npa=1</span>) on every Android AdMob request and pauses personalized cookies/profiling signals. Ads rely strictly on coarse contextual information (such as app category and current screen).
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-100">3. Your GDPR &amp; Privacy Rights</p>
                <p className="text-zinc-400 mt-0.5">
                  Under GDPR (EEA/UK) and applicable data protection laws, consent is optional and may be withdrawn at any time from your Profile. Opting out never blocks free tournament entry, match slots, or Spider Coin withdrawals. Preference is saved globally under <span className="font-mono-tabular text-zinc-300">{SPIDER_AD_CONSENT_STORAGE_KEY}</span>.
                </p>
              </div>
            </div>
          </div>

          {isNative && (
            <div className="rounded-xl border border-white/10 bg-[#09090B] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#E11D48]" />
                  Google UMP Regional Consent Form
                </p>
                <p className="text-[11px] text-zinc-400">
                  Manage vendor-level EEA/UK IAB TCF choices directly inside Google UMP.
                </p>
              </div>
              <button
                type="button"
                disabled={openingUmp}
                onClick={() => void handleOpenNativeUmp()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white shrink-0"
              >
                {openingUmp ? 'Opening UMP...' : 'Manage UMP Vendors'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-white/10 bg-[#09090B]/60 shrink-0">
          <p className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            Saved globally as <span className="font-mono-tabular text-zinc-300">{consentAccepted ? '1 (Personalized)' : '0 (Opted Out)'}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleOptOut}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-white/15 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-200"
            >
              {optedOut ? 'Switch to Personalized' : 'Opt Out Now'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
