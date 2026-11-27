// Implements the web app's DesktopBridge (apps/web/src/lib/desktop.ts) on top of chrome.* APIs.
// Loaded as a classic script before the web bundle, so window.desktop exists when the app boots.
(() => {
  const DEFAULT_API = 'https://authenticator.sz4h.com/api';
  const HOUR = 3_600_000;
  const local = chrome.storage.local;
  // storage.session lives in memory and is wiped when the browser quits -> always locked after a restart
  const session = chrome.storage.session;
  const get = async (area, k, d) => (await area.get(k))[k] ?? d;

  const ua = navigator.userAgentData?.platform ?? navigator.platform;
  const platform = /mac/i.test(ua) ? 'darwin' : /win/i.test(ua) ? 'win32' : 'linux';

  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  // authenticatorData flags byte: 0x04 = user verified (fingerprint / face / Hello PIN, not just presence)
  const verified = authData => (new Uint8Array(authData)[32] & 0x04) !== 0;

  const markUnlocked = () => session.set({ unlockedAt: Date.now() });

  async function isLocked() {
    const at = await get(session, 'unlockedAt', 0);
    if (!at) return true;
    const t = await get(local, 'lockTimeout', HOUR);
    return t > 0 && Date.now() - at >= t;
  }

  /** Local platform-authenticator check (Touch ID / Windows Hello). The first unlock enrolls a credential. */
  async function unlockBiometric() {
    try {
      const id = await get(local, 'credId', null);
      if (!id) {
        const c = await navigator.credentials.create({ publicKey: {
          rp: { name: 'Space Authenticator' },
          user: { id: rand(16), name: 'Space Authenticator', displayName: 'Space Authenticator lock' },
          challenge: rand(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          attestation: 'none', timeout: 60_000,
        } });
        if (!c) return false;
        await local.set({ credId: b64(c.rawId) });
      } else {
        const a = await navigator.credentials.get({ publicKey: {
          challenge: rand(32),
          allowCredentials: [{ type: 'public-key', id: unb64(id) }],
          userVerification: 'required', timeout: 60_000,
        } });
        if (!a || !verified(a.response.authenticatorData)) return false;
      }
      await markUnlocked();
      return true;
    } catch (e) {
      console.warn('biometric unlock failed', e);
      return false;
    }
  }

  /** Short name of the active tab's site ("github" for github.com) to pre-filter the vault. Needs activeTab, which the toolbar click / shortcut grants. */
  async function getSearchHint() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.url || !/^https?:/.test(tab.url)) return null;
      const parts = new URL(tab.url).hostname.replace(/^www\./, '').split('.');
      // ponytail: naive registrable-name guess (example.co.uk -> example); swap for a public-suffix list if it misfires
      const i = parts.length >= 3 && parts.at(-2).length <= 3 ? parts.length - 3 : Math.max(0, parts.length - 2);
      return parts[i] || null;
    } catch { return null; }
  }

  window.desktop = {
    native: true,
    platform,
    biometricLabel: platform === 'darwin' ? 'Touch ID' : 'Windows Hello',
    getApiUrl: () => get(local, 'apiUrl', DEFAULT_API),
    setApiUrl: url => local.set({ apiUrl: url }),
    getRefreshToken: () => get(local, 'refreshToken', null),
    setRefreshToken: t => (t ? local.set({ refreshToken: t }) : local.remove('refreshToken')),
    canBiometric: async () => !!(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()),
    unlockBiometric,
    markUnlocked,
    isLocked,
    onLock(cb) {
      let locked = false;
      const check = async () => { const l = await isLocked(); if (l && !locked) cb(); locked = l; };
      const t = setInterval(check, 15_000);
      window.addEventListener('focus', check);
      return () => { clearInterval(t); window.removeEventListener('focus', check); };
    },
    getLockTimeout: () => get(local, 'lockTimeout', HOUR),
    setLockTimeout: ms => local.set({ lockTimeout: ms }),
    getSearchHint,
  };
})();
