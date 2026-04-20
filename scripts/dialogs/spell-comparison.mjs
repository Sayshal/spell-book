import { TEMPLATES } from '../constants.mjs';
import { createSpellIconLink, formatSpellActivation, formatSpellComponents, formatSpellSchool } from '../ui/formatting.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MIN_COL_WIDTH = 150;
const PROPERTY_COL_WIDTH = 120;
const DIALOG_PADDING = 40;
const MIN_WIDTH = 400;

/** Side-by-side spell comparison dialog. Spells are passed in via constructor options. */
export class SpellComparison extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-spell-comparison',
    tag: 'div',
    classes: ['spell-book', 'spell-comparison-dialog'],
    position: { width: 600, height: 'auto' },
    window: { icon: 'fas fa-scale-balanced', resizable: false, frame: false, positioned: true },
    actions: { close: SpellComparison.#onClose, toggleDetach: SpellComparison.#onToggleDetach }
  };

  /**
   * Close the frameless dialog from the template close button.
   * @this SpellComparison
   */
  static async #onClose() {
    this.element?.classList.add('closing');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.close({ animate: false });
  }

  /**
   * Toggle detached-window mode.
   * @this SpellComparison
   */
  static #onToggleDetach() {
    if (this.window.windowId) this.attachWindow();
    else this.detachWindow();
  }

  /** @override */
  static PARTS = { comparison: { template: TEMPLATES.DIALOGS.SPELL_COMPARISON } };

  /**
   * @param {object} options - Options including spellUuids and optional callbacks
   * @param {string[]} options.spellUuids - UUIDs of spells to compare
   * @param {Function} [options.onClose] - Callback fired when the dialog closes
   * @param {HTMLElement} [options.anchor] - Optional element to position the dialog near
   */
  constructor(options = {}) {
    super(options);
    this.spellUuids = Array.from(options.spellUuids || []);
    this._onCloseCallback = options.onClose || null;
    this._anchor = options.anchor || null;
  }

  /** @override */
  get title() {
    return _loc('SPELLBOOK.Comparison.DialogTitle');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spells = [];
    for (const uuid of this.spellUuids) {
      const spell = await fromUuid(uuid);
      if (spell) spells.push(this.#processSpell(spell));
    }
    context.spells = spells;
    context.comparisonData = this.#buildComparisonTable(spells);
    context.detached = options.window?.attach ? false : options.window?.detach ? true : !!this.window.windowId;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#sizeForSpellCount();
    this.#enableDragging();
    if (options.isFirstRender) {
      requestAnimationFrame(() => {
        if (this._anchor) this.#positionRelativeToAnchor();
        else this.#centerOnScreen();
      });
      this.bringToFront();
    }
  }

  /** Enable drag-to-move via the header strip. Re-wires on every render since PART DOM is replaced. */
  #enableDragging() {
    const handle = this.element?.querySelector('.comparison-drag-handle');
    if (!handle || handle.dataset.dragWired === '1') return;
    handle.dataset.dragWired = '1';
    const drag = new foundry.applications.ux.Draggable.implementation(this, this.element, handle, false);
    const originalMouseDown = drag._onDragMouseDown.bind(drag);
    drag._onDragMouseDown = (event) => {
      if (event.target.closest('button, a, input, select, [data-action]')) return;
      originalMouseDown(event);
    };
  }

  /** Center the frameless dialog on screen. */
  #centerOnScreen() {
    const width = this.position.width || this.options.position.width || MIN_WIDTH;
    const height = this.element?.offsetHeight || this.position.height || 400;
    const left = Math.max(20, Math.round((window.innerWidth - width) / 2));
    const top = Math.max(40, Math.round((window.innerHeight - height) / 2));
    this.setPosition({ left, top });
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (this._onCloseCallback) this._onCloseCallback();
  }

  /** @override */
  bringToFront() {
    if (!this.element) return;
    this.position.zIndex = ++ApplicationV2._maxZ;
    this.element.style.zIndex = String(this.position.zIndex);
    ui.activeWindow = this;
  }

  /** Resize the dialog horizontally based on the number of compared spells. */
  #sizeForSpellCount() {
    const count = this.spellUuids.length;
    if (!count) return;
    const calculated = PROPERTY_COL_WIDTH + count * MIN_COL_WIDTH + DIALOG_PADDING;
    const maxWidth = Math.min(window.innerWidth * 0.9, 1200);
    const width = Math.max(MIN_WIDTH, Math.min(maxWidth, calculated));
    this.setPosition({ width });
  }

  /** Position the dialog beside the anchor element if one was supplied. */
  #positionRelativeToAnchor() {
    if (!this._anchor) return;
    const triggerRect = this._anchor.getBoundingClientRect();
    const dialogWidth = this.options.position.width || MIN_WIDTH;
    const dialogHeight = 400;
    const margin = 20;
    const offset = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rightSpace = vw - triggerRect.right;
    const leftSpace = triggerRect.left;
    let left;
    if (rightSpace >= dialogWidth + margin) left = triggerRect.right + offset;
    else if (leftSpace >= dialogWidth + margin) left = leftSpace - dialogWidth - offset;
    else left = (vw - dialogWidth) / 2;
    let top = Math.max(50, triggerRect.top + (triggerRect.height - dialogHeight) / 2);
    left = Math.max(margin, Math.min(left, vw - dialogWidth - margin));
    top = Math.max(50, Math.min(top, vh - 100));
    this.setPosition({ left, top });
  }

  /**
   * Build a display row from a spell document.
   * @param {object} spell - The spell document
   * @returns {object} Processed spell row
   */
  #processSpell(spell) {
    return {
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img,
      enrichedIcon: createSpellIconLink(spell),
      level: spell.system.level,
      school: formatSpellSchool(spell),
      castingTime: spell.labels?.activation || formatSpellActivation(spell),
      range: spell.labels?.range || `${spell.system.range?.value ?? ''} ${spell.system.range?.units ?? ''}`.trim(),
      duration: spell.labels?.duration || spell.system.duration?.value || '',
      components: formatSpellComponents(spell),
      damage: this.#extractDamageInfo(spell)
    };
  }

  /**
   * Extract damage formula and max-dice for highlight comparison.
   * @param {object} spell - The spell document
   * @returns {object} Damage info { formula, types, maxDice }
   */
  #extractDamageInfo(spell) {
    const info = { formula: '', types: [], maxDice: 0 };
    if (spell.labels?.damages?.length) {
      info.formula = spell.labels.damages
        .map((d) => d.formula || '')
        .filter(Boolean)
        .join(' + ');
      info.types = spell.labels.damages.map((d) => d.damageType).filter(Boolean);
    }
    if (!info.formula && spell.system?.activities) {
      for (const activity of Object.values(spell.system.activities)) {
        if (activity.damage?.parts?.length) {
          info.formula = activity.damage.parts
            .map((p) => p[0])
            .filter(Boolean)
            .join(' + ');
          info.types = activity.damage.parts.map((p) => p[1]).filter(Boolean);
          break;
        }
      }
    }
    if (info.formula) {
      const dice = info.formula.match(/(\d+)d(\d+)/g) || [];
      for (const m of dice) {
        const [, count, size] = m.match(/(\d+)d(\d+)/);
        info.maxDice = Math.max(info.maxDice, parseInt(count, 10) * parseInt(size, 10));
      }
    }
    return info;
  }

  /**
   * Build the comparison table data structure from processed spells.
   * @param {object[]} spells - Processed spell rows
   * @returns {object} { properties, maxDamage }
   */
  #buildComparisonTable(spells) {
    if (!spells.length) return { properties: [] };
    const maxDamage = Math.max(0, ...spells.map((s) => s.damage.maxDice));
    const map = (format) => spells.map((s) => ({ value: format(s), highlight: false }));
    const properties = [
      { name: _loc('DND5E.SpellLevel'), key: 'level', values: map((s) => CONFIG.DND5E.spellLevels[s.level] || s.level) },
      { name: _loc('DND5E.School'), key: 'school', values: map((s) => s.school) },
      { name: _loc('DND5E.SpellCastTime'), key: 'castingTime', values: map((s) => s.castingTime) },
      { name: _loc('DND5E.Range'), key: 'range', values: map((s) => s.range) },
      { name: _loc('DND5E.Duration'), key: 'duration', values: map((s) => s.duration) },
      { name: _loc('DND5E.Components'), key: 'components', values: map((s) => s.components) },
      {
        name: _loc('DND5E.Damage'),
        key: 'damage',
        values: spells.map((s) => ({ value: s.damage.formula || '—', highlight: s.damage.maxDice > 0 && s.damage.maxDice === maxDamage }))
      }
    ];
    return { properties, maxDamage };
  }
}
