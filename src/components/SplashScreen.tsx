import { useEffect, useState } from 'react';
import { BRAND_ASSETS } from '../lib/seedData';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onComplete();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#09090B] px-6 text-center"
      role="dialog"
      aria-label="Spider Esports Launch Screen"
    >
      <div className="flex flex-col items-center max-w-sm">
        <div className="w-28 h-28 rounded-2xl overflow-hidden border border-white/10 bg-[#121216] flex items-center justify-center mb-6 shadow-2xl shadow-[#E11D48]/10">
          {!logoError ? (
            <img
              src={BRAND_ASSETS.logo}
              alt="SPIDER ESPORTS emblem"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-display text-3xl font-extrabold text-[#E11D48]">SE</span>
          )}
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          SPIDER ESPORTS
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Free Fire Community Tournaments
        </p>

        <div className="mt-8 w-44 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-[#E11D48] w-full origin-left animate-[pulse_1.1s_ease-in-out_infinite]" />
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="mt-8 min-h-[44px] px-5 py-2 text-xs font-semibold text-zinc-300 hover:text-white border border-white/10 rounded-lg transition-colors"
        >
          Enter Arena
        </button>
      </div>
    </div>
  );
}
