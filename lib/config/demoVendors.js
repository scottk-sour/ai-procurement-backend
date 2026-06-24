const DEMO_VENDOR_IDS = new Set([
  '699757a97712b4369510e6c8',
]);

export function isDemoFirm(firm) {
  if (!firm) return false;
  if (firm.isDemoVendor === true || firm.isDemoAccount === true) return true;
  const id = String(firm._id || firm.id || '');
  return DEMO_VENDOR_IDS.has(id);
}
