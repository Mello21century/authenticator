// Hero demo: real RFC 6238 TOTP codes computed in the browser from throwaway demo secrets.
const demo = [
  { issuer: 'GitHub', label: 'octo@example.com', secret: 'JBSWY3DPEHPK3PXP', color: '#3d5168' },
  { issuer: 'Google', label: 'me@example.com', secret: 'KRSXG5CTMVRXEZLU', color: '#5b7a5e' },
  { issuer: 'AWS', label: 'root account', secret: 'GEZDGNBVGY3TQOJQ', color: '#8a6a3b' },
];

const b32 = s => {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s) bits += a.indexOf(c).toString(2).padStart(5, '0');
  return Uint8Array.from(bits.match(/.{8}/g), b => parseInt(b, 2));
};

async function totp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(4, counter);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(n).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1 $2');
}

const list = document.getElementById('codes');
const C = 2 * Math.PI * 12;
list.innerHTML = demo.map((d, i) => `
  <div class="code-row">
    <div class="avatar" style="background:${d.color}" aria-hidden="true">${d.issuer[0]}</div>
    <div class="who"><b>${d.issuer}</b><span>${d.label}</span></div>
    <div class="digits" id="c${i}" aria-live="off">--- ---</div>
    <svg class="ring" viewBox="0 0 30 30" aria-hidden="true"><circle class="track" cx="15" cy="15" r="12"/><circle class="left" cx="15" cy="15" r="12" stroke-dasharray="${C}"/></svg>
  </div>`).join('');

let last = -1;
async function tick() {
  const now = Date.now() / 1000, counter = Math.floor(now / 30), left = 30 - (now % 30);
  if (counter !== last) {
    last = counter;
    const codes = await Promise.all(demo.map(d => totp(d.secret, counter)));
    codes.forEach((c, i) => { document.getElementById('c' + i).textContent = c; });
  }
  const soon = left <= 5;
  document.querySelectorAll('.digits').forEach(el => el.classList.toggle('soon', soon));
  document.querySelectorAll('.ring').forEach(r => {
    r.classList.toggle('soon', soon);
    r.querySelector('.left').style.strokeDashoffset = String(C * (1 - left / 30));
  });
}
tick();
setInterval(tick, 1000);

// header hairline once the page scrolls
const top = document.querySelector('.top');
addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 8), { passive: true });
