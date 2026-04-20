const THEME_BACKGROUNDS = { light: '#f4f4f4', dark: '#1b1d24' };
const FALLBACK_COLOR = '#8B4513';
const HEX_REGEX = /^#[\dA-Fa-f]{6}$/;

/**
 * Get the current UI background color based on theme setting.
 * @returns {string} Hex color for the active theme background
 */
function getThemeBackground() {
  const theme = game.settings.get('core', 'uiConfig').colorScheme.applications;
  return THEME_BACKGROUNDS[theme] || THEME_BACKGROUNDS.light;
}

/**
 * Extract dominant color from an image by sampling pixel data on a canvas.
 * @param {string} imageSrc - Path to the image
 * @returns {Promise<string>} Hex color string of the dominant color, or fallback
 */
async function extractDominantColor(imageSrc) {
  if (!imageSrc || imageSrc === 'icons/svg/mystery-man.svg') return Promise.resolve(FALLBACK_COLOR);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(FALLBACK_COLOR), 5000);
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
        const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
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
        resolve(HEX_REGEX.test(hex) ? hex : FALLBACK_COLOR);
      } else resolve(FALLBACK_COLOR);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      resolve(FALLBACK_COLOR);
    };
    image.src = imageSrc;
  }).catch(() => FALLBACK_COLOR);
}

/**
 * Extract and contrast-adjust a color from an image.
 * @param {string} imageSrc - Path to the image
 * @returns {Promise<string>} WCAG-compliant hex color
 */
async function extractAndAdjustColor(imageSrc) {
  const extracted = await extractDominantColor(imageSrc);
  const adjusted = adjustColorForContrast(extracted, getThemeBackground(), 4.5);
  return HEX_REGEX.test(adjusted) ? adjusted : FALLBACK_COLOR;
}

/**
 * Extract dominant color from a class item's image.
 * @param {object} classItem - The class item with an img property
 * @returns {Promise<string>} Hex color string adjusted for contrast
 */
export async function getClassColorForWizardTab(classItem) {
  return extractAndAdjustColor(classItem?.img);
}

/**
 * Apply class-specific colors to CSS with WCAG contrast compliance.
 * @param {object} spellcastingClasses - Object mapping class identifiers to class data
 * @returns {Promise<void>}
 */
export async function applyClassColors(spellcastingClasses) {
  const styleElement = document.getElementById('spell-book-class-colors') || document.createElement('style');
  styleElement.id = 'spell-book-class-colors';
  let css = '';
  for (const [classId, classData] of Object.entries(spellcastingClasses)) {
    const color = await extractAndAdjustColor(classData.img);
    css +=
      `.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"] .class-name{color:${color}}` +
      `.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"].active-class{font-weight:bold}` +
      `.spell-prep-tracking .class-prep-count[data-class-identifier="${classId}"].active-class .class-name{color:${color};text-shadow:0 0 3px ${color}40}`;
  }
  styleElement.textContent = css;
  if (!styleElement.parentNode) document.head.appendChild(styleElement);
}

/**
 * Inject CSS custom properties for wizard book tab colors.
 * @param {Map<string, string>} classStylingCache - Map of class identifier to color hex strings
 */
export function injectWizardBookColorCSS(classStylingCache) {
  if (!classStylingCache || classStylingCache.size === 0) return;
  const styleId = 'spell-book-wizard-colors';
  let styleElement = document.getElementById(styleId);
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }
  let css = '';
  for (const [identifier, color] of classStylingCache) {
    const colorObj = foundry.utils.Color.fromString(color);
    if (colorObj.valid) {
      const r = Math.round(colorObj.r * 255);
      const g = Math.round(colorObj.g * 255);
      const b = Math.round(colorObj.b * 255);
      const [h] = colorObj.hsl;
      css +=
        `.tabs.tabs-right > .item[data-tab="wizardbook-${identifier}"] {` +
        `--wizard-book-color: ${color};` +
        `--wizard-book-color-rgb: ${r}, ${g}, ${b};` +
        `--wizard-book-color-hue: ${h * 360}deg;` +
        '}';
    }
  }
  styleElement.textContent = css;
}

/**
 * Convert hex color string to RGB object.
 * @param {string} hex - Hex color string
 * @returns {{r: number, g: number, b: number}|null} RGB object or null if invalid
 */
function hexToRgb(hex) {
  const color = foundry.utils.Color.fromString(hex);
  if (!color.valid) return null;
  return { r: Math.round(color.r * 255), g: Math.round(color.g * 255), b: Math.round(color.b * 255) };
}

/**
 * Convert HSL to RGB.
 * @param {number} hue - Hue in degrees [0,360]
 * @param {number} saturation - Saturation percentage [0,100]
 * @param {number} lightness - Lightness percentage [0,100]
 * @returns {{r: number, g: number, b: number}} RGB object
 */
function hslToRgb(hue, saturation, lightness) {
  const color = foundry.utils.Color.fromHSL([hue / 360, saturation / 100, lightness / 100]);
  return { r: Math.round(color.r * 255), g: Math.round(color.g * 255), b: Math.round(color.b * 255) };
}

/**
 * Calculate relative luminance per WCAG 2.0.
 * @param {number} r - Red [0,255]
 * @param {number} g - Green [0,255]
 * @param {number} b - Blue [0,255]
 * @returns {number} Relative luminance [0,1]
 */
function calculateLuminance(r, g, b) {
  const [linearR, linearG, linearB] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}

/**
 * Calculate contrast ratio between two hex colors per WCAG 2.0.
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @returns {number} Contrast ratio [1,21]
 */
function calculateContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = calculateLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Adjust color lightness to meet WCAG contrast ratio requirement.
 * @param {string} color - Hex color to adjust
 * @param {string} background - Background hex color to test against
 * @param {number} [targetRatio] - Target contrast ratio (default 4.5)
 * @returns {string} Adjusted hex color
 * @private
 */
function adjustColorForContrast(color, background, targetRatio = 4.5) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const hslColor = foundry.utils.Color.fromRGB([rgb.r / 255, rgb.g / 255, rgb.b / 255]);
  const [hslH, hslS, hslL] = hslColor.hsl;
  const hsl = { h: hslH * 360, s: hslS * 100, l: hslL * 100 };
  let currentRatio = calculateContrastRatio(color, background);
  if (currentRatio >= targetRatio) return color;
  const bgRgb = hexToRgb(background);
  const bgLuminance = calculateLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  const shouldLighten = bgLuminance < 0.5;
  let adjustedLightness = hsl.l;
  const step = shouldLighten ? 5 : -5;
  const limit = shouldLighten ? 95 : 5;
  let attempts = 0;
  while (currentRatio < targetRatio && attempts < 20) {
    adjustedLightness += step;
    adjustedLightness = shouldLighten ? Math.min(adjustedLightness, limit) : Math.max(adjustedLightness, limit);
    const adjustedRgb = hslToRgb(hsl.h, hsl.s, adjustedLightness);
    const adjustedHex = `#${((1 << 24) + (adjustedRgb.r << 16) + (adjustedRgb.g << 8) + adjustedRgb.b).toString(16).slice(1)}`;
    currentRatio = calculateContrastRatio(adjustedHex, background);
    if (currentRatio >= targetRatio) return adjustedHex;
    if ((shouldLighten && adjustedLightness >= limit) || (!shouldLighten && adjustedLightness <= limit)) break;
    attempts++;
  }
  const finalRgb = hslToRgb(hsl.h, hsl.s, adjustedLightness);
  return `#${((1 << 24) + (finalRgb.r << 16) + (finalRgb.g << 8) + finalRgb.b).toString(16).slice(1)}`;
}
