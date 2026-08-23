/**
 * Build the stored key for a spell prepared by a specific class.
 * @param {string} classIdentifier - The class identifier
 * @param {string} spellUuid - The spell UUID
 * @returns {string} The combined key
 */
export function buildClassSpellKey(classIdentifier, spellUuid) {
  return `${classIdentifier}:${spellUuid}`;
}

/**
 * Split a stored key back into its parts.
 * @param {string} key - The combined key
 * @returns {{classIdentifier: string, spellUuid: string}} The decoded parts
 */
export function parseClassSpellKey(key) {
  const [classIdentifier, ...uuidParts] = key.split(':');
  return { classIdentifier, spellUuid: uuidParts.join(':') };
}
