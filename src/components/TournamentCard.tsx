import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Shield, Users } from 'lucide-react';
import type { Tournament } from '../types/esports';
import { BRAND_ASSETS, resolveBundledAssetUrl } from '../lib/seedData';
import { getAvailableSlots, isTournamentFull } from '../utils/tournamentRules';

interface TournamentCardProps {
  tournament: Tournament;
  isRegistered: boolean;
  onSelect: (tournament: Tournament) => void;
}

export function TournamentCard({ tournament, isRegistered, onSelect }: TournamentCardProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [tournament.bannerUrl]);

  const full = isTournamentFull(tournament);
  const available = getAvailableSlots(tournament);
  const fillPercent = Math.min(100, Math.round((tournament.filledSlots / tournament.maxSlots) * 100));

  const fallbackImg =
    tournament.category === 'Clash Squad'
      ? BRAND_ASSETS.clashSquadBanner
      : tournament.category === 'Lone Wolf'
        ? BRAND_ASSETS.loneWolfBanner
        : BRAND_ASSETS.battleRoyaleBanner;

  const statusLabel =
    tournament.status === 'live'
      ? 'Live Now'
      : tournament.status === 'completed'
        ? 'Completed'
        : tournament.status === 'cancelled'
          ? 'Cancelled'
          : full
            ? 'Slots Full'
            : 'Open Entry';

  return (
    <article className="group rounded-xl border border-white/10 bg-[#121216] overflow-hidden flex flex-col transition-colors hover:border-white/20">
      <div className="relative aspect-video bg-[#18181D] overflow-hidden">
        {!imgError ? (
          <img
            src={resolveBundledAssetUrl(tournament.bannerUrl, fallbackImg)}
            alt={`${tournament.title} arena banner`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#18181D] to-[#09090B]">
            <Shield className="w-10 h-10 text-[#E11D48]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121216] via-[#121216]/35 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs">
          <span
            className={`font-semibold inline-flex items-center gap-1 ${
              isRegistered
                ? 'text-emerald-400'
                : tournament.status === 'live'
                  ? 'text-[#F43F5E]'
                  : tournament.status === 'completed'
                    ? 'text-zinc-300'
                    : 'text-emerald-400'
            }`}
          >
            {isRegistered && <CheckCircle2 className="w-3.5 h-3.5" />}
            {isRegistered ? 'Joined' : statusLabel}
          </span>
          <span className="text-amber-300 font-semibold tabular-nums">
            FREE · +{tournament.coinReward.toLocaleString()} Coins
          </span>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          {/* Zero-pill clean unboxed metadata */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
            <span className="text-zinc-200 font-medium">{tournament.category}</span>
            <span aria-hidden="true">·</span>
            <span>{tournament.mode}</span>
            <span aria-hidden="true">·</span>
            <span>{tournament.mapName}</span>
          </div>

          <h3 className="font-display text-2xl font-bold text-white leading-tight line-clamp-2">
            {tournament.title}
          </h3>

          <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1 tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              {tournament.matchDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              {tournament.matchTime}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-zinc-400">
                <Users className="w-3.5 h-3.5" />
                {tournament.filledSlots}/{tournament.maxSlots} Registered
              </span>
              <span className="text-zinc-300 font-medium">
                {full ? 'Full' : `${available} slots left`}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all ${full ? 'bg-zinc-500' : 'bg-[#E11D48]'}`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelect(tournament)}
            className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-colors inline-flex items-center justify-center gap-1.5 ${
              isRegistered
                ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                : tournament.status === 'completed' || tournament.status === 'cancelled' || full
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10'
                  : 'bg-[#E11D48] hover:bg-[#F43F5E] text-white'
            }`}
          >
            {isRegistered && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {isRegistered
              ? 'Joined · View Room'
              : tournament.status === 'completed'
                ? 'View Results'
                : tournament.status === 'live'
                  ? 'View Live Match'
                  : full
                    ? 'Match Full · Details'
                    : 'Join Now'}
          </button>
        </div>
      </div>
    </article>
  );
}
