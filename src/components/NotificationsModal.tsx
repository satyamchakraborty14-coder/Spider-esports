import { Bell, Check, X } from 'lucide-react';
import type { NotificationItem } from '../types/esports';
import { markNotificationRead } from '../lib/firestoreService';

interface NotificationsModalProps {
  open: boolean;
  notifications: NotificationItem[];
  isSignedIn: boolean;
  onClose: () => void;
}

export function NotificationsModal({
  open,
  notifications,
  isSignedIn,
  onClose,
}: NotificationsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-label="Tournament Notifications"
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#121216] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-2xl font-extrabold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#E11D48]" />
            Notifications
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isSignedIn ? (
          <p className="text-xs text-zinc-400 py-4">
            Sign in to receive personal registration confirmations, room credential alerts, and match reminders.
          </p>
        ) : notifications.length === 0 ? (
          <p className="text-xs text-zinc-400 py-6 text-center">
            You are all caught up. Tournament alerts and room notifications will appear here.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {notifications.map((n) => (
              <div key={n.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="capitalize text-[#F43F5E] font-medium">{n.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className={`text-sm font-semibold ${n.read ? 'text-zinc-300' : 'text-white'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{n.body}</p>
                </div>
                {!n.read && n.userId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    aria-label={`Mark ${n.title} as read`}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:text-white shrink-0"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
