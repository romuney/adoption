// Approved CROSS DATA accent. Embedded once: no network or parent-frame access.
var brandDataURL = __BRAND_DATA__;
function brandEscape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function brandImage(header) {
  return '<img class="pa-next-brand' + (header ? ' pa-next-brand-header' : '') + '" src="' + brandDataURL +
    '" width="' + (header ? '120' : '110') + '" height="' + (header ? '33' : '28') + '" ' +
    (header ? 'alt="CROSS DATA Analytics"' : 'alt="" aria-hidden="true"') + '>';
}
function brandLoading(title, detail) {
  return '<div class="pa-next-loading"><span class="pa-next-loading-message">' + brandEscape(title) + '</span>' +
    (detail ? '<small>' + brandEscape(detail) + '</small>' : '') +
    '<div class="pa-next-progress" aria-hidden="true"><i></i></div>' + brandImage(false) + '</div>';
}
