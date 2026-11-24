import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, PackageCheck, RefreshCw, ShoppingBag, Truck } from 'lucide-react';
import { API_V1 } from '../phase5Api.js';
import { createApiRequest } from '../apiRequest.js';
import './storeCheckout.css';

const request = createApiRequest({ apiV1: API_V1, onSessionExpired: () => window.dispatchEvent(new Event('tcare:session-expired')) });
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const labels = { PENDING_PAYMENT:'Awaiting payment', PAYMENT_REVIEW:'Payment review required', PAID:'Paid', PROCESSING:'Processing', SHIPPED:'Shipped', DELIVERED:'Delivered', CANCELLED:'Cancelled', REFUNDED:'Refunded' };
let checkoutScriptPromise;
function loadCheckout() {
  if (typeof window.Razorpay === 'function') return Promise.resolve();
  if (!checkoutScriptPromise) checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    script.onload = () => typeof window.Razorpay === 'function' ? resolve() : reject(new Error('Razorpay Checkout could not be initialized.'));
    script.onerror = () => { checkoutScriptPromise = null; script.remove(); reject(new Error('Razorpay Checkout could not be loaded. Check your connection.')); };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
}

export function StoreCheckoutPage({ cart, authUser }) {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ recipientName: authUser?.fullName || '', recipientPhone: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', customerNote: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [storeAvailability, setStoreAvailability] = React.useState(null);
  const [availabilityError, setAvailabilityError] = React.useState('');
  const [paymentMode, setPaymentMode] = React.useState('CHECKOUT');
  const [checkoutAlreadyStarted, setCheckoutAlreadyStarted] = React.useState(false);
  const [qrPayment, setQrPayment] = React.useState(null);
  const idempotency = React.useRef({ fingerprint: '', key: '' });
  React.useEffect(() => { if (authUser?.fullName) setForm(current => ({ ...current, recipientName: current.recipientName || authUser.fullName })); }, [authUser?.fullName]);
  React.useEffect(() => { let active = true; request('/orders/status').then(result => { if (active) setStoreAvailability(result); }).catch(err => { if (active) setAvailabilityError(err?.message || 'Store checkout availability could not be checked.'); }); return () => { active = false; }; }, []);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    if (!authUser || authUser.role !== 'CUSTOMER') { setError('Sign in with a Customer account to place an order.'); return; }
    if (!cart?.items?.length) { setError('Your cart is empty. Add products before checkout.'); return; }
    const delivery = {
      recipientName: form.recipientName.trim(), recipientPhone: form.recipientPhone.trim(),
      addressLine1: form.addressLine1.trim(), addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim(), state: form.state.trim(), postalCode: form.postalCode.trim(), customerNote: form.customerNote.trim() || null
    };
    const payload = {
      items: cart.items.map(item => ({ productId: item.id, quantity: item.qty })),
      delivery,
      paymentMode
    };
    const fingerprint = JSON.stringify({ items: payload.items, delivery: payload.delivery });
    if (idempotency.current.fingerprint !== fingerprint || !idempotency.current.key) {
      idempotency.current = { fingerprint, key: window.crypto?.randomUUID?.() };
    }
    if (!idempotency.current.key) { setError('Secure checkout setup is not available in this browser.'); return; }
    setBusy(true);
    try {
      const created = await request('/orders/checkout', { method: 'POST', headers: { 'Idempotency-Key': idempotency.current.key }, body: JSON.stringify(payload) });
      if (paymentMode === 'QR') {
        if (!created.qr?.imageUrl || !created.paymentId) throw new Error('Razorpay did not return a valid QR payment session.');
        setQrPayment({ paymentId: created.paymentId, order: created.order, qr: created.qr });
        setNotice('Scan this single-use QR code with a UPI app. Keep this page open and check payment status after completing the payment.');
        setBusy(false);
        return;
      }
      setCheckoutAlreadyStarted(Boolean(created.order?.payment?.checkoutStarted));
      await loadCheckout();
      const checkout = new window.Razorpay({
        key: created.checkout.keyId, amount: created.checkout.amount, currency: created.checkout.currency,
        name: 'T-CARE', description: `Plant Store order ${created.order.orderNumber}`,
        order_id: created.checkout.orderId,
        prefill: { name: form.recipientName.trim(), email: authUser.email, contact: form.recipientPhone.trim() },
        notes: { tcareOrderId: created.order.id, orderNumber: created.order.orderNumber },
        theme: { color: '#2f7650' },
        handler: async response => {
          setNotice('Payment received by Checkout. T-CARE is verifying it with Razorpay…');
          try {
            const verified = await request(`/payments/customer/${encodeURIComponent(created.paymentId)}/verify`, { method: 'POST', body: JSON.stringify({ razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }) });
            const latest = await request(`/orders/customer/${encodeURIComponent(created.order.id)}`);
            if (verified.verified && latest.order?.payment?.status === 'PAID') cart.clear();
            navigate(`/store/orders/${encodeURIComponent(created.order.id)}`, { replace: true });
          } catch (verificationError) {
            setError(verificationError?.message || 'Payment is still being confirmed by Razorpay. Open your order status; do not make another payment yet.');
            navigate(`/store/orders/${encodeURIComponent(created.order.id)}`, { replace: true });
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setNotice('Checkout was closed. Check order status before trying again.'); navigate(`/store/orders/${encodeURIComponent(created.order.id)}`, { replace: true }); } }
      });
      checkout.on('payment.failed', response => {
        setBusy(false);
        setError(response?.error?.description || 'Payment was not completed. Check order status before retrying.');
        navigate(`/store/orders/${encodeURIComponent(created.order.id)}`, { replace: true });
      });
      checkout.open();
    } catch (checkoutError) {
      setError(checkoutError?.message || 'Checkout could not be started. Your cart has been kept.');
      setBusy(false);
    }
  };

  const checkQrPayment = async () => {
    if (!qrPayment?.paymentId || busy) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/payments/customer/${encodeURIComponent(qrPayment.paymentId)}/reconcile`, { method: 'POST', body: '{}' });
      const latest = await request(`/orders/customer/${encodeURIComponent(qrPayment.order.id)}`);
      if (result.payment?.status === 'PAID' && latest.order?.payment?.status === 'PAID') {
        cart.clear();
        navigate(`/store/orders/${encodeURIComponent(qrPayment.order.id)}`, { replace: true });
        return;
      }
      setQrPayment(current => current ? { ...current, order: latest.order, qr: result.payment?.qr || current.qr } : current);
      setNotice(result.payment?.qr?.status === 'EXPIRED' ? 'This QR code has expired. Check the order status before choosing another payment method.' : 'Razorpay has not confirmed payment yet. Do not pay again unless the current QR is closed or expired.');
    } catch (err) { setError(err?.message || 'The QR payment status could not be checked.'); }
    finally { setBusy(false); }
  };

  const cancelQrPayment = async () => {
    if (!qrPayment?.paymentId || busy) return;
    setBusy(true); setError('');
    try {
      await request(`/payments/customer/${encodeURIComponent(qrPayment.paymentId)}/qr/cancel`, { method: 'POST', body: '{}' });
      setQrPayment(null); setPaymentMode('CHECKOUT');
      setNotice('The QR code was closed by Razorpay. You can now use Razorpay Checkout or generate a new QR.');
    } catch (err) { setError(err?.message || 'The QR code could not be cancelled. Check payment status before retrying.'); }
    finally { setBusy(false); }
  };

  const subtotal = cart.items.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
  return <section className="store-checkout-page">
    <div className="store-checkout-top"><Link to="/store"><ArrowLeft size={16}/> Back to Plant Store</Link><span>{storeAvailability?.checkoutEnabled === true ? 'Secure payment · Razorpay' : 'Your cart'}</span></div>
    <div className="store-checkout-grid">
      <div className="store-checkout-main">
        <header><small>T-CARE MARKET</small><h1>Delivery details</h1><p>Enter where you want your plants and gardening products delivered.</p></header>
        {!authUser ? <div className="store-checkout-message"><b>Sign in required</b><p>Please sign in with your Customer account before placing an order.</p><Link to="/login">Sign in to continue</Link></div> : authUser.role !== 'CUSTOMER' ? <div className="store-checkout-message"><b>Customer account required</b><p>Store checkout is available to Customer accounts.</p><Link to="/">Return to T-CARE</Link></div> : null}
        {error && <div className="store-checkout-error" role="alert">{error}</div>}
        {availabilityError && <div className="store-checkout-error" role="alert">{availabilityError}</div>}
        {storeAvailability && !storeAvailability.checkoutEnabled && <div className="store-checkout-notice store-checkout-unavailable" role="status"><b>Online store orders are not available yet</b><p>You can still browse the Plant Store and keep items in your cart. T-CARE has not opened online ordering, so no payment will be requested or taken.</p><Link to="/store">Continue browsing the Plant Store</Link></div>}
        {notice && <div className="store-checkout-notice" role="status">{notice}</div>}
        {authUser?.role === 'CUSTOMER' && <form className="store-address-form" onSubmit={submit} aria-busy={busy}>
          <fieldset className="store-checkout-fields" disabled={busy || Boolean(qrPayment)}>
          <div className="store-form-grid">
            <label>Recipient name<input name="recipientName" required minLength="2" maxLength="100" value={form.recipientName} onChange={update}/></label>
            <label>Phone number<input name="recipientPhone" required minLength="7" maxLength="20" autoComplete="tel" value={form.recipientPhone} onChange={update}/></label>
            <label className="wide">Address line 1<input name="addressLine1" required minLength="4" maxLength="180" autoComplete="address-line1" value={form.addressLine1} onChange={update}/></label>
            <label className="wide">Address line 2 (optional)<input name="addressLine2" maxLength="180" autoComplete="address-line2" value={form.addressLine2} onChange={update}/></label>
            <label>City<input name="city" required minLength="2" maxLength="100" autoComplete="address-level2" value={form.city} onChange={update}/></label>
            <label>State<input name="state" required minLength="2" maxLength="100" autoComplete="address-level1" value={form.state} onChange={update}/></label>
            <label>PIN code<input name="postalCode" required minLength="4" maxLength="12" autoComplete="postal-code" value={form.postalCode} onChange={update}/></label>
            <label className="wide">Delivery note (optional)<textarea name="customerNote" maxLength="1000" rows="3" value={form.customerNote} onChange={update}/></label>
          </div>
          {!qrPayment && <fieldset className="store-payment-methods" disabled={storeAvailability?.checkoutEnabled !== true}>
            <legend>Payment method</legend>
            <label><input type="radio" name="paymentMode" value="CHECKOUT" checked={paymentMode === 'CHECKOUT'} onChange={() => setPaymentMode('CHECKOUT')}/> Razorpay secure checkout</label>
            {storeAvailability?.qrEnabled === true && !checkoutAlreadyStarted && <label><input type="radio" name="paymentMode" value="QR" checked={paymentMode === 'QR'} onChange={() => setPaymentMode('QR')}/> UPI QR code</label>}
          </fieldset>}
          </fieldset>
          {!qrPayment && <button className="store-pay-button" type="submit" disabled={busy || !cart.items.length || storeAvailability?.checkoutEnabled !== true}>{busy ? 'Preparing secure payment…' : paymentMode === 'QR' ? 'Generate UPI QR code' : storeAvailability?.checkoutEnabled === true ? 'Continue to secure payment' : 'Checkout unavailable'}</button>}
          <small className="store-checkout-small">Final prices, stock, tax and shipping are recalculated by T-CARE before the order is created. Your order is confirmed only after the backend verifies payment.</small>
        </form>}
        {qrPayment && <div className="store-qr-panel" aria-live="polite">
          <div><small>RAZORPAY · UPI QR</small><h2>Scan to pay {money(qrPayment.order.total)}</h2><p>Use a UPI app on another device, or open the QR link on a device that can scan it. This code is single-use and expires {new Date(qrPayment.qr.expiresAt).toLocaleString('en-IN')}.</p></div>
          <img src={qrPayment.qr.imageUrl} alt="Razorpay UPI payment QR code" loading="eager"/>
          <a href={qrPayment.qr.shortUrl} target="_blank" rel="noreferrer">Open QR code link</a>
          <div className="store-qr-actions"><button className="store-pay-button" type="button" disabled={busy} onClick={checkQrPayment}>{busy ? 'Checking…' : 'I have paid · Check status'}</button><button className="store-secondary-button" type="button" disabled={busy} onClick={cancelQrPayment}>Close QR code</button></div>
          <small>Order {qrPayment.order.orderNumber}. Payment stays pending until T-CARE verifies it with Razorpay.</small>
        </div>}
      </div>
      <aside className="store-order-summary"><div className="store-summary-heading"><ShoppingBag size={18}/><h2>Your cart</h2><span>{cart.count}</span></div>
        {cart.items.length ? cart.items.map(item => <div className="store-summary-item" key={item.id}><div><b>{item.name}</b><small>Qty {item.qty}</small></div><strong>{money(Number(item.price) * item.qty)}</strong></div>) : <p>Your cart is empty.</p>}
        <div className="store-summary-total"><span>Estimated subtotal</span><b>{money(subtotal)}</b></div>
        <small>Tax and shipping are set by T-CARE and shown in the server-created order before payment.</small>
        <Link to="/store">Continue shopping</Link>
      </aside>
    </div>
  </section>;
}

export function StoreOrderPage({ authUser }) {
  const { id } = useParams();
  const [order, setOrder] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [storeAvailability, setStoreAvailability] = React.useState(null);
  const loadVersion = React.useRef(0);
  const loadController = React.useRef(null);
  const load = React.useCallback(async () => {
    if (!authUser || authUser.role !== 'CUSTOMER') { setLoading(false); return; }
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const result = await request(`/orders/customer/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (version === loadVersion.current) setOrder(result.order);
    } catch (err) {
      if (version === loadVersion.current && err?.name !== 'AbortError') setError(err?.message || 'Could not load this order.');
    } finally {
      if (version === loadVersion.current) { setLoading(false); loadController.current = null; }
    }
  }, [id, authUser?.id, authUser?.role]);
  React.useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; loadController.current?.abort(); loadController.current = null; };
  }, [load]);
  React.useEffect(() => { let active = true; request('/orders/status').then(result => { if (active) setStoreAvailability(result); }).catch(() => {}); return () => { active = false; }; }, []);
  const reconcile = async () => {
    if (!order?.payment?.id || busy) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/payments/customer/${encodeURIComponent(order.payment.id)}/reconcile`, { method: 'POST', body: '{}' });
      setNotice(result.payment?.status === 'PAID' ? 'Payment confirmed by Razorpay.' : 'Payment is still awaiting confirmation. Do not pay again while the QR or payment is pending.');
      await load();
    } catch (err) { setError(err?.message || 'Payment status could not be checked.'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (busy || !window.confirm('Cancel this unpaid order and release its reserved stock?')) return;
    setBusy(true); setError('');
    try { await request(`/orders/customer/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); await load(); }
    catch (err) { setError(err?.message || 'The order could not be cancelled.'); }
    finally { setBusy(false); }
  };
  const startPayment = async paymentMode => {
    if (!order || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request(`/orders/customer/${encodeURIComponent(id)}/payment`, { method: 'POST', body: JSON.stringify({ paymentMode }) });
      if (paymentMode === 'QR') {
        await load();
        setNotice('A new single-use QR code is ready. Payment stays pending until Razorpay confirms it.');
        return;
      }
      await loadCheckout();
      const checkout = new window.Razorpay({
        key: created.checkout.keyId, amount: created.checkout.amount, currency: created.checkout.currency,
        name: 'T-CARE', description: `Plant Store order ${order.orderNumber}`, order_id: created.checkout.orderId,
        handler: async response => {
          try {
            const verified = await request(`/payments/customer/${encodeURIComponent(created.paymentId)}/verify`, { method: 'POST', body: JSON.stringify({ razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }) });
            setNotice(verified.verified ? 'Payment confirmed by Razorpay.' : 'Payment is still being verified. Do not pay again.');
            await load();
          } catch (err) { setError(err?.message || 'Verification is pending. Do not pay again until the status is checked.'); await load(); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setNotice('Checkout was closed. Check the payment status before retrying.'); void load(); } },
        theme: { color: '#2f7650' }
      });
      checkout.on('payment.failed', response => { setError(response?.error?.description || 'Payment was not completed.'); setBusy(false); void load(); });
      checkout.open();
    } catch (err) { setError(err?.message || 'A payment method could not be started.'); setBusy(false); }
    finally { if (paymentMode === 'QR') setBusy(false); }
  };
  const cancelQr = async () => {
    if (!order?.payment?.id || busy) return;
    setBusy(true); setError('');
    try { await request(`/payments/customer/${encodeURIComponent(order.payment.id)}/qr/cancel`, { method: 'POST', body: '{}' }); setNotice('Razorpay confirmed the QR code closure. Choose another payment method when ready.'); await load(); }
    catch (err) { setError(err?.message || 'The QR code could not be closed. Check payment status.'); }
    finally { setBusy(false); }
  };
  if (!authUser || authUser.role !== 'CUSTOMER') return <section className="store-order-page"><div className="store-checkout-message"><b>Sign in required</b><Link to="/login">Sign in to view your order</Link></div></section>;
  return <section className="store-order-page">
    {loading ? <div className="store-order-state" role="status" aria-live="polite" aria-busy="true"><b>Loading order…</b><span className="store-order-skeleton" aria-hidden="true"/></div> : error && !order ? <div className="store-checkout-error" role="alert">{error}<button onClick={load}>Try again</button></div> : order && <>
      <header className="store-order-header"><span className="store-order-icon"><CheckCircle2/></span><small>PLANT STORE ORDER</small><h1>{order.status === 'PAID' || ['PROCESSING','SHIPPED','DELIVERED'].includes(order.status) ? 'Your order is confirmed' : 'Your order status'}</h1><p>Order <b>{order.orderNumber}</b></p></header>
      {error && <div className="store-checkout-error" role="alert">{error}</div>}
      {notice && <div className="store-checkout-notice" role="status">{notice}</div>}
      {order.status === 'PAYMENT_REVIEW' && <div className="store-checkout-error" role="alert">Your payment was captured after the inventory reservation ended. T-CARE needs to review availability before confirming fulfilment. Contact support and do not pay again.</div>}
      {order.status === 'PENDING_PAYMENT' && <div className="store-checkout-notice" role="status">{order.payment?.status === 'AUTHORIZED' ? 'Your payment is authorized and awaiting capture. Do not pay again.' : 'Payment has not yet been confirmed. Check the status below before retrying.'} This order reservation is held until {new Date(order.expiresAt).toLocaleString('en-IN')}.</div>}
      <div className="store-order-grid"><div className="store-order-card"><h2><PackageCheck size={18}/> Items</h2>{order.items.map(item => <div className="store-summary-item" key={item.id}><div><b>{item.name}</b><small>{item.sku} · Qty {item.quantity}</small></div><strong>{money(item.lineTotal)}</strong></div>)}<div className="store-summary-total"><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div className="store-summary-total"><span>Tax ({(order.taxRateBps / 100).toFixed(2)}%)</span><b>{money(order.taxAmount)}</b></div><div className="store-summary-total"><span>Shipping</span><b>{money(order.shippingFee)}</b></div><div className="store-summary-total grand"><span>Total</span><b>{money(order.total)}</b></div></div>
        <div className="store-order-card"><h2><Truck size={18}/> Delivery</h2><p><b>{order.recipientName}</b><br/>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}<br/>{order.address.city}, {order.address.state} {order.address.postalCode}<br/>{order.address.country}<br/>{order.recipientPhone}</p><h3>Order status</h3><strong>{labels[order.status] || order.status}</strong>{order.trackingNumber && <p>Tracking: {order.carrier ? `${order.carrier} · ` : ''}{order.trackingNumber}</p>}{order.payment && <p>Payment: <b>{order.payment.status}</b></p>}
          {order.payment?.qr?.status === 'ACTIVE' && order.payment.status !== 'PAID' && <div className="store-order-qr"><img src={order.payment.qr.imageUrl} alt="Razorpay UPI payment QR code"/><p>Single-use QR expires {new Date(order.payment.qr.expiresAt).toLocaleString('en-IN')}</p><a href={order.payment.qr.shortUrl} target="_blank" rel="noreferrer">Open QR code link</a><button className="store-secondary-button" disabled={busy} onClick={cancelQr}>Close QR code</button></div>}
          {order.payment?.status !== 'PAID' && order.status === 'PENDING_PAYMENT' && <button className="store-secondary-button" disabled={busy} onClick={reconcile}><RefreshCw size={15}/> {busy ? 'Checking…' : 'Check payment status'}</button>}
          {order.status === 'PENDING_PAYMENT' && !['PAID','AUTHORIZED','PARTIALLY_REFUNDED','REFUNDED'].includes(order.payment?.status) && order.payment?.qr?.status !== 'ACTIVE' && <div className="store-order-payment-actions"><button className="store-pay-button" disabled={busy || storeAvailability?.checkoutEnabled !== true} onClick={() => startPayment('CHECKOUT')}>{busy ? 'Starting…' : 'Pay with Razorpay Checkout'}</button>{storeAvailability?.qrEnabled === true && order.payment?.checkoutStarted !== true && <button className="store-secondary-button" disabled={busy} onClick={() => startPayment('QR')}>Generate UPI QR</button>}</div>}
          {order.status === 'PENDING_PAYMENT' && !['PAID','AUTHORIZED','PARTIALLY_REFUNDED','REFUNDED'].includes(order.payment?.status) && <button className="store-cancel-button" disabled={busy} onClick={cancel}>Cancel unpaid order</button>}
        </div></div>
    </>}
    <div className="store-order-bottom"><Link to="/store">Back to Plant Store</Link> · <Link to="/garden">Customer dashboard</Link></div>
  </section>;
}

