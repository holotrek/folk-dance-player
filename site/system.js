// Runs before the page is drawn (a blocking script in the head), so a Windows visitor never sees the
// Mac download button flash. The stylesheet does the hiding, keyed on this attribute.
if (/windows/i.test(navigator.userAgent)) document.documentElement.dataset.system = 'windows'
