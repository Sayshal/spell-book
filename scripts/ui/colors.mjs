/**
 * Color Utilities and WCAG Contrast Compliance
 *
 * This module provides color manipulation and accessibility utilities for the Spell Book,
 * with a focus on WCAG 2.0 contrast compliance. It leverages Foundry VTT's core Color
 * utilities while providing specialized functionality for:
 *
 * @module ui/colors
 * @author Tyler
 */

const THEME_BACKGROUNDS = { light: '#f4f4f4', dark: '#1b1d24' };

/**
 * Apply class-specific colors to CSS with WCAG contrast compliance
 * @param {Object} spellcastingClasses - Object mapping class identifiers to class data
 * @param {string} spellcastingClasses[].img - Path to class icon image
 * @returns {Promise<void>}
 */
export async function applyClassColors(spellcastingClasses) {
  const styleElement = document.getElementById('spell-book-class-colors') || document.createElement('style');
  styleElement.id = 'spell-book-class-colors';
  const theme = game.settings.get('core', 'uiConfig').colorScheme.applications;
  const background = THEME_BACKGROUNDS[theme] || THEME_BACKGROUNDS.light || '#f4f4f4';
  let css = '';
  for (const [classId, classData] of Object.entries(spellcastingClasses)) {
    const img = classData.img;
    const fallbackColor = '#8B4513';
    let color = fallbackColor;
    if (img && img !== 'icons/svg/mystery-man.svg') {
      const extractedColor = await new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        const timeout = setTimeout(() => {
          resolve(fallbackColor);
        }, 5000);
        image.onload = () => {
          clearTimeout(timeout);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const size = 50;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(image, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size).data;
          const colorMap = new Map();
          for (let i = 0; i < imageData.length; i += 16) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const alpha = imageData[i + 3];
            if (alpha < 128 || (r > 240 && g > 240 && b > 240)) continue;
            const rGrouped = Math.floor(r / 32) * 32;
            const gGrouped = Math.floor(g / 32) * 32;
            const bGrouped = Math.floor(b / 32) * 32;
            const key = `${rGrouped},${gGrouped},${bGrouped}`;
            colorMap.set(key, (colorMap.get(key) || 0) + 1);
          }
          let dominantColor = null;
          let maxCount = 0;
          for (const [colorKey, count] of colorMap.entries()) {
            if (count > maxCount) {
              maxCount = count;
              dominantColor = colorKey;
            }
          }
          if (dominantColor) {
            const [r, g, b] = dominantColor.split(',').map(Number);
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            if (hex.match(/^#[\dA-Fa-f]{6}$/)) resolve(hex);
            else resolve(fallbackColor);
          } else resolve(fallbackColor);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          resolve(fallbackColor);
        };
        image.src = img;
      });
      if (extractedColor && typeof extractedColor === 'string' && extractedColor.match(/^#[\dA-Fa-f]{6}$/)) color = _adjustColorForContrast(extractedColor, background, 4.5);
      else color = _adjustColorForContrast(fallbackColor, background, 4.5);
    } else color = _adjustColorForContrast(fallbackColor, background, 4.5);
    if (!color || typeof color !== 'string' || !color.match(/^#[\dA-Fa-f]{6}$/)) color = fallbackColor;
    css += `.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"] .class-name{color:${color}}.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"].active-class{font-weight:bold}.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"].active-class .class-name{color:${color};text-shadow:0 0 3px ${color}40}`;
  }
  styleElement.textContent = css;
  if (!styleElement.parentNode) document.head.appendChild(styleElement);
}

/**
 * Convert hex color string to RGB object using Foundry's Color class
 * @param {string} hex - Hex color string (with or without # prefix)
 * @returns {{r: number, g: number, b: number}|null} RGB object with values in [0,255] range, or null if invalid
 * @private
 */
function hexToRgb(hex) {
  const color = foundry.utils.Color.fromString(hex);
  if (!color.valid) return null;
  return { r: Math.round(color.r * 255), g: Math.round(color.g * 255), b: Math.round(color.b * 255) };
}

/**
 * Convert HSL to RGB using Foundry's Color class
 * @param {number} hue - Hue value in degrees [0,360]
 * @param {number} saturation - Saturation percentage [0,100]
 * @param {number} lightness - Lightness percentage [0,100]
 * @returns {{r: number, g: number, b: number}} RGB object with values in [0,255] range
 * @private
 */
function _hslToRgb(hue, saturation, lightness) {
  const color = foundry.utils.Color.fromHSL([hue / 360, saturation / 100, lightness / 100]);
  return { r: Math.round(color.r * 255), g: Math.round(color.g * 255), b: Math.round(color.b * 255) };
}

/**
 * Calculate relative luminance according to WCAG 2.0 standard
 * @param {number} r - Red value [0,255]
 * @param {number} g - Green value [0,255]
 * @param {number} b - Blue value [0,255]
 * @returns {number} Relative luminance [0,1]
 * @private
 */
function _calculateLuminance(r, g, b) {
  const [linearR, linearG, linearB] = [r, g, b].map((channel) => {
    channel /= 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}

/**
 * Calculate contrast ratio between two colors according to WCAG 2.0 standard
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @returns {number} Contrast ratio [1,21], where 21 is maximum contrast
 * @private
 */
function _calculateContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = _calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = _calculateLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Adjust color lightness to meet WCAG contrast ratio requirement
 * @param {string} color - Hex color to adjust
 * @param {string} background - Background hex color to test against
 * @param {number} [targetRatio=4.5] - Target contrast ratio (4.5 for WCAG AA, 7 for AAA)
 * @returns {string} Adjusted hex color that meets contrast requirement
 * @private
 */
function _adjustColorForContrast(color, background, targetRatio = 4.5) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const hslColor = foundry.utils.Color.fromRGB([rgb.r / 255, rgb.g / 255, rgb.b / 255]);
  const [hslH, hslS, hslL] = hslColor.hsl;
  const hsl = { h: hslH * 360, s: hslS * 100, l: hslL * 100 };
  let currentRatio = _calculateContrastRatio(color, background);
  if (currentRatio >= targetRatio) return color;
  const bgRgb = hexToRgb(background);
  const bgLuminance = _calculateLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  const shouldLighten = bgLuminance < 0.5;
  let adjustedLightness = hsl.l;
  const step = shouldLighten ? 5 : -5;
  const limit = shouldLighten ? 95 : 5;
  let attempts = 0;
  while (currentRatio < targetRatio && attempts < 20) {
    adjustedLightness += step;
    if (shouldLighten && adjustedLightness >= limit) adjustedLightness = limit;
    if (!shouldLighten && adjustedLightness <= limit) adjustedLightness = limit;
    const adjustedRgb = _hslToRgb(hsl.h, hsl.s, adjustedLightness);
    const adjustedHex = `#${((1 << 24) + (adjustedRgb.r << 16) + (adjustedRgb.g << 8) + adjustedRgb.b).toString(16).slice(1)}`;
    currentRatio = _calculateContrastRatio(adjustedHex, background);
    if (currentRatio >= targetRatio) return adjustedHex;
    if ((shouldLighten && adjustedLightness >= limit) || (!shouldLighten && adjustedLightness <= limit)) break;
    attempts++;
  }
  const finalRgb = _hslToRgb(hsl.h, hsl.s, adjustedLightness);
  return `#${((1 << 24) + (finalRgb.r << 16) + (finalRgb.g << 8) + finalRgb.b).toString(16).slice(1)}`;
}