export function StoreOrdersWorkspacePage({ Shell }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const loadVersion = React.useRef(0);
  const loadController = React.useRef(null);
  const load = React.useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const result = await request('/orders/customer', { signal: controller.signal });
      if (version === loadVersion.current) setData(result);
    } catch (err) {
      if (version === loadVersion.current && err?.name !== 'AbortError') setError(err?.message || 'Could not load your store orders.');
    } finally {
      if (version === loadVersion.current) { setLoading(false); loadController.current = null; }
    }
  }, []);
  React.useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; loadController.current?.abort(); loadController.current = null; };
  }, [load]);
  const orders = data?.orders || [];
  return <Shell title="Store orders" sub="Review purchases, payment status and delivery progress.">
    {loading ? <div className="p5-state p5-loading-state" role="status" aria-live="polite" aria-busy="true"><span className="p5-loading-heading">Loading your orders…</span><span className="p5-loading-skeletons" aria-hidden="true"><i/><i/><i/></span></div> : error ? <div className="p5-state p5-error" role="alert">{error}<button className="p5-button" onClick={load}>Try again</button></div> : !orders.length ? <div className="p5-state"><b>No store orders yet</b><p>Products you purchase from the T-CARE Plant Store will appear here.</p><Link to="/store">Browse Plant Store</Link></div> : <div className="p5-panel"><div className="p5-panel-head"><div><h3>Your orders</h3><p>{orders.length} recent orders</p></div><button className="p5-button ghost" onClick={load}>Refresh</button></div><div className="p5-table-wrap"><table className="p5-table"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><b>{order.orderNumber}</b></td><td>{new Date(order.createdAt).toLocaleDateString('en-IN')}</td><td>{order.items.reduce((n,item)=>n+item.quantity,0)} items</td><td>{money(order.total)}</td><td>{order.payment?.status || '—'}</td><td>{labels[order.status] || order.status}</td><td><Link to={`/store/orders/${encodeURIComponent(order.id)}`}>View order</Link></td></tr>)}</tbody></table></div></div>}
  </Shell>;
}
