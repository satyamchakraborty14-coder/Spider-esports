import type { WithdrawalRequest, WithdrawalStatus } from '../types/esports';

export type WithdrawalStatusBucket = 'pending' | 'processed' | 'rejected';
export type WithdrawalFilterStatus = 'all' | WithdrawalStatusBucket;

export interface WithdrawalSummary {
  totalCount: number;
  pendingCount: number;
  processedCount: number;
  rejectedCount: number;
  pendingCoins: number;
  pendingRupees: number;
  processedCoins: number;
  processedRupees: number;
  rejectedCoins: number;
}

export interface WithdrawalStatusMeta {
  bucket: WithdrawalStatusBucket;
  label: string;
  headline: string;
  description: string;
  badgeClass: string;
}

export function normalizeWithdrawalBucket(status: WithdrawalStatus): WithdrawalStatusBucket {
  if (status === 'approved') return 'processed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

export function getWithdrawalStatusMeta(
  wd: Pick<WithdrawalRequest, 'status' | 'coins' | 'rupees' | 'adminNote'>
): WithdrawalStatusMeta {
  const bucket = normalizeWithdrawalBucket(wd.status);
  if (bucket === 'processed') {
    return {
      bucket,
      label: 'Processed',
      headline: 'Processed & Paid',
      description: `Payout of ₹${wd.rupees} (${wd.coins.toLocaleString()} Spider Coins) has been processed by admin.`,
      badgeClass: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (bucket === 'rejected') {
    return {
      bucket,
      label: 'Rejected',
      headline: 'Rejected & Refunded',
      description: `Request declined — ${wd.coins.toLocaleString()} Spider Coins were refunded to your wallet.`,
      badgeClass: 'border-[#E11D48]/40 bg-[#E11D48]/15 text-[#FB7185]',
    };
  }
  return {
    bucket,
    label: 'Pending',
    headline: 'Pending Admin Review',
    description: 'Queued for admin payout verification. Coins remain reserved until processed.',
    badgeClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  };
}

export function summarizeWithdrawals(withdrawals: WithdrawalRequest[]): WithdrawalSummary {
  const summary: WithdrawalSummary = {
    totalCount: withdrawals.length,
    pendingCount: 0,
    processedCount: 0,
    rejectedCount: 0,
    pendingCoins: 0,
    pendingRupees: 0,
    processedCoins: 0,
    processedRupees: 0,
    rejectedCoins: 0,
  };

  for (const wd of withdrawals) {
    const bucket = normalizeWithdrawalBucket(wd.status);
    const coins = Number.isFinite(wd.coins) ? Math.max(0, wd.coins) : 0;
    const rupees = Number.isFinite(wd.rupees) ? Math.max(0, wd.rupees) : 0;

    if (bucket === 'pending') {
      summary.pendingCount += 1;
      summary.pendingCoins += coins;
      summary.pendingRupees = Math.round((summary.pendingRupees + rupees) * 100) / 100;
    } else if (bucket === 'processed') {
      summary.processedCount += 1;
      summary.processedCoins += coins;
      summary.processedRupees = Math.round((summary.processedRupees + rupees) * 100) / 100;
    } else {
      summary.rejectedCount += 1;
      summary.rejectedCoins += coins;
    }
  }

  return summary;
}

export function filterAndSortWithdrawals(
  withdrawals: WithdrawalRequest[],
  filter: WithdrawalFilterStatus
): WithdrawalRequest[] {
  const filtered =
    filter === 'all'
      ? [...withdrawals]
      : withdrawals.filter((wd) => normalizeWithdrawalBucket(wd.status) === filter);

  return filtered.sort((a, b) => {
    const aCreated = Date.parse(a.createdAt) || 0;
    const bCreated = Date.parse(b.createdAt) || 0;
    if (bCreated !== aCreated) return bCreated - aCreated;
    const aUpdated = Date.parse(a.updatedAt) || 0;
    const bUpdated = Date.parse(b.updatedAt) || 0;
    return bUpdated - aUpdated;
  });
}

export function formatWithdrawalTimestamp(iso: string): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return new Date(parsed).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
