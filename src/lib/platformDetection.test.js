import { describe, it, expect, afterEach, vi } from 'vitest';
import { isIOS, isStandalone, isSafari, isIOSStandalone } from './platformDetection';

// vitest.config roda em environment 'node' (sem DOM real). O Node 20+ já
// expõe um `navigator` global só-leitura (Web Platform API), por isso não dá
// pra sobrescrever com atribuição direta — usa vi.stubGlobal, que troca a
// propriedade global corretamente e desfaz sozinho no afterEach abaixo.
function setGlobals({ userAgent = '', platform = '', maxTouchPoints = 0, standaloneFlag, matchMediaMatches = false } = {}) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints, ...(standaloneFlag !== undefined ? { standalone: standaloneFlag } : {}) });
  vi.stubGlobal('window', { matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' ? matchMediaMatches : false }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const UA_DESKTOP_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('isIOS', () => {
  it('detecta iPhone pelo userAgent clássico', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI });
    expect(isIOS()).toBe(true);
  });

  it('detecta iPadOS 13+ (userAgent de Mac, mas com touch)', () => {
    setGlobals({ userAgent: UA_DESKTOP_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });

  it('NÃO marca um Mac de verdade (sem touch) como iOS', () => {
    setGlobals({ userAgent: UA_DESKTOP_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIOS()).toBe(false);
  });

  it('NÃO marca Android como iOS', () => {
    setGlobals({ userAgent: UA_ANDROID_CHROME, platform: 'Linux armv8l' });
    expect(isIOS()).toBe(false);
  });

  it('NÃO marca Windows/Chrome desktop como iOS', () => {
    setGlobals({ userAgent: UA_DESKTOP_CHROME, platform: 'Win32' });
    expect(isIOS()).toBe(false);
  });
});

describe('isStandalone', () => {
  it('true quando display-mode: standalone bate (PWA instalado, Android/Chrome)', () => {
    setGlobals({ userAgent: UA_ANDROID_CHROME, matchMediaMatches: true });
    expect(isStandalone()).toBe(true);
  });

  it('true quando navigator.standalone é true (Safari/iOS, app na Tela de Início)', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI, standaloneFlag: true, matchMediaMatches: false });
    expect(isStandalone()).toBe(true);
  });

  it('false numa aba normal do navegador (nem media query nem navigator.standalone)', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI, standaloneFlag: false, matchMediaMatches: false });
    expect(isStandalone()).toBe(false);
  });
});

describe('isSafari', () => {
  it('true pro Safari de verdade (desktop)', () => {
    setGlobals({ userAgent: UA_DESKTOP_SAFARI });
    expect(isSafari()).toBe(true);
  });

  it('true pro Safari de verdade no iPhone', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI });
    expect(isSafari()).toBe(true);
  });

  it('false pro Chrome no iPhone (CriOS) — mesmo tendo "Safari" no userAgent', () => {
    setGlobals({ userAgent: UA_IPHONE_CHROME });
    expect(isSafari()).toBe(false);
  });

  it('false pro Chrome/Android — mesmo tendo "Safari" no userAgent', () => {
    setGlobals({ userAgent: UA_ANDROID_CHROME });
    expect(isSafari()).toBe(false);
  });
});

describe('isIOSStandalone', () => {
  it('true só quando é iOS E está instalado (standalone)', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI, standaloneFlag: true });
    expect(isIOSStandalone()).toBe(true);
  });

  it('false quando é iOS mas está numa aba normal do Safari (não instalado)', () => {
    setGlobals({ userAgent: UA_IPHONE_SAFARI, standaloneFlag: false });
    expect(isIOSStandalone()).toBe(false);
  });

  it('false quando é Android instalado (standalone), por não ser iOS', () => {
    setGlobals({ userAgent: UA_ANDROID_CHROME, matchMediaMatches: true });
    expect(isIOSStandalone()).toBe(false);
  });
});
