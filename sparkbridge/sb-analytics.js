/* SparkBridge GA4: loads gtag if the page lacks it and reports clicks on
   github.com/greenguard-usa/sparkbridge-releases links as file_download events. */
(function () {
  var GA_ID = 'G-K2R5H2Z23X';
  if (typeof window.gtag !== 'function') {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  var PREFIX = '/greenguard-usa/sparkbridge-releases';

  function classify(asset, tag) {
    var s = (asset + ' ' + tag).toLowerCase();
    if (s.indexOf('broker-extension') !== -1) return 'broker-extension';
    if (s.indexOf('ign83') !== -1) return 'ign83';
    if (s.indexOf('ign81') !== -1) return 'ign81';
    return 'other';
  }

  function onClick(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.hostname !== 'github.com') return;
    var p = u.pathname.replace(/\/+$/, '');
    if (p.indexOf(PREFIX + '/releases') !== 0) return;
    var rest = p.slice((PREFIX + '/releases').length).split('/').filter(Boolean).map(decodeURIComponent);
    var asset = '', tag = '';
    if (rest[0] === 'download' && rest.length >= 3) { tag = rest[1]; asset = rest[rest.length - 1]; }
    else if (rest[0] === 'tag' && rest[1]) { tag = rest[1]; asset = 'release_page'; }
    else if (rest.length === 0 || rest[0] === 'latest') { asset = 'release_page'; }
    else return;
    var dot = asset.lastIndexOf('.');
    var ext = asset !== 'release_page' && dot > 0 ? asset.slice(dot + 1).toLowerCase() : '';
    window.gtag('event', 'file_download', {
      asset_name: asset,
      version_tag: tag,
      product_line: classify(asset, tag),
      file_name: asset,
      file_extension: ext,
      link_url: u.href,
      link_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      transport_type: 'beacon'
    });
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
})();
