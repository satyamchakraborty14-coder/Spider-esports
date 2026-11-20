import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTelegramSupportInfo,
  normalizeAndValidateTelegramSupport,
  validateTelegramSupportLabel,
} from './supportConfig';

test('normalizeAndValidateTelegramSupport normalizes @handles, bare handles, and t.me links', () => {
  const atHandle = normalizeAndValidateTelegramSupport(' @spider_support ');
  assert.equal(atHandle.valid, true);
  if (atHandle.valid) {
    assert.equal(atHandle.url, 'https://t.me/spider_support');
    assert.equal(atHandle.displayHandle, '@spider_support');
  }

  const bareHandle = normalizeAndValidateTelegramSupport('SpiderEsportsHelp');
  assert.equal(bareHandle.valid, true);
  if (bareHandle.valid) {
    assert.equal(bareHandle.url, 'https://t.me/SpiderEsportsHelp');
    assert.equal(bareHandle.displayHandle, '@SpiderEsportsHelp');
  }

  const shortLink = normalizeAndValidateTelegramSupport('t.me/spider_desk');
  assert.equal(shortLink.valid, true);
  if (shortLink.valid) {
    assert.equal(shortLink.url, 'https://t.me/spider_desk');
  }

  const inviteLink = normalizeAndValidateTelegramSupport('http://t.me/+AbCdEf123456/');
  assert.equal(inviteLink.valid, true);
  if (inviteLink.valid) {
    assert.equal(inviteLink.url, 'https://t.me/+AbCdEf123456');
    assert.equal(inviteLink.displayHandle, 'Telegram Support Group');
  }

  const cleared = normalizeAndValidateTelegramSupport('   ');
  assert.equal(cleared.valid, true);
  if (cleared.valid) {
    assert.equal(cleared.url, '');
  }
});

test('normalizeAndValidateTelegramSupport rejects non-Telegram URLs, scripts, and short handles', () => {
  assert.equal(normalizeAndValidateTelegramSupport('javascript:alert(1)').valid, false);
  assert.equal(normalizeAndValidateTelegramSupport('https://evil.example.com/t.me/user').valid, false);
  assert.equal(normalizeAndValidateTelegramSupport('@abc').valid, false);
  assert.equal(normalizeAndValidateTelegramSupport('https://t.me/').valid, false);
  assert.equal(normalizeAndValidateTelegramSupport('https://t.me/bad handle').valid, false);
});

test('getTelegramSupportInfo and label validator return accurate configured vs unconfigured states', () => {
  const empty = getTelegramSupportInfo(null);
  assert.equal(empty.configured, false);
  assert.equal(empty.url, '');

  const configured = getTelegramSupportInfo({
    telegramSupportUrl: 'https://t.me/spider_helpdesk',
    telegramSupportLabel: '24/7 Official Helpdesk',
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.url, 'https://t.me/spider_helpdesk');
  assert.equal(configured.displayHandle, '@spider_helpdesk');
  assert.equal(configured.label, '24/7 Official Helpdesk');

  assert.equal(validateTelegramSupportLabel('24/7 Live Support').valid, true);
  assert.equal(validateTelegramSupportLabel('x'.repeat(81)).valid, false);
});
