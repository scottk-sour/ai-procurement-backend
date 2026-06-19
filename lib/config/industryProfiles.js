export const INDUSTRY_PROFILES = {
  'solicitor': { regulator: 'SRA', regulatorFull: 'Solicitors Regulation Authority', redress: 'Legal Ombudsman', numberField: 'sraNumber', touchesPropertyTax: true, foreign: ['FCA', 'ICAEW', 'Propertymark'] },
  'accountant': { regulator: 'ICAEW', regulatorFull: 'ICAEW or ACCA', redress: null, numberField: 'icaewFirmNumber', touchesPropertyTax: false, foreign: ['SRA', 'FCA', 'Propertymark'] },
  'mortgage-advisor': { regulator: 'FCA', regulatorFull: 'Financial Conduct Authority', redress: 'Financial Ombudsman Service', numberField: 'fcaNumber', touchesPropertyTax: true, foreign: ['SRA', 'ICAEW', 'Propertymark'] },
  'estate-agent': { regulator: 'Propertymark', regulatorFull: 'Propertymark', redress: 'The Property Ombudsman', numberField: 'propertymarkNumber', touchesPropertyTax: true, foreign: ['SRA', 'FCA', 'ICAEW'] },
};

export function profileFor(vendorType) {
  return INDUSTRY_PROFILES[vendorType] || null;
}
