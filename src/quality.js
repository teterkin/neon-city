import { QUALITY } from './config.js';

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Telegram/i;

export function pickQuality({ isMobile = false, cores = 8, webgl2 = true } = {}) {
  if (!webgl2) return 'low';
  if (isMobile) return 'low';
  if (cores <= 4) return 'low';
  return 'high';
}

export function qualitySettings(tier) {
  return QUALITY[tier] ?? QUALITY.low;
}

export function nextTier(tier, fps) {
  if (tier === 'high' && fps < 45) return 'low';
  return tier;
}

export function detectEnvironment(navigatorLike = globalThis.navigator, windowLike = globalThis) {
  const userAgent = navigatorLike?.userAgent ?? '';
  const touchPoints = navigatorLike?.maxTouchPoints ?? 0;
  const innerWidth = windowLike?.innerWidth ?? 1440;
  const isMobile = MOBILE_UA.test(userAgent) || (touchPoints > 1 && innerWidth < 900);
  return {
    isMobile,
    cores: navigatorLike?.hardwareConcurrency ?? 8,
    memory: navigatorLike?.deviceMemory ?? 8,
    pixelRatio: windowLike?.devicePixelRatio ?? 1,
  };
}
