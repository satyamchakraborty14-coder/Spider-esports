import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortWithdrawals,
  formatWithdrawalTimestamp,
  getWithdrawalStatusMeta,
  normalizeWithdrawalBucket,
  summarizeWithdrawals,
} from './withdrawalHistory';
import type { WithdrawalRequest } from '../types/esports';

const SAMPLE_WITHDRAWALS: WithdrawalRequest[] = [
  {
    id: 'wd_pending_1',
    userId: 'u1',
    username: 'KuroSpider',
    freeFireUid: '1234567890',
    coins: 1500,
    rupees: 15,
    method: 'upi',
    destination: 'kuro@okaxis',
    status: 'pending',
    createdAt: '2026-11-15T04:00:00.000Z',
    updatedAt: '2026-11-15T04:00:00.000Z',
  },
  {
    id: 'wd_approved_1',
    userId: 'u1',
    username: 'KuroSpider',
    freeFireUid: '1234567890',
    coins: 2000,
    rupees: 20,
    method: 'bank',
    destination: '123456789012 · SBIN0001234',
    status: 'approved',
    adminNote: 'UTR 63194820119',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T12:30:00.000Z',
  },
  {
    id: 'wd_rejected_1',
    userId: 'u1',
    username: 'KuroSpider',
    freeFireUid: '1234567890',
    coins: 1000,
    rupees: 10,
    method: 'upi',
    destination: 'wrong@upi',
    status: 'rejected',
    adminNote: 'Invalid UPI handle — coins refunded.',
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T11:15:00.000Z',
  },
];

test('normalizeWithdrawalBucket and getWithdrawalStatusMeta map pending, processed, and rejected clearly', () => {
  assert.equal(normalizeWithdrawalBucket('pending'), 'pending');
  assert.equal(normalizeWithdrawalBucket('approved'), 'processed');
  assert.equal(normalizeWithdrawalBucket('rejected'), 'rejected');

  assert.equal(getWithdrawalStatusMeta(SAMPLE_WITHDRAWALS[0]).label, 'Pending');
  assert.equal(getWithdrawalStatusMeta(SAMPLE_WITHDRAWALS[1]).label, 'Processed');
  assert.equal(getWithdrawalStatusMeta(SAMPLE_WITHDRAWALS[2]).label, 'Rejected');
});

test('summarizeWithdrawals computes totals across all redemption statuses', () => {
  const summary = summarizeWithdrawals(SAMPLE_WITHDRAWALS);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.processedCount, 1);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.pendingCoins, 1500);
  assert.equal(summary.pendingRupees, 15);
  assert.equal(summary.processedCoins, 2000);
  assert.equal(summary.processedRupees, 20);
  assert.equal(summary.rejectedCoins, 1000);
});

test('filterAndSortWithdrawals filters by status bucket and sorts newest first', () => {
  const all = filterAndSortWithdrawals(SAMPLE_WITHDRAWALS, 'all');
  assert.deepEqual(
    all.map((w) => w.id),
    ['wd_pending_1', 'wd_approved_1', 'wd_rejected_1']
  );

  const processed = filterAndSortWithdrawals(SAMPLE_WITHDRAWALS, 'processed');
  assert.deepEqual(
    processed.map((w) => w.id),
    ['wd_approved_1']
  );

  const pending = filterAndSortWithdrawals(SAMPLE_WITHDRAWALS, 'pending');
  assert.deepEqual(
    pending.map((w) => w.id),
    ['wd_pending_1']
  );

  const rejected = filterAndSortWithdrawals(SAMPLE_WITHDRAWALS, 'rejected');
  assert.deepEqual(
    rejected.map((w) => w.id),
    ['wd_rejected_1']
  );
});

test('formatWithdrawalTimestamp handles valid and invalid timestamps safely', () => {
  assert.equal(formatWithdrawalTimestamp(''), '—');
  assert.equal(formatWithdrawalTimestamp('not-a-date'), '—');
  assert.notEqual(formatWithdrawalTimestamp('2026-11-15T04:00:00.000Z'), '—');
});
