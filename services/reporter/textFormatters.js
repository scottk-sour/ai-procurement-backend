const UPPER_SUFFIXES = new Set(['LTD', 'LIMITED', 'LLP', 'LLC', 'PLC', 'CIC', 'UK']);

const SUFFIX_DISPLAY = {
  LTD: 'Ltd',
  LIMITED: 'Limited',
  LLP: 'LLP',
  LLC: 'LLC',
  PLC: 'plc',
  CIC: 'CIC',
  UK: 'UK',
};

export function titleCaseCompanyName(rawName) {
  if (!rawName) return rawName;

  return rawName
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      const upperWord = word.toUpperCase().replace(/[^A-Z]/g, '');
      if (UPPER_SUFFIXES.has(upperWord)) {
        return SUFFIX_DISPLAY[upperWord] || upperWord;
      }
      if (word === '&') return '&';
      if (word === 'and') return 'and';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
