import { useState } from 'react';
import { Award, Bell, Home, Shield, Swords, Trophy, User } from 'lucide-react';
import { BRAND_ASSETS } from '../lib/seedData';
import type { UserProfile } from '../types/esports';

export type AppTab = 'home' | 'matches' | 'results' | 'leaderboard' | 'profile' | 'admin';

interface NavigationProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAuth: () => void;
  isSignedIn: boolean;
  isAdmin: boolean;
  profile: UserProfile | null;
}

export function TopNav({
  activeTab,
  onSelectTab,
  unreadCount,
  onOpenNotifications,
  onOpenAuth,
  isSignedIn,
  isAdmin,
  profile,
}: NavigationProps) {
  const [logoError, setLogoError] = useState(false);

  const navItems: { id: AppTab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'matches', label: 'Matches' },
    { id: 'results', label: 'Results' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'profile', label: 'Profile' },
    ...(isAdmin ? [{ id: 'admin' as AppTab, label: 'Admin' }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-white/10 bg-[#09090B]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-[#E11D48] rounded-md"
        >
          {!logoError && (
            <img
              src={BRAND_ASSETS.logo}
              alt="Spider Esports logo"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="w-8 h-8 rounded-lg object-cover border border-white/10"
            />
          )}
          <span className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            SPIDER ESPORTS
          </span>
        </button>

        {/* Zone 2: Clean Typography Navigation Links (Desktop) */}
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                  active ? 'text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-[1px] h-0.5 bg-[#E11D48]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action Zone */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label={`Notifications (${unreadCount} unread)`}
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#E11D48] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {!isSignedIn ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
            >
              Sign In
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className="hidden sm:flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-[#121216] hover:border-white/20 text-xs font-medium text-white whitespace-nowrap shrink-0 transition-colors"
            >
              <span>{profile?.username || 'Player'}</span>
              <span className="text-amber-400 font-semibold tabular-nums">
                {(profile?.coins ?? 0).toLocaleString()} Coins
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function BottomNav({
  activeTab,
  onSelectTab,
  isAdmin,
}: Pick<NavigationProps, 'activeTab' | 'onSelectTab' | 'isAdmin'>) {
  const tabs: { id: AppTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'matches', label: 'Matches', icon: Swords },
    { id: 'results', label: 'Results', icon: Award },
    { id: 'leaderboard', label: 'Ranks', icon: Trophy },
    { id: 'profile', label: 'Profile', icon: User },
    ...(isAdmin ? [{ id: 'admin' as AppTab, label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#09090B]/95 backdrop-blur-md border-t border-white/10"
    >
      <div
        className={`grid h-full max-w-lg mx-auto ${
          tabs.length === 6 ? 'grid-cols-6' : 'grid-cols-5'
        }`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-[#E11D48]' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
