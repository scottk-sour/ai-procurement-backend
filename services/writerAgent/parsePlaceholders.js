const KEYED_PATTERN = /\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|\s*([^\]]+)\]/g;
const LEGACY_PATTERN = /\[FIRM TO PROVIDE[: ]([^\]]*)\]/gi;

export function parseKeyedPlaceholders(content) {
  if (!content || typeof content !== 'string') return [];
  const results = [];
  let match;
  const re = new RegExp(KEYED_PATTERN.source, 'g');
  while ((match = re.exec(content)) !== null) {
    results.push({
      key: match[1].trim(),
      label: match[2].trim(),
      raw: match[0],
      position: match.index,
    });
  }
  return results;
}

export function parseLegacyPlaceholders(content) {
  if (!content || typeof content !== 'string') return [];
  const results = [];
  let match;
  const re = new RegExp(LEGACY_PATTERN.source, 'gi');
  while ((match = re.exec(content)) !== null) {
    results.push({
      key: null,
      label: match[1].trim(),
      raw: match[0],
      position: match.index,
    });
  }
  return results;
}

export function parseAllPlaceholders(content) {
  return [
    ...parseKeyedPlaceholders(content),
    ...parseLegacyPlaceholders(content),
  ];
}

export function countAllPlaceholders(content) {
  return parseAllPlaceholders(content).length;
}
