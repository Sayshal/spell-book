/**
 * Visible Item compendiums that can carry spells and are enabled as Compendium Browser sources.
 * @returns {object[]} The eligible compendium packs
 */
export function getEligibleSpellPacks() {
  return game.packs.filter(
    (pack) =>
      pack.metadata.type === 'Item' &&
      pack.visible &&
      dnd5e.applications.settings.CompendiumBrowserSettingsConfig.isSourceEnabled(pack) &&
      (!pack.metadata.flags.dnd5e?.types || new Set(pack.metadata.flags.dnd5e.types).has('spell'))
  );
}

/**
 * Item compendiums that can carry class or subclass documents.
 * @returns {object[]} The matching compendium packs
 */
export function getClassPacks() {
  return game.packs.filter((pack) => {
    if (pack.metadata.type !== 'Item') return false;
    const types = pack.metadata.flags?.dnd5e?.types;
    if (!types) return true;
    const typeSet = new Set(types);
    return typeSet.has('class') || typeSet.has('subclass');
  });
}

/**
 * Name of the outermost folder a pack sits in, used to group packs by their source module.
 * @param {object} pack - The compendium pack
 * @returns {string|null} The top-level folder name, or null when the pack is unfoldered
 */
export function getPackTopLevelFolderName(pack) {
  if (!pack.folder) return null;
  if (pack.folder.depth === 1) return pack.folder.name;
  return pack.folder.getParentFolders?.().at(-1)?.name ?? pack.folder.name;
}
