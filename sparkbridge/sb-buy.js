// Buy buttons: <a class="buy" data-sku="edge" data-qty="1">Buy</a> -> Stripe Checkout via the portal.
(function () {
  var ENDPOINT = 'https://portal.greenguard-usa.com/api/sparkbridge/checkout';
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-sku]');
    if (!a) return;
    ev.preventDefault();
    var sku = a.getAttribute('data-sku');
    var qtyEl = a.getAttribute('data-qty-from') ? document.getElementById(a.getAttribute('data-qty-from')) : null;
    var qty = qtyEl ? parseInt(qtyEl.value, 10) || 1 : parseInt(a.getAttribute('data-qty') || '1', 10);
    var label = a.textContent;
    a.textContent = 'Opening checkout...';
    a.setAttribute('aria-busy', 'true');
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: sku, quantity: qty }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.url) { window.location.href = j.url; return; }
        throw new Error((j && j.error) || 'no url');
      })
      .catch(function () {
        a.textContent = label; a.removeAttribute('aria-busy');
        window.location.href = '/sparkbridge/contact?buy=' + encodeURIComponent(sku);
      });
  });
})();
