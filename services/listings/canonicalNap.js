export function getCanonicalNap(vendor) {
  const fd = (key) => vendor.firmData?.get?.(key)?.value || '';
  return {
    name:     fd('canonical_trading_name') || vendor.company || '',
    address:  fd('canonical_address')      || vendor.location?.address || '',
    postcode: fd('canonical_postcode')     || vendor.location?.postcode || '',
    phone:    fd('canonical_phone')        || vendor.contactInfo?.phone || '',
    website:  fd('canonical_website')      || vendor.contactInfo?.website || '',
    phoneConfirmed: !!fd('canonical_phone'),
    nameConfirmed:  !!fd('canonical_trading_name'),
  };
}
