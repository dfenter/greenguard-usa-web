/**
 * GreenGuard USA — Cart Logic
 * localStorage key: "gg_cart"
 * Item shape: {id, name, price_cents, price_id, qty}
 */

const CHECKOUT_URL  = 'https://greenguard-agent-tmw2.onrender.com/create-checkout';
const CART_SAVE_URL = 'https://greenguard-agent-tmw2.onrender.com/cart/save';
const CART_KEY      = 'gg_cart';

// ── State ─────────────────────────────────────────────────────────────────────

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  document.dispatchEvent(new CustomEvent('cart-updated', { detail: cart }));
}
function getCount()  { return getCart().reduce((n,i) => n + i.qty, 0); }
function getTotal()  { return getCart().reduce((n,i) => n + i.price_cents * i.qty, 0); }

// ── Mutations ─────────────────────────────────────────────────────────────────

function addToCart(item) {
  const cart = getCart();
  const ex   = cart.find(i => i.id === item.id);
  if (ex) { ex.qty += 1; } else { cart.push({...item, qty:1}); }
  saveCart(cart);
  openCartDrawer();
  _flashBadge();
}
function removeFromCart(id) { saveCart(getCart().filter(i => i.id !== id)); }
function updateQty(id, qty) {
  if (qty <= 0) { removeFromCart(id); return; }
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) { item.qty = qty; saveCart(cart); }
}
function clearCart() { saveCart([]); }

// ── Checkout ──────────────────────────────────────────────────────────────────

async function checkout() {
  const cart = getCart();
  if (!cart.length) return;
  const btn = document.getElementById('gg-checkout-btn');
  if (btn) { btn.textContent = 'Redirecting…'; btn.disabled = true; }
  try {
    const res  = await fetch(CHECKOUT_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ items: cart.map(i=>({price_id:i.price_id,qty:i.qty,name:i.name})) }),
    });
    const data = await res.json();
    if (data.session_id) {
      fetch(CART_SAVE_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({session_id:data.session_id, items:cart}),
      }).catch(()=>{});
    }
    if (data.url) { clearCart(); window.location.href = data.url; }
  } catch(e) {
    alert('Checkout error — please try again.');
    if (btn) { btn.textContent = 'Checkout'; btn.disabled = false; }
  }
}

// ── Drawer UI ─────────────────────────────────────────────────────────────────

function _fmt(cents) { return '$' + (cents/100).toFixed(2); }

function _renderDrawer() {
  const body  = document.getElementById('gg-cart-body');
  const foot  = document.getElementById('gg-cart-footer');
  const total = document.getElementById('gg-cart-total');
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = '<p style="color:rgba(212,230,202,.45);text-align:center;padding:32px 0;font-size:14px">Your cart is empty.</p>';
    if (foot)  foot.style.display  = 'none';
    return;
  }
  if (foot)  foot.style.display  = 'block';
  if (total) total.textContent   = _fmt(getTotal());
  body.innerHTML = cart.map(item => `
    <div style="display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid rgba(122,171,130,.1)">
      <div style="flex:1;min-width:0">
        <div style="color:#fff;font-weight:800;font-size:13px;line-height:1.3">${item.name}</div>
        <div style="color:#c9a84c;font-size:12px;font-weight:700;margin-top:2px">${_fmt(item.price_cents)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:5px">
        <button onclick="updateQty('${item.id}',${item.qty-1})" style="width:25px;height:25px;background:rgba(122,171,130,.12);border:1px solid rgba(122,171,130,.25);border-radius:4px;color:#a8edc0;font-size:14px;cursor:pointer;line-height:1">−</button>
        <span style="color:#fff;font-weight:800;font-size:13px;min-width:16px;text-align:center">${item.qty}</span>
        <button onclick="updateQty('${item.id}',${item.qty+1})" style="width:25px;height:25px;background:rgba(122,171,130,.12);border:1px solid rgba(122,171,130,.25);border-radius:4px;color:#a8edc0;font-size:14px;cursor:pointer;line-height:1">+</button>
      </div>
      <div style="color:#c9a84c;font-weight:800;font-size:13px;min-width:52px;text-align:right">${_fmt(item.price_cents*item.qty)}</div>
      <button onclick="removeFromCart('${item.id}')" style="background:none;border:none;color:rgba(212,230,202,.25);font-size:16px;cursor:pointer;padding:0 4px">×</button>
    </div>
  `).join('');
}

function openCartDrawer() {
  const d = document.getElementById('gg-cart-drawer');
  const o = document.getElementById('gg-cart-overlay');
  if (d) d.style.transform = 'translateX(0)';
  if (o) o.style.display   = 'block';
  _renderDrawer();
}
function closeCartDrawer() {
  const d = document.getElementById('gg-cart-drawer');
  const o = document.getElementById('gg-cart-overlay');
  if (d) d.style.transform = 'translateX(100%)';
  if (o) o.style.display   = 'none';
}

function _flashBadge() {
  const b = document.getElementById('gg-cart-badge');
  if (!b) return;
  b.style.transform = 'scale(1.4)';
  setTimeout(()=>b.style.transform='scale(1)', 200);
}
function _updateBadge() {
  const b = document.getElementById('gg-cart-badge');
  const n = getCount();
  if (!b) return;
  b.textContent    = n;
  b.style.display  = n > 0 ? 'flex' : 'none';
}

document.addEventListener('cart-updated', () => { _updateBadge(); _renderDrawer(); });
window.addEventListener('DOMContentLoaded', () => { _updateBadge(); _renderDrawer(); });
