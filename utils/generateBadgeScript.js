/**
 * Generate embeddable badge script for vendor websites.
 * Returns a JS IIFE string that creates a TendorAI badge widget.
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
  const bgColor = isVerified ? '#059669' : '#2563eb';
  const hoverBg = isVerified ? '#047857' : '#1d4ed8';
  const label = isVerified ? 'Verified by TendorAI' : 'Listed on TendorAI';
  const hoverLabel = isVerified ? 'AI-Optimised Profile' : 'AI-Visible Profile';

  const schemaSnippet = includeSchema && schemaJson
    ? `var s=document.createElement('script');s.type='application/ld+json';s.textContent=${JSON.stringify(schemaJson)};document.head.appendChild(s);`
    : '';

  const css = `.tdai-badge{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;opacity:0;transition:opacity .3s ease}.tdai-badge.tdai-visible{opacity:1}.tdai-pill{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:24px;background:${bgColor};color:#fff;font-size:13px;font-weight:500;text-decoration:none;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:background .2s ease,transform .1s ease}.tdai-pill:hover{background:${hoverBg};transform:translateY(-1px)}.tdai-pill svg{flex-shrink:0}.tdai-close{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;color:#6b7280;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.1)}.tdai-close:hover{background:#f3f4f6}@media(max-width:480px){.tdai-badge{bottom:12px;right:12px}.tdai-pill{padding:6px 10px;font-size:11px;gap:4px}}`;

  const svgIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  return `(function(){try{if(sessionStorage.getItem('tdai-badge-dismissed'))return;${schemaSnippet}var c=document.createElement('style');c.textContent=${JSON.stringify(css)};document.head.appendChild(c);var d=document.createElement('div');d.className='tdai-badge';d.setAttribute('data-vendor-id',${JSON.stringify(vendorId)});d.setAttribute('data-tendorai-verified',${JSON.stringify(String(isVerified))});d.setAttribute('data-schema-version',${JSON.stringify(schemaVersion)});d.innerHTML='<a class="tdai-pill" href="${profileUrl}" target="_blank" rel="noopener">${svgIcon}<span class="tdai-label">${label}</span></a><div class="tdai-close" title="Dismiss">\\u00d7</div>';d.querySelector('.tdai-close').addEventListener('click',function(e){e.stopPropagation();d.remove();sessionStorage.setItem('tdai-badge-dismissed','1');});var lbl=d.querySelector('.tdai-label'),pill=d.querySelector('.tdai-pill');pill.addEventListener('mouseenter',function(){lbl.textContent=${JSON.stringify(hoverLabel)};});pill.addEventListener('mouseleave',function(){lbl.textContent=${JSON.stringify(label)};});document.body.appendChild(d);setTimeout(function(){d.classList.add('tdai-visible');},300);}catch(e){console.warn('TendorAI Badge:',e);}})();`;
}
