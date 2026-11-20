import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ADD_COIN_RUPEES,
  MIN_ADD_COIN_RUPEES,
  validateDepositAmount,
  validateOptionalPayerUpi,
  validateUtrNumber,
  verifyCoinDepositSubmission,
} from './coinDepositVerification';

test('validateDepositAmount enforces whole rupee integer within bounds and 1:1 coin ratio', () => {
  assert.equal(validateDepositAmount(MIN_ADD_COIN_RUPEES - 1).valid, false);
  assert.equal(validateDepositAmount(MAX_ADD_COIN_RUPEES + 1).valid, false);
  assert.equal(validateDepositAmount(75.5).valid, false);
  assert.deepEqual(validateDepositAmount(150), {
    valid: true,
    rupees: 150,
    coins: 150,
  });
});

test('validateUtrNumber enforces 12-digit NPCI UTR and blocks fake repeating/sequential strings', () => {
  assert.equal(validateUtrNumber('12345').valid, false);
  assert.equal(validateUtrNumber('000000000000').valid, false);
  assert.equal(validateUtrNumber('111111111111').valid, false);
  assert.equal(validateUtrNumber('123456789012').valid, false);
  assert.equal(validateUtrNumber('987654321098').valid, false);
  assert.equal(validateUtrNumber('121212121212').valid, false);
  assert.equal(validateUtrNumber('43298123456A').valid, false);

  assert.deepEqual(validateUtrNumber(' 4329 8123 4567 '), {
    valid: true,
    utr: '432981234567',
  });
});

test('validateOptionalPayerUpi accepts blank or valid UPI handle and rejects malformed strings', () => {
  assert.deepEqual(validateOptionalPayerUpi(''), { valid: true });
  assert.deepEqual(validateOptionalPayerUpi('player@okaxis'), {
    valid: true,
    payerUpi: 'player@okaxis',
  });
  assert.equal(validateOptionalPayerUpi('not-an-upi').valid, false);
});

test('verifyCoinDepositSubmission verifies QR configuration, screenshot format, and auto-calculates coins 1:1', () => {
  assert.equal(
    verifyCoinDepositSubmission({
      amountRupees: 100,
      utr: '432981234567',
      hasPaymentQrConfigured: false,
    }).valid,
    false
  );

  assert.equal(
    verifyCoinDepositSubmission({
      amountRupees: 100,
      utr: '432981234567',
      screenshotUrl: 'data:text/html;base64,PHNjcmlwdD4=',
      hasPaymentQrConfigured: true,
    }).valid,
    false
  );

  const ok = verifyCoinDepositSubmission({
    amountRupees: 250,
    utr: '432981234567',
    payerUpi: 'gamer@ybl',
    screenshotUrl: 'data:image/png;base64,iVBORw0KGgo=',
    hasPaymentQrConfigured: true,
  });
  assert.equal(ok.valid, true);
  if (ok.valid) {
    assert.equal(ok.rupees, 250);
    assert.equal(ok.coins, 250);
    assert.equal(ok.utr, '432981234567');
    assert.equal(ok.payerUpi, 'gamer@ybl');
  }
});
