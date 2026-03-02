/**
 * Generate embeddable badge script for vendor websites.
 * Returns a JS IIFE string that creates:
 *   1. A floating badge (bottom-right, non-dismissible for Pro)
 *   2. A footer badge (injected into #tendorai-badge if present)
 *
 * @param {Object} options
 * @param {string} options.vendorId - Vendor MongoDB ID
 * @param {string} options.vendorName - Company name
 * @param {string} options.profileUrl - TendorAI profile URL
 * @param {'verified'|'starter'} options.badgeType - Badge tier
 * @param {string} [options.schemaVersion] - Schema version string
 * @param {boolean} [options.includeSchema] - Whether to inject JSON-LD
 * @param {string} [options.schemaJson] - JSON-LD string to inject
 * @returns {string} JavaScript IIFE string
 */
export function generateBadgeScript(options) {
  const {
    vendorId,
    vendorName,
    profileUrl,
    badgeType = 'verified',
    schemaVersion = '1.0',
    includeSchema = false,
    schemaJson = '',
  } = options;

  const isVerified = badgeType === 'verified';
  const currentYear = new Date().getFullYear();

  // --- Colours ---
  const bgColor = isVerified ? '#059669' : '#7c3aed';
  const hoverBg = isVerified ? '#047857' : '#6d28d9';
  const tierPillBg = isVerified ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.2)';

  // --- Labels ---
  const label = isVerified ? 'Verified by TendorAI' : 'AI Visibility Verified';
  const tierLabel = isVerified ? 'Pro' : 'Starter';

  // --- Schema injection snippet (unchanged) ---
  const schemaSnippet = includeSchema && schemaJson
    ? `var s=document.createElement('script');s.type='application/ld+json';s.textContent=${JSON.stringify(schemaJson)};document.head.appendChild(s);`
    : '';

  // --- TendorAI wordmark SVG (shield + T) ---
  const shieldSvg14 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="1.5"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  const shieldSvg20 = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="1.5"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  // --- CSS ---
  const css = [
    // Shared font
    `.tdai-badge,.tdai-footer-badge{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-sizing:border-box}`,
    `.tdai-badge *,.tdai-footer-badge *{box-sizing:border-box}`,

    // ========== FLOATING BADGE ==========
    `.tdai-badge{position:fixed;bottom:20px;right:20px;z-index:99999;opacity:0;transition:opacity .4s ease}`,
    `.tdai-badge.tdai-visible{opacity:1}`,
    // Pill
    `.tdai-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:24px;background:${bgColor};color:#fff;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.15);transition:background .2s ease,transform .15s ease,box-shadow .2s ease;letter-spacing:.01em;line-height:1}`,
    `.tdai-pill:hover{background:${hoverBg};transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.2)}`,
    `.tdai-pill svg{flex-shrink:0}`,
    // Wordmark inside floating pill
    `.tdai-pill .tdai-wm{opacity:.7;font-weight:400;margin-left:2px}`,
    // Close button (Starter only)
    `.tdai-close{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;color:#6b7280;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.1)}`,
    `.tdai-close:hover{background:#f3f4f6}`,
    // Mobile
    `@media(max-width:480px){.tdai-badge{bottom:12px;right:12px}.tdai-pill{padding:6px 12px;font-size:11px;gap:4px}}`,

    // ========== FOOTER BADGE ==========
    `.tdai-footer-badge{display:inline-block}`,
    `.tdai-footer-link{display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:10px;background:#f8f7ff;border:1.5px solid #e9e5f5;color:#1f2937;font-size:16px;font-weight:600;text-decoration:none;transition:border-color .2s ease,box-shadow .2s ease;line-height:1}`,
    `.tdai-footer-link:hover{border-color:#c4b5fd;box-shadow:0 2px 12px rgba(124,58,237,.1)}`,
    // Shield icon area
    `.tdai-footer-shield{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:${bgColor};color:#fff;flex-shrink:0}`,
    // Text block
    `.tdai-footer-text{display:flex;flex-direction:column;gap:2px}`,
    `.tdai-footer-label{font-size:14px;font-weight:600;color:#1f2937;line-height:1.2}`,
    `.tdai-footer-sub{display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;font-weight:400;line-height:1.2}`,
    // Tier pill inside footer badge
    `.tdai-tier{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;line-height:1.5}`,
    `.tdai-tier-pro{background:#059669;color:#fff}`,
    `.tdai-tier-starter{background:#7c3aed;color:#fff}`,
    // Dot separator
    `.tdai-dot{color:#d1d5db}`,
  ].join('');

  // --- Footer badge HTML ---
  const tierPillClass = isVerified ? 'tdai-tier tdai-tier-pro' : 'tdai-tier tdai-tier-starter';
  const footerHtml = [
    `<a class="tdai-footer-link" href="${profileUrl}" target="_blank" rel="noopener">`,
    `<div class="tdai-footer-shield">${shieldSvg20}</div>`,
    `<div class="tdai-footer-text">`,
    `<span class="tdai-footer-label">${label}</span>`,
    `<span class="tdai-footer-sub"><span class="${tierPillClass}">${tierLabel}</span><span class="tdai-dot">&middot;</span>${currentYear}</span>`,
    `</div>`,
    `</a>`,
  ].join('');

  // --- Floating badge HTML ---
  const floatingHtml = [
    `<a class="tdai-pill" href="${profileUrl}" target="_blank" rel="noopener">`,
    shieldSvg14,
    `<span>${isVerified ? 'Verified' : 'AI Verified'}<span class="tdai-wm"> — TendorAI</span></span>`,
    `</a>`,
  ].join('');

  // --- Close button (Starter only — Pro is non-dismissible) ---
  const closeHtml = isVerified ? '' : '<div class="tdai-close" title="Dismiss">\\u00d7</div>';

  // --- Build the IIFE ---
  // For Pro: no sessionStorage check, no close button
  // For Starter: sessionStorage dismiss still works
  const dismissCheck = isVerified ? '' : "if(sessionStorage.getItem('tdai-badge-dismissed'))f=false;";
  const closeBinding = isVerified
    ? ''
    : "var cb=d.querySelector('.tdai-close');if(cb){cb.addEventListener('click',function(e){e.stopPropagation();d.remove();sessionStorage.setItem('tdai-badge-dismissed','1');});}";

  return `(function(){try{${schemaSnippet}var c=document.createElement('style');c.textContent=${JSON.stringify(css)};document.head.appendChild(c);` +
    // --- Footer badge: inject into #tendorai-badge if it exists ---
    `var ft=document.getElementById('tendorai-badge');if(ft){ft.innerHTML='';var fb=document.createElement('div');fb.className='tdai-footer-badge';fb.setAttribute('data-vendor-id',${JSON.stringify(vendorId)});fb.setAttribute('data-tendorai-verified',${JSON.stringify(String(isVerified))});fb.innerHTML=${JSON.stringify(footerHtml)};ft.appendChild(fb);}` +
    // --- Floating badge ---
    `var f=true;${dismissCheck}if(f){var d=document.createElement('div');d.className='tdai-badge';d.setAttribute('data-vendor-id',${JSON.stringify(vendorId)});d.setAttribute('data-tendorai-verified',${JSON.stringify(String(isVerified))});d.setAttribute('data-schema-version',${JSON.stringify(schemaVersion)});d.innerHTML=${JSON.stringify(floatingHtml + closeHtml)};${closeBinding}document.body.appendChild(d);setTimeout(function(){d.classList.add('tdai-visible');},300);}` +
    `}catch(e){console.warn('TendorAI Badge:',e);}})();`;
}
