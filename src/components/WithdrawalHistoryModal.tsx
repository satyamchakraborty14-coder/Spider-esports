import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  IndianRupee,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import type { WithdrawalRequest } from '../types/esports';
import { calculateRupeesFromCoins, formatRupees } from '../utils/coinSystem';
import {
  filterAndSortWithdrawals,
  formatWithdrawalTimestamp,
  getWithdrawalStatusMeta,
  summarizeWithdrawals,
  type WithdrawalFilterStatus,
} from '../utils/withdrawalHistory';

interface WithdrawalHistoryModalProps {
  open: boolean;
  withdrawals: WithdrawalRequest[];
  availableCoins: number;
  initialFilter?: WithdrawalFilterStatus;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export function WithdrawalHistoryModal({
  open,
  withdrawals,
  availableCoins,
  initialFilter = 'all',
  onClose,
  onToast,
}: WithdrawalHistoryModalProps) {
  const [statusFilter, setStatusFilter] = useState<WithdrawalFilterStatus>(initialFilter);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatusFilter(initialFilter);
    }
  }, [open, initialFilter]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const summary = summarizeWithdrawals(withdrawals);
  const visibleWithdrawals = filterAndSortWithdrawals(withdrawals, statusFilter);

  const filterTabs: { id: WithdrawalFilterStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: summary.totalCount },
    { id: 'pending', label: 'Pending', count: summary.pendingCount },
    { id: 'processed', label: 'Processed', count: summary.processedCount },
    { id: 'rejected', label: 'Rejected', count: summary.rejectedCount },
  ];

  const handleCopyId = (id: string) => {
    void navigator.clipboard?.writeText(id).then(() => {
      setCopiedId(id);
      onToast?.(`Copied request ID ${id}`);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdrawal-history-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#121216] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/10 shrink-0">
          <div className="space-y-1">
            <h2
              id="withdrawal-history-modal-title"
              className="font-display text-2xl font-extrabold text-white flex items-center gap-2"
            >
              <Wallet className="w-5 h-5 text-amber-400" />
              Withdrawal History
            </h2>
            <p className="text-xs text-zinc-400">
              Detailed status of your Spider Coin redemption requests (1,000 Coins = ₹10).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block text-right rounded-lg border border-white/10 bg-[#09090B] px-3 py-1.5 tabular-nums">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Wallet Balance</p>
              <p className="text-xs font-bold text-amber-400">
                {availableCoins.toLocaleString()} Coins ({formatRupees(calculateRupeesFromCoins(availableCoins))})
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close withdrawal history"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Strip & Filters */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 space-y-4 bg-[#09090B]/50 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
            <div className="rounded-xl border border-white/10 bg-[#09090B] p-3">
              <p className="text-[11px] text-zinc-400">Total Requests</p>
              <p className="text-lg font-bold text-white mt-0.5">{summary.totalCount}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3">
              <p className="text-[11px] text-amber-300/90">Pending</p>
              <p className="text-lg font-bold text-amber-300 mt-0.5">{summary.pendingCount}</p>
              <p className="text-[11px] text-zinc-400">{formatRupees(summary.pendingRupees)} queued</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3">
              <p className="text-[11px] text-emerald-300/90">Processed</p>
              <p className="text-lg font-bold text-emerald-300 mt-0.5">{summary.processedCount}</p>
              <p className="text-[11px] text-zinc-400">{formatRupees(summary.processedRupees)} paid</p>
            </div>
            <div className="rounded-xl border border-[#E11D48]/25 bg-[#E11D48]/10 p-3">
              <p className="text-[11px] text-[#FB7185]">Rejected</p>
              <p className="text-lg font-bold text-[#FB7185] mt-0.5">{summary.rejectedCount}</p>
              <p className="text-[11px] text-zinc-400">
                {summary.rejectedCoins.toLocaleString()} refunded
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Filter withdrawal requests by status"
            className="flex flex-wrap items-center gap-2"
          >
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                    active
                      ? 'bg-[#E11D48] text-white'
                      : 'border border-white/10 bg-[#09090B] text-zinc-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable History List */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
          {withdrawals.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#09090B] p-8 text-center space-y-2">
              <Wallet className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-white">No withdrawal requests yet</p>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Earn at least 1,000 Spider Coins (₹10) from free Fire tournaments, then submit a UPI or Bank payout request from your Profile wallet.
              </p>
            </div>
          ) : visibleWithdrawals.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#09090B] p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-white">
                No {statusFilter} redemption requests
              </p>
              <p className="text-xs text-zinc-400">
                Switch back to view all {summary.totalCount} coin redemption requests.
              </p>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="min-h-[38px] px-4 py-1.5 rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white"
              >
                Show All Requests
              </button>
            </div>
          ) : (
            visibleWithdrawals.map((wd) => {
              const meta = getWithdrawalStatusMeta(wd);
              const StatusIcon =
                meta.bucket === 'processed'
                  ? CheckCircle2
                  : meta.bucket === 'rejected'
                    ? XCircle
                    : Clock;
              return (
                <article
                  key={wd.id}
                  className="rounded-xl border border-white/10 bg-[#09090B] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5 tabular-nums">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white inline-flex items-center gap-0.5">
                          <IndianRupee className="w-4 h-4 text-emerald-400" />
                          {formatRupees(wd.rupees).replace('₹', '')}
                        </span>
                        <span className="text-xs font-mono-tabular text-amber-400 font-semibold">
                          {wd.coins.toLocaleString()} Spider Coins
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {wd.method === 'upi' ? 'UPI Payout' : 'Bank Transfer'} ·{' '}
                        <span className="text-zinc-200 font-medium break-all">{wd.destination}</span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold shrink-0 ${meta.badgeClass}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {meta.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-lg border border-white/5 bg-[#121216] p-3 text-xs">
                    <div>
                      <p className="text-[11px] text-zinc-500">Submitted</p>
                      <p className="text-zinc-200 font-mono-tabular mt-0.5">
                        {formatWithdrawalTimestamp(wd.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">
                        {meta.bucket === 'pending' ? 'Last Activity' : 'Reviewed / Updated'}
                      </p>
                      <p className="text-zinc-200 font-mono-tabular mt-0.5">
                        {formatWithdrawalTimestamp(wd.updatedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">Request ID</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-zinc-300 font-mono-tabular truncate">{wd.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(wd.id)}
                          aria-label={`Copy request ID ${wd.id}`}
                          className="p-1 rounded border border-white/10 text-zinc-400 hover:text-white shrink-0"
                        >
                          {copiedId === wd.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#121216] px-3 py-2.5 text-xs space-y-1">
                    <p className="font-semibold text-white">{meta.headline}</p>
                    <p className="text-zinc-400 leading-relaxed">{meta.description}</p>
                    {wd.adminNote && (
                      <p className="text-zinc-200 pt-1 border-t border-white/5">
                        <span className="text-zinc-400">Admin Note:</span> {wd.adminNote}
                      </p>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 sm:px-6 py-3.5 border-t border-white/10 bg-[#09090B]/60 shrink-0">
          <p className="text-[11px] text-zinc-400">
            Rejected withdrawals automatically return Spider Coins to your wallet balance.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-xs font-semibold text-white shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
