/** Thank you Ben for writing this color detection code for me. */

import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
const T = { light: '#f4f4f4', dark: '#1b1d24' };
function d() {
  if (!MODULE.ISV13) return game.settings.get('core', 'colorScheme');
  else return game.settings.get('core', 'uiConfig').colorScheme.applications;
}
function h(x) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(x);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const x = Math.max(r, g, b),
    n = Math.min(r, g, b);
  let h,
    s,
    l = (x + n) / 2;
  if (x === n) h = s = 0;
  else {
    const d = x - n;
    s = l > 0.5 ? d / (2 - x - n) : d / (x + n);
    switch (x) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  const u = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    r = u(p, q, h + 1 / 3);
    g = u(p, q, h);
    b = u(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function L(r, g, b) {
  const [x, y, z] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * x + 0.7152 * y + 0.0722 * z;
}
function C(a, b) {
  const x = h(a),
    y = h(b);
  if (!x || !y) return 1;
  const l1 = L(x.r, x.g, x.b),
    l2 = L(y.r, y.g, y.b),
    br = Math.max(l1, l2),
    dr = Math.min(l1, l2);
  return (br + 0.05) / (dr + 0.05);
}
function A(c, bg, t = 4.5) {
  const rgb = h(c);
  if (!rgb) return c;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  let cr = C(c, bg);
  if (cr >= t) return c;
  const bRgb = h(bg),
    bLum = L(bRgb.r, bRgb.g, bRgb.b),
    sL = bLum < 0.5;
  let aL = hsl.l;
  const st = sL ? 5 : -5,
    lm = sL ? 95 : 5;
  let at = 0;
  while (cr < t && at < 20) {
    aL += st;
    if (sL && aL >= lm) aL = lm;
    if (!sL && aL <= lm) aL = lm;
    const aRgb = hslToRgb(hsl.h, hsl.s, aL),
      aHex = `#${((1 << 24) + (aRgb.r << 16) + (aRgb.g << 8) + aRgb.b).toString(16).slice(1)}`;
    cr = C(aHex, bg);
    if (cr >= t) return aHex;
    if ((sL && aL >= lm) || (!sL && aL <= lm)) break;
    at++;
  }
  const fRgb = hslToRgb(hsl.h, hsl.s, aL);
  return `#${((1 << 24) + (fRgb.r << 16) + (fRgb.g << 8) + fRgb.b).toString(16).slice(1)}`;
}
export async function extractDominantColor(src) {
  try {
    return new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => {
        log(2, `Timeout loading image for color extraction: ${src}`);
        resolve('#8B4513');
      }, 5000);
      i.onload = () => {
        clearTimeout(timeout);
        try {
          const c = document.createElement('canvas'),
            ctx = c.getContext('2d'),
            s = 50;
          c.width = s;
          c.height = s;
          ctx.drawImage(i, 0, 0, s, s);
          const d = ctx.getImageData(0, 0, s, s).data,
            m = new Map();
          for (let x = 0; x < d.length; x += 16) {
            const r = d[x],
              g = d[x + 1],
              b = d[x + 2],
              a = d[x + 3];
            if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
            const rG = Math.floor(r / 32) * 32,
              gG = Math.floor(g / 32) * 32,
              bG = Math.floor(b / 32) * 32,
              k = `${rG},${gG},${bG}`;
            m.set(k, (m.get(k) || 0) + 1);
          }
          let dc = null,
            mc = 0;
          for (const [c, cnt] of m.entries())
            if (cnt > mc) {
              mc = cnt;
              dc = c;
            }
          if (dc) {
            const [r, g, b] = dc.split(',').map(Number);
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            if (hex.match(/^#[0-9A-Fa-f]{6}$/)) resolve(hex);
            else resolve('#8B4513');
          } else resolve('#8B4513');
        } catch (e) {
          log(1, 'Error processing image for color extraction:', e);
          resolve('#8B4513');
        }
      };
      i.onerror = () => {
        clearTimeout(timeout);
        log(2, 'Could not load image for color extraction:', src);
        resolve('#8B4513');
      };

      i.src = src;
    });
  } catch (e) {
    log(1, 'Error in extractDominantColor:', e);
    return '#8B4513';
  }
}

export async function applyClassColors(sc) {
  try {
    const se = document.getElementById('spell-book-class-colors') || document.createElement('style');
    se.id = 'spell-book-class-colors';
    const tm = d();
    const bg = T[tm] || T.light || '#f4f4f4';
    let css = '';
    for (const [id, cd] of Object.entries(sc)) {
      const img = cd.img;
      let clr = '#8B4513';
      if (img && img !== 'icons/svg/mystery-man.svg') {
        try {
          const ec = await extractDominantColor(img);
          if (ec && typeof ec === 'string' && ec.match(/^#[0-9A-Fa-f]{6}$/)) {
            clr = A(ec, bg, 4.5);
          } else {
            log(2, `Invalid color extracted for class ${id}, using fallback`);
            clr = A('#8B4513', bg, 4.5);
          }
        } catch (e) {
          log(2, `Could not extract color for class ${id}, using fallback`);
          clr = A('#8B4513', bg, 4.5);
        }
      } else {
        clr = A('#8B4513', bg, 4.5);
      }
      if (!clr || typeof clr !== 'string' || !clr.match(/^#[0-9A-Fa-f]{6}$/)) {
        log(2, `Final color validation failed for class ${id}, using raw fallback`);
        clr = '#8B4513';
      }
      css += `.spell-prep-tracking .class-prep-count[data-class-identifier="${id}"] .class-name{color:${clr}}.spell-prep-tracking .class-prep-count[data-class-identifier="${id}"].active-class{font-weight:bold}.spell-prep-tracking .class-prep-count[data-class-identifier="${id}"].active-class .class-name{color:${clr};text-shadow:0 0 3px ${clr}40}`;
    }
    se.textContent = css;
    if (!se.parentNode) document.head.appendChild(se);
    log(3, 'Applied class-specific colors to CSS with contrast adjustment');
  } catch (e) {
    log(1, 'Error applying class colors:', e);
  }
}
