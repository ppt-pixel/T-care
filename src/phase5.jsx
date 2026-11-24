import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { API_V1 } from './phase5Api.js';
import { createApiRequest } from './apiRequest.js';
import { useNotificationFeed, refreshNotificationFeed } from './notificationStore.js';
import './phase5.css';

const request = createApiRequest({
  apiV1: API_V1,
  onSessionExpired: () => window.dispatchEvent(new Event('tcare:session-expired'))
});
const json = value => JSON.stringify(value);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const dateTime = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const dateOnly = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';
const statusLabel = value => String(value || 'UNKNOWN').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
let razorpayCheckoutPromise;
function loadRazorpayCheckout() {
  if (typeof window.Razorpay === 'function') return Promise.resolve();
  if (!razorpayCheckoutPromise) {
    razorpayCheckoutPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        if (typeof window.Razorpay === 'function') resolve();
        else {
          razorpayCheckoutPromise = null;
          reject(new Error('Secure checkout could not be opened. Please try again.'));
        }
      };
      script.onerror = () => {
        razorpayCheckoutPromise = null;
        script.remove();
        reject(new Error('Secure checkout could not be opened. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return razorpayCheckoutPromise;
}
const errorText = error => {
  if (error?.authRefreshFailed) return 'Your session could not be refreshed. Please sign in again.';
  if (Array.isArray(error?.details) && error.details.length) {
    return error.details.map(issue => `${issue.path?.length ? issue.path.join('.') : 'Request'}: ${issue.message}`).join(' ');
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'T-CARE could not be reached. Check your connection and try again.';
  }
  return error?.message || 'We couldn’t complete that request. Please try again.';
};

function Notice({ error, success }) {
  if (!error && !success) return null;
  return <div className={`p5-notice ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} aria-atomic="true">{error || success}</div>;
}
function State({ loading, error, empty, onRetry }) {
  if (loading) return <div className="p5-state p5-loading-state" role="status" aria-live="polite" aria-busy="true">
    <span className="p5-loading-heading"><span className="p5-spinner" aria-hidden="true"/>Loading…</span>
    <span className="p5-loading-skeletons" aria-hidden="true"><i/><i/><i/></span>
  </div>;
  if (error) return <div className="p5-state p5-error" role="alert"><b>Could not load this information</b><p>{error}</p><button className="p5-button" onClick={onRetry}>Try again</button></div>;
  if (empty) return <div className="p5-state" role="status"><b>No records found</b></div>;
  return null;
}
function useLoad(path, fallbackKey, pollMs = 0) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const inFlight = React.useRef(false);
  const pollingPaused = React.useRef(false);
  const controller = React.useRef(null);
  // Each view owns one abortable request. Route changes and explicit refreshes cancel obsolete work,
  // while timer/visibility refreshes never overlap an active request.
  const ticket = React.useRef(0);
  const load = React.useCallback(async ({ silent = false } = {}) => {
    if (silent && (inFlight.current || pollingPaused.current)) return null;
    if (!silent && inFlight.current) controller.current?.abort();
    if (!silent) pollingPaused.current = false;
    const mine = ++ticket.current;
    const ownController = new AbortController();
    controller.current = ownController;
    inFlight.current = true;
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await request(path, { signal: ownController.signal });
      if (mine === ticket.current) setData(result);
      return result;
    } catch (e) {
      if (mine === ticket.current && e?.name !== 'AbortError') {
        setError(errorText(e));
        if ([401, 403].includes(e.status) || e.authRefreshFailed) pollingPaused.current = true;
      }
      return null;
    } finally {
      if (mine === ticket.current) {
        inFlight.current = false;
        controller.current = null;
        setLoading(false);
      }
    }
  }, [path]);
  React.useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load({ silent: true }); };
    const timer = pollMs ? window.setInterval(refresh, pollMs) : 0;
    if (pollMs) document.addEventListener('visibilitychange', refresh);
    return () => {
      ticket.current += 1;
      controller.current?.abort();
      controller.current = null;
      inFlight.current = false;
      if (timer) window.clearInterval(timer);
      if (pollMs) document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, pollMs]);
  return { data, setData, loading, error, load };
}
function PageTitle({ eyebrow = 'T-CARE', title, sub, action }) {
  return <div className="p5-page-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>;
}
export function AccountSecurityPage({ Shell }) {
  const [form,setForm]=React.useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const [error,setError]=React.useState('');
  const [success,setSuccess]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const submit=async event=>{
    event.preventDefault();
    setError('');setSuccess('');
    if(form.newPassword!==form.confirmPassword){setError('The new passwords do not match.');return;}
    setBusy(true);
    try{
      const result=await request('/auth/change-password',{method:'POST',body:json({currentPassword:form.currentPassword,newPassword:form.newPassword})});
      setForm({currentPassword:'',newPassword:'',confirmPassword:''});
      setSuccess(result?.message||'Your password has been changed.');
    }catch(requestError){setError(errorText(requestError));}
    finally{setBusy(false);}
  };
  return <Shell title="Security & password" sub="Update your account password.">
    <Notice error={error} success={success}/>
    <Panel title="Change password" sub="Use at least 12 characters. Changing your password signs out other active sessions.">
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset className="p5-form-lock" disabled={busy}>
        <Field label="Current password"><input required type="password" autoComplete="current-password" maxLength={72} value={form.currentPassword} onChange={event=>update('currentPassword',event.target.value)}/></Field>
        <FormGrid>
          <Field label="New password"><input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.newPassword} onChange={event=>update('newPassword',event.target.value)}/></Field>
          <Field label="Confirm new password"><input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.confirmPassword} onChange={event=>update('confirmPassword',event.target.value)}/></Field>
        </FormGrid>
        <div className="p5-actions"><Button type="submit" disabled={busy}>{busy?'Changing password…':'Change password'}</Button></div>
        </fieldset>
      </form>
    </Panel>
  </Shell>;
}
function Panel({ title, sub, children, action }) {
  return <section className="p5-panel"><div className="p5-panel-head"><div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}
function Pill({ children, tone }) { return <span className={`p5-pill ${tone || ''}`}>{children}</span>; }
function Empty({ title = 'No records yet', text }) { return <div className="p5-empty"><b>{title}</b>{text && <p>{text}</p>}</div>; }
function Field({ label, children, hint }) { return <label className="p5-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Button({ children, onClick, type = 'button', disabled, variant = 'primary' }) { return <button type={type} className={`p5-button ${variant}`} disabled={disabled} onClick={onClick}>{children}</button>; }
function FormGrid({ children }) { return <div className="p5-form-grid">{children}</div>; }
function RecordTable({ headers, children }) { return <div className="p5-table-wrap" role="region" aria-label="Data table; scroll horizontally to view all columns" tabIndex={0}><table className="p5-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export async function uploadToStorage(file, { kind, targetType, targetId }) {
  if (!file) throw new Error('Choose a file first.');
  const intent = await request('/media/upload-intent', { method: 'POST', body: json({ kind, contentType: file.type, sizeBytes: file.size, target: targetType && targetId ? { targetType, targetId } : undefined }) });
  const upload = await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
  if (!upload.ok) throw new Error(`Storage upload failed (${upload.status}). Check the bucket and signed upload URL.`);
  await request(`/media/${intent.asset.id}/complete`, { method: 'POST', body: '{}' });
  return intent.asset;
}

// ---------------- Customer: profile ----------------
export function CustomerProfilePage({ Shell }) {
  const { data, loading, error, load } = useLoad('/customer/profile');
  const user = data?.user;
  const [form, setForm] = React.useState({ fullName: '', phone: '' });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  React.useEffect(() => {
    if (user) setForm({ fullName: user.fullName || '', phone: user.phone || '' });
  }, [user?.id, user?.fullName, user?.phone]);
  const save = async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      await request('/customer/profile', { method: 'PATCH', body: json({ fullName: form.fullName, phone: form.phone || null }) });
      setMessage('Customer profile updated.'); await load();
    } catch (e2) { setMessage(errorText(e2)); }
    finally { setBusy(false); }
  };
  return <Shell title="Your profile" sub="Keep your contact details up to date.">
    <Notice error={error || (message && /failed|cannot|invalid|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found/i.test(message) ? message : ''}/>
    <State loading={loading} error={error} onRetry={load}/>
    {user && <>
      <Panel title="Account verification">
        <div className="p5-metrics"><div><small>Account status</small><b>{statusLabel(user.status)}</b></div><div><small>Email verification</small><b>{user.emailVerifiedAt ? 'Verified' : 'Unverified'}</b></div><div><small>Account type</small><b>{statusLabel(user.role)}</b></div></div>
        <p>{user.emailVerifiedAt ? 'Your email address is verified.' : 'Verify your email address to secure your T-CARE account.'}</p>
      </Panel>
      <Panel title="Personal information" sub="Your registered email address cannot be changed here.">
        <form onSubmit={save}>
          <FormGrid>
            <Field label="Full name"><input required minLength="2" maxLength="120" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })}/></Field>
            <Field label="Email address"><input value={user.email || ''} readOnly/></Field>
            <Field label="Phone number"><input maxLength="30" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></Field>
          </FormGrid>
          <Button type="submit" disabled={busy || !form.fullName.trim()}>{busy ? 'Saving…' : 'Save profile'}</Button>
        </form>
      </Panel>
    </>}
  </Shell>;
}

// ---------------- Customer: dashboard, services, plants, addresses, booking lifecycle ----------------
export function CustomerDashboardPage({ Shell }) {
  const plantsState = useLoad('/customer/plants', null, 30000);
  const bookingsState = useLoad('/bookings', null, 30000);
  const notificationFeed = useNotificationFeed();
  const subscriptionsState = useLoad('/subscriptions/customer', null, 30000);
  const plants = plantsState.data?.plants || [];
  const bookings = bookingsState.data?.bookings || [];
  const notifications = notificationFeed.items || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const currentSubscription = subscriptions.find(item => ['ACTIVE', 'PENDING', 'PAUSED'].includes(item.status));
  const upcoming = bookings.filter(b => !['SERVICE_COMPLETED', 'CANCELLED'].includes(b.status)).slice(0, 3);
  const loading = plantsState.loading || bookingsState.loading || subscriptionsState.loading;
  const error = plantsState.error || bookingsState.error || subscriptionsState.error;
  const load = () => Promise.all([plantsState.load(), bookingsState.load(), subscriptionsState.load(), refreshNotificationFeed({ force: true })]);
  return <Shell title="Your garden today" sub="Your plants, visits and latest updates.">
    <div className="p5-metrics"><div><small>Plants in your care</small><b>{loading ? '—' : plants.length}</b></div><div><small>Upcoming bookings</small><b>{loading ? '—' : upcoming.length}</b></div><div><small>Notifications</small><b>{loading ? '—' : notificationFeed.unreadCount ?? notifications.filter(n => !n.readAt).length} unread</b></div><div><small>Subscription</small><b>{loading ? '—' : currentSubscription ? statusLabel(currentSubscription.status) : 'No plan'}</b></div></div>
    <Notice error={error}/><State loading={loading} error={error} onRetry={load}/>
    {!loading && !error && <div className="p5-columns">
      <Panel title="Upcoming visits" action={<Link to="/garden/visits">All visits →</Link>}>
        {upcoming.length ? upcoming.map(b => <Link className="p5-list-row" key={b.id} to={`/garden/visits/${b.id}`}><div><b>{b.service?.name || 'T-CARE service'}</b><small>{b.reference} · {dateTime(b.scheduledStart)}</small></div><Pill>{statusLabel(b.status)}</Pill><strong>{money(b.total)}</strong></Link>) : <Empty title="No upcoming visits" text="Book a service to get your plant care on the calendar."/>}
      </Panel>
      <Panel title="Your plants" action={<Link to="/garden/plants">View plants →</Link>}>
        {plants.slice(0, 5).map(p => <Link className="p5-list-row" key={p.id} to={`/garden/plants/${p.id}`}><div><b>{p.name}</b><small>{p.type || 'Plant'} · {statusLabel(p.healthStatus)}</small></div><Pill>{p.nextCareAt ? dateOnly(p.nextCareAt) : 'No care date'}</Pill></Link>)}
        {!plants.length && <Empty title="No plants added yet" text="Add a plant to keep its care details here."/>}
      </Panel>
      <Panel title="Your subscription" sub="Your current plan and renewal date." action={<Link to="/garden/plan">Manage plans →</Link>}>
        {currentSubscription ? <div className="p5-list-row"><div><b>{currentSubscription.plan?.name || 'T-CARE plan'}</b><small>{currentSubscription.plan?.billingCycle} · {currentSubscription.renewsAt ? `Renews ${dateOnly(currentSubscription.renewsAt)}` : currentSubscription.status === 'PENDING' ? 'Payment verification pending' : 'No renewal date recorded'}</small></div><Pill tone={currentSubscription.status === 'ACTIVE' ? 'success' : currentSubscription.status === 'PENDING' ? 'warning' : ''}>{statusLabel(currentSubscription.status)}</Pill></div> : <Empty title="No active plan" text="Browse available subscription plans to choose ongoing plant-care support."/>}
      </Panel>
    </div>}
  </Shell>;
}

export function CustomerServicesPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/services');
  const popularState = useLoad('/services/popular?range=30d', null, 60000);
  const [category, setCategory] = React.useState('All');
  const all = data?.services || [];
  const popular = popularState.data?.services || [];
  const categories = ['All', ...new Set(all.map(s => s.category).filter(Boolean))];
  const visible = all.filter(s => category === 'All' || s.category === category);
  const top = popular[0];
  return <Shell title="Services" sub="Explore available plant-care services and their prices.">
    {top && <Panel title="Most booked in the past 30 days">
      <div className="p5-popular-service"><div><Pill tone="success">Most booked</Pill><h3>{top.name}</h3><p>{top.description}</p><small>{top.bookingCount} bookings in the selected period</small></div><div className="p5-popular-action"><b>{(top.prices || []).length ? `From ${money(top.prices[0].amount)}` : 'Price on request'}</b><Link className="p5-button primary" to="/garden/book">Book this service</Link></div></div>
    </Panel>}
    <div className="p5-toolbar">{categories.map(c => <button key={c} className={`p5-filter ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <State loading={loading} error={error} empty={!all.length && !loading && !error} onRetry={load}/>
    <Notice error={popularState.error}/>
    <div className="p5-card-grid">{visible.map(s => <article className="p5-card" key={s.id}><div className="p5-card-top"><Pill>{s.category}</Pill><Pill tone="success">{statusLabel(s.status)}</Pill></div><h3>{s.name}</h3><p>{s.description}</p><div className="p5-card-meta"><span>{s.durationLabel}</span>{s.durationMinutes ? <span>{s.durationMinutes} min</span> : null}</div><div className="p5-price-list">{(s.prices || []).length ? s.prices.map(p => <div key={p.id}><span>{p.minPlants || 1}{p.maxPlants ? `–${p.maxPlants}` : '+'} plants</span><b>{money(p.amount)}</b></div>) : <small>No currently applicable price. Contact T-CARE before booking.</small>}</div><Link className="p5-button primary" to="/garden/book">Book this service</Link></article>)}</div>
  </Shell>;
}


export function CustomerAddressesPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/customer/addresses');
  const addresses = data?.addresses || [];
  const emptyForm = { label: '', type: 'HOME', line1: '', line2: '', city: '', state: '', postalCode: '', latitude: '', longitude: '', isDefault: false };
  const [form, setForm] = React.useState(emptyForm);
  const [editing, setEditing] = React.useState(null);
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const open = address => {
    setEditing(address || null);
    setForm(address ? {
      label: address.label || '', type: address.type || 'HOME', line1: address.line1 || '', line2: address.line2 || '',
      city: address.city || '', state: address.state || '', postalCode: address.postalCode || '',
      latitude: address.latitude == null ? '' : String(address.latitude), longitude: address.longitude == null ? '' : String(address.longitude),
      isDefault: Boolean(address.isDefault)
    } : { ...emptyForm });
    setShowForm(true); setFormError(''); setMessage('');
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setFormError(''); setMessage('');
    try {
      const payload = { ...form };
      if (String(payload.latitude).trim() === '') delete payload.latitude; else payload.latitude = Number(payload.latitude);
      if (String(payload.longitude).trim() === '') delete payload.longitude; else payload.longitude = Number(payload.longitude);
      if ((payload.latitude !== undefined && !Number.isFinite(payload.latitude)) || (payload.longitude !== undefined && !Number.isFinite(payload.longitude))) throw new Error('Latitude and longitude must be valid numbers.');
      await request(editing ? `/customer/addresses/${editing.id}` : '/customer/addresses', { method: editing ? 'PATCH' : 'POST', body: json(payload) });
      setShowForm(false); setEditing(null); setForm({ ...emptyForm }); setMessage(editing ? 'Address updated.' : 'Address saved.'); await load();
    } catch (e2) { setFormError(errorText(e2)); } finally { setBusy(false); }
  };
  const remove = async address => {
    if (!window.confirm(`Delete the ${address.label} address?`)) return;
    setBusy(true); setMessage('');
    try { await request(`/customer/addresses/${address.id}`, { method: 'DELETE' }); setMessage('Address deleted.'); await load(); }
    catch (e) { setFormError(errorText(e)); } finally { setBusy(false); }
  };
  const makeDefault = async address => {
    if (address.isDefault) return;
    setBusy(true); setMessage('');
    try { await request(`/customer/addresses/${address.id}`, { method: 'PATCH', body: json({ isDefault: true }) }); setMessage(`${address.label} is now your default address.`); await load(); }
    catch (e) { setFormError(errorText(e)); } finally { setBusy(false); }
  };
  return <Shell title="My addresses" sub="Manage the saved locations used when you schedule T-CARE visits." action={<Button onClick={() => open(null)}>＋ Add address</Button>}>
    <Notice error={formError || error} success={message}/>
    {showForm && <Panel title={editing ? 'Edit address' : 'Add a new address'} sub="Add the location where you’d like visits.">
      <form onSubmit={save}>
        <FormGrid>
          <Field label="Address label"><input required maxLength="80" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Home, office, etc."/></Field>
          <Field label="Address type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="HOME">Home</option><option value="OFFICE">Office</option><option value="OTHER">Other</option></select></Field>
          <Field label="Address line 1"><input required maxLength="200" value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })}/></Field>
          <Field label="Address line 2"><input maxLength="200" value={form.line2} onChange={e => setForm({ ...form, line2: e.target.value })}/></Field>
          <Field label="City"><input required maxLength="80" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}/></Field>
          <Field label="State"><input required maxLength="80" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}/></Field>
          <Field label="Postal code"><input required minLength="3" maxLength="20" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })}/></Field>
          <Field label="Latitude (optional)"><input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })}/></Field>
          <Field label="Longitude (optional)"><input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })}/></Field>
        </FormGrid>
        <label className="p5-checkbox"><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })}/> Use as my default booking address</label>
        <div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</Button><Button variant="ghost" disabled={busy} onClick={() => { setShowForm(false); setEditing(null); setFormError(''); }}>Cancel</Button></div>
      </form>
    </Panel>}
    <State loading={loading} error={error} empty={!addresses.length && !loading && !error} onRetry={load}/>
    {!loading && !error && <div className="p5-card-grid">{addresses.map(address => <Panel key={address.id} title={address.label} sub={`${statusLabel(address.type)} · ${address.city}, ${address.state}`} action={address.isDefault ? <Pill tone="success">Default</Pill> : null}>
      <p>{address.line1}{address.line2 ? `, ${address.line2}` : ''}<br/>{address.city}, {address.state} {address.postalCode}</p>
      {(address.latitude != null || address.longitude != null) && <small>Coordinates: {address.latitude ?? '—'}, {address.longitude ?? '—'}</small>}
      <div className="p5-actions"><Button variant="ghost" disabled={busy} onClick={() => open(address)}>Edit</Button>{!address.isDefault && <Button variant="ghost" disabled={busy} onClick={() => makeDefault(address)}>Make default</Button>}<Button variant="danger" disabled={busy} onClick={() => remove(address)}>Delete</Button></div>
    </Panel>)}</div>}
  </Shell>;
}

export function CustomerPlantsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/customer/plants', null, 30000);
  const [showForm, setShowForm] = React.useState(false); const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState({ name: '', type: '', locationInHome: '', notes: '', nextCareAt: '', healthStatus: 'HEALTHY' });
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState(''); const [formError, setFormError] = React.useState('');
  const plants = data?.plants || [];
  const open = plant => { setEditing(plant || null); setForm(plant ? { name: plant.name, type: plant.type || '', locationInHome: plant.locationInHome || '', notes: plant.notes || '', nextCareAt: plant.nextCareAt ? new Date(plant.nextCareAt).toISOString().slice(0, 10) : '', healthStatus: plant.healthStatus || 'HEALTHY' } : { name: '', type: '', locationInHome: '', notes: '', nextCareAt: '', healthStatus: 'HEALTHY' }); setShowForm(true); setFormError(''); };
  const save = async e => { e.preventDefault(); setBusy(true); setFormError(''); setMessage(''); try { const body = { ...form, nextCareAt: form.nextCareAt ? new Date(`${form.nextCareAt}T12:00:00`).toISOString() : undefined }; await request(editing ? `/customer/plants/${editing.id}` : '/customer/plants', { method: editing ? 'PATCH' : 'POST', body: json(body) }); setShowForm(false); setMessage(editing ? 'Plant updated.' : 'Plant added to your collection.'); await load(); } catch (e2) { setFormError(errorText(e2)); } finally { setBusy(false); } };
  const remove = async plant => {
    if (busy || !window.confirm(`Delete ${plant.name} from your collection?`)) return;
    setBusy(true); setFormError('');
    try { await request(`/customer/plants/${plant.id}`, { method: 'DELETE' }); setMessage('Plant removed.'); await load(); }
    catch (e) { setFormError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <Shell title="My plants" sub="Keep plant details, care dates and notes together." action={<Button onClick={() => open(null)}>＋ Add plant</Button>}>
    <Notice error={formError || error} success={message}/><State loading={loading} error={error} onRetry={load}/>
    {showForm && <Panel title={editing ? 'Edit plant' : 'Add a plant'}><form onSubmit={save}><FormGrid>
      <Field label="Plant name"><input required minLength="1" maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
      <Field label="Type / species"><input maxLength="120" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}/></Field>
      <Field label="Location in home"><input maxLength="160" value={form.locationInHome} onChange={e => setForm({ ...form, locationInHome: e.target.value })}/></Field>
      <Field label="Current plant health"><select value={form.healthStatus} onChange={e => setForm({ ...form, healthStatus: e.target.value })}>{['EXCELLENT','HEALTHY','NEEDS_ATTENTION','CRITICAL'].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></Field>
      <Field label="Next care date"><input type="date" value={form.nextCareAt} onChange={e => setForm({ ...form, nextCareAt: e.target.value })}/></Field>
      <Field label="Care notes"><textarea maxLength="2000" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field>
    </FormGrid><div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save plant'}</Button><Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div></form></Panel>}
    {!loading && !error && <div className="p5-card-grid">{plants.map(p => <article className="p5-card" key={p.id}><div className="p5-card-top"><Pill>{statusLabel(p.healthStatus)}</Pill><small>{p.type || 'Plant'}</small></div><h3>{p.name}</h3><p>{p.locationInHome || 'Location not specified'}</p><p>{p.notes || 'No care notes yet.'}</p><div className="p5-card-meta"><span>Next care: {dateOnly(p.nextCareAt)}</span><span>{(p.photos || []).length} photos</span></div><div className="p5-actions"><Link className="p5-button primary" to={`/garden/plants/${p.id}`}>View plant</Link><Button variant="ghost" onClick={() => open(p)}>Edit</Button><Button variant="danger" onClick={() => remove(p)}>Delete</Button></div></article>)}{!plants.length && <Empty title="No plants added yet" text="Add your first plant to start a care record."/>}</div>}
  </Shell>;
}

export function CustomerPlantDetailPage({ Shell }) {
  const { id } = useParams();
  const { data, loading, error, load } = useLoad(`/customer/plants/${id}`, null, 30000);
  const [healthForm, setHealthForm] = React.useState({ healthStatus: 'HEALTHY', notes: '', nextCareAt: '' });
  const [savingHealth, setSavingHealth] = React.useState(false);
  const [uploading, setUploading] = React.useState(false); const [message, setMessage] = React.useState('');
  const plant = data?.plant;
  React.useEffect(() => {
    if (plant) setHealthForm({ healthStatus: plant.healthStatus || 'HEALTHY', notes: plant.notes || '', nextCareAt: plant.nextCareAt ? new Date(plant.nextCareAt).toISOString().slice(0, 10) : '' });
  }, [plant?.id, plant?.healthStatus, plant?.notes, plant?.nextCareAt]);
  const saveHealth = async e => {
    e.preventDefault(); setSavingHealth(true); setMessage('');
    try {
      await request(`/customer/plants/${plant.id}`, { method: 'PATCH', body: json({ healthStatus: healthForm.healthStatus, notes: healthForm.notes, nextCareAt: healthForm.nextCareAt ? new Date(`${healthForm.nextCareAt}T12:00:00`).toISOString() : null }) });
      setMessage('Plant care update saved. The assigned Gardener will be notified if this plant is part of an active visit.');
      await load();
    } catch (e2) { setMessage(errorText(e2)); }
    finally { setSavingHealth(false); }
  };
  const addPhoto = async e => {
    const file = e.target.files?.[0]; if (!file || !plant) return;
    setUploading(true); setMessage('');
    try {
      const asset = await uploadToStorage(file, { kind: 'PLANT_PHOTO', targetType: 'PLANT', targetId: plant.id });
      await request(`/customer/plants/${plant.id}/photos`, { method: 'POST', body: json({ objectKey: asset.objectKey, altText: file.name }) });
      setMessage('Photo uploaded and linked to this plant.'); await load();
    } catch (e2) { setMessage(errorText(e2)); } finally { setUploading(false); e.target.value = ''; }
  };
  const removePhoto = async photo => { if (uploading || !window.confirm('Delete this plant photo?')) return; setUploading(true); try { await request(`/customer/plants/${plant.id}/photos/${photo.id}`, { method: 'DELETE' }); setMessage('Plant photo deleted.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setUploading(false); } };
  return <Shell title={plant?.name || 'Plant record'} sub="Details, photos and care history for this plant." action={<Link className="p5-button ghost" to="/garden/plants">Back to plants</Link>}>
    <Notice error={error || (message && /failed|error|invalid|cannot|not found|denied|required/i.test(message) ? message : '')} success={message && !/failed|error|invalid|cannot|not found|denied|required/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {plant && <><div className="p5-metrics"><div><small>Health</small><b>{statusLabel(plant.healthStatus)}</b></div><div><small>Next care</small><b>{dateOnly(plant.nextCareAt)}</b></div><div><small>Photos</small><b>{plant.photos?.length || 0}</b></div></div>
      <Panel title="Plant details" sub={`${plant.type || 'Type not specified'} · ${plant.locationInHome || 'Location not specified'}`} action={<label className="p5-button primary">{uploading ? 'Uploading…' : 'Upload photo'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={addPhoto} disabled={uploading}/></label>}><p>{plant.notes || 'No notes have been added.'}</p></Panel>
      <Panel title="Update plant health" sub="The assigned Gardener can see this update if the plant is part of an active visit.">
        <form onSubmit={saveHealth} aria-busy={savingHealth}><fieldset className="p5-form-lock" disabled={savingHealth}><FormGrid>
          <Field label="Plant health"><select value={healthForm.healthStatus} onChange={e => setHealthForm({ ...healthForm, healthStatus: e.target.value })}>{['EXCELLENT','HEALTHY','NEEDS_ATTENTION','CRITICAL'].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></Field>
          <Field label="Next care date"><input type="date" value={healthForm.nextCareAt} onChange={e => setHealthForm({ ...healthForm, nextCareAt: e.target.value })}/></Field>
        </FormGrid>
        <Field label="Current observations / notes"><textarea maxLength="2000" value={healthForm.notes} onChange={e => setHealthForm({ ...healthForm, notes: e.target.value })} placeholder="Describe yellow leaves, watering concerns, pests or recent changes."/></Field>
        <Button type="submit" disabled={savingHealth}>{savingHealth ? 'Saving report…' : 'Save health update'}</Button></fieldset></form>
      </Panel>
      <Panel title="Photos" sub="">{plant.photos?.length ? <div className="p5-photo-grid">{plant.photos.map(photo => <div key={photo.id}><img src={photo.url || ''} alt={photo.altText || plant.name} onError={e => { e.currentTarget.style.display = 'none'; }}/><small>{photo.altText || 'Plant photo'} · {dateOnly(photo.createdAt)}</small>{photo.mediaAssetId && <Button variant="danger" disabled={uploading} onClick={() => removePhoto(photo)}>Delete photo</Button>}</div>)}</div> : <Empty title="No plant photos" text="Upload a JPG, PNG or WebP image up to 10 MB."/>}</Panel>
      <Panel title="Care history" sub="">{plant.careRecords?.length ? <div className="p5-record-list">{plant.careRecords.map(r => <div key={r.id}><b>{r.title}</b><p>{r.notes || 'No notes recorded.'}</p><small>{dateTime(r.recordedAt)}{r.nextCareAt ? ` · Next care ${dateOnly(r.nextCareAt)}` : ''}</small></div>)}</div> : <Empty title="No care history yet"/>}</Panel>
    </>}
  </Shell>;
}

export function CustomerBookingCreatePage({ Shell }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [services, setServices] = React.useState([]), [plants, setPlants] = React.useState([]), [addresses, setAddresses] = React.useState([]);
  const [plans, setPlans] = React.useState([]), [subscriptions, setSubscriptions] = React.useState([]);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [success, setSuccess] = React.useState('');
  const [selectedPlanId, setSelectedPlanId] = React.useState(searchParams.get('planId') || '');
  const [serviceId, setServiceId] = React.useState(''), [plantIds, setPlantIds] = React.useState([]), [addressId, setAddressId] = React.useState(''), [scheduledStart, setScheduledStart] = React.useState(''), [specialInstructions, setSpecialInstructions] = React.useState('');
  const [showAddress, setShowAddress] = React.useState(false), [address, setAddress] = React.useState({ label: 'Home', type: 'HOME', line1: '', line2: '', city: '', state: '', postalCode: '', isDefault: true });
  const [bookingStep, setBookingStep] = React.useState(0), [stepError, setStepError] = React.useState('');
  const bookingIdempotencyKey = React.useRef(null);
  const loadVersion = React.useRef(0);
  const loadController = React.useRef(null);
  const stepHeadingRef = React.useRef(null);
  const load = React.useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const options = { signal: controller.signal };
      const [serviceResult, plantResult, addressResult, planResult, subscriptionResult] = await Promise.all([
        request('/services', options), request('/customer/plants', options), request('/customer/addresses', options), request('/subscriptions/plans', options), request('/subscriptions/customer', options)
      ]);
      if (version !== loadVersion.current) return;
      setServices(serviceResult.services || []);
      setPlants(plantResult.plants || []);
      setAddresses(addressResult.addresses || []);
      setPlans(planResult.plans || []);
      setSubscriptions(subscriptionResult.subscriptions || []);
    } catch (loadError) {
      if (version === loadVersion.current && loadError?.name !== 'AbortError') setError(errorText(loadError));
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        loadController.current = null;
      }
    }
  }, []);
  React.useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; loadController.current?.abort(); loadController.current = null; };
  }, [load]);
  React.useEffect(() => { if (!addressId && addresses.length) setAddressId(addresses.find(a => a.isDefault)?.id || addresses[0].id); }, [addresses, addressId]);

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || null;
  const availablePlans = plans.filter(plan => plan.planType !== 'LEGACY_RECURRING');
  const includedServiceIds = selectedPlan?.includedServiceIds || [];
  const serviceOptions = selectedPlan ? services.filter(service => includedServiceIds.includes(service.id)) : services;
  React.useEffect(() => {
    if (!serviceOptions.some(service => service.id === serviceId)) setServiceId(serviceOptions[0]?.id || '');
  }, [serviceOptions, serviceId]);
  const selectedService = serviceOptions.find(service => service.id === serviceId);
  const selectedAddress = addresses.find(item => item.id === addressId);
  const selectedPlants = plants.filter(item => plantIds.includes(item.id));
  const selectedPlanSubscription = selectedPlan?.autoRenew
    ? subscriptions.find(item => item.planId === selectedPlan.id && item.visitsAvailable > 0 && ['ACTIVE', 'PAUSED', 'PENDING', 'CANCELLED', 'EXPIRED'].includes(item.status))
    : null;
  const currentVisitCredit = selectedPlanSubscription?.visitCredits?.find(credit => credit.current && credit.visitsAvailable > 0) || null;
  const selectedPrice = selectedPlan?.planType === 'ONE_TIME_SERVICE'
    ? { amount: selectedPlan.price }
    : selectedPlan?.autoRenew
      ? { amount: 0 }
      : (selectedService?.prices || [])
        .filter(p => (p.minPlants == null || plantIds.length >= p.minPlants) && (p.maxPlants == null || plantIds.length <= p.maxPlants))
        .sort((a, b) => {
          const minA = a.minPlants == null ? Number.NEGATIVE_INFINITY : a.minPlants;
          const minB = b.minPlants == null ? Number.NEGATIVE_INFINITY : b.minPlants;
          return minB - minA || new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
        })[0];
  const planPlantLimitExceeded = Boolean(selectedPlan?.plantLimit && plantIds.length > selectedPlan.plantLimit);
  const noRecurringCredit = Boolean(selectedPlan?.autoRenew && !currentVisitCredit);
  const isPlanReady = !selectedPlan || (selectedPlan.bookingReady && (selectedPlan.planType === 'ONE_TIME_SERVICE' || Boolean(currentVisitCredit)));
  const minDateTime = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const stepNames = ['Plan & service', 'Your plants', 'Visit details', 'Review'];

  React.useEffect(() => {
    if (bookingStep > 0) {
      const heading = stepHeadingRef.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }, [bookingStep]);

  const createAddress = async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError(''); setStepError('');
    try {
      const result = await request('/customer/addresses', { method: 'POST', body: json(address) });
      setAddresses(current => [result.address, ...current]); setAddressId(result.address.id); setShowAddress(false); setSuccess('Your address has been saved and selected for this visit.');
      setAddress({ label: 'Home', type: 'HOME', line1: '', line2: '', city: '', state: '', postalCode: '', isDefault: false });
    } catch (e2) { setError(errorText(e2)); }
    finally { setBusy(false); }
  };

  const continueStep = () => {
    setStepError('');
    if (bookingStep === 0) {
      if (selectedPlan && !selectedPlan.bookingReady) { setStepError('This plan is not ready for new bookings. Choose another option or contact T-CARE support.'); return; }
      if (selectedPlan?.autoRenew && !currentVisitCredit) { setStepError('This subscription has no available visit credit yet. Activate UPI AutoPay and complete the first-period payment before continuing.'); return; }
      if (!serviceOptions.length) { setStepError('No service is currently available for this option. Choose another plan or contact T-CARE support.'); return; }
      if (!serviceId || !serviceOptions.some(service => service.id === serviceId)) { setStepError('Choose the service you would like the Gardener to provide.'); return; }
    }
    if (bookingStep === 1) {
      if (!plants.length) { setStepError('Add at least one plant to your account before booking a visit.'); return; }
      if (!plantIds.length) { setStepError('Select at least one plant that needs care.'); return; }
      if (planPlantLimitExceeded) { setStepError(`This plan covers up to ${selectedPlan.plantLimit} plants per visit. Remove a plant to continue.`); return; }
    }
    if (bookingStep === 2) {
      if (!scheduledStart) { setStepError('Choose a date and time for your visit.'); return; }
      if (scheduledStart < minDateTime) { setStepError('Choose a visit time at least one hour from now.'); return; }
      if (!addressId || !selectedAddress) { setStepError('Choose a saved service address or add a new one.'); return; }
    }
    setBookingStep(current => Math.min(3, current + 1));
  };
  const goBackStep = () => { setStepError(''); setBookingStep(current => Math.max(0, current - 1)); };
  const choosePlan = value => { setSelectedPlanId(value); setPlantIds([]); setStepError(''); };

  const submit = async e => {
    e.preventDefault(); if (busy) return;
    if (bookingStep < 3) { continueStep(); return; }
    if (!serviceId || !plantIds.length || !addressId || !scheduledStart || !isPlanReady || planPlantLimitExceeded || noRecurringCredit) {
      setStepError('A required booking detail is missing. Review the highlighted step before submitting.');
      setBookingStep(!serviceId ? 0 : !plantIds.length || planPlantLimitExceeded ? 1 : !scheduledStart || !addressId ? 2 : 0);
      return;
    }
    setBusy(true); setError(''); setSuccess(''); setStepError('');
    const body = {
      serviceId,
      plantIds,
      addressId,
      scheduledStart: new Date(scheduledStart).toISOString(),
      specialInstructions,
      ...(selectedPlan && selectedPlan.planType === 'ONE_TIME_SERVICE' ? { subscriptionPlanId: selectedPlan.id } : {}),
      ...(selectedPlan?.autoRenew && selectedPlanSubscription ? { subscriptionPlanId: selectedPlan.id, subscriptionId: selectedPlanSubscription.id } : {})
    };
    try {
      const storageKey = 'tcare:booking:create-idempotency:v2';
      const fingerprint = JSON.stringify(body);
      let saved = null;
      try { saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
      if (!bookingIdempotencyKey.current || bookingIdempotencyKey.current.fingerprint !== fingerprint) {
        const key = saved?.fingerprint === fingerprint ? saved.key : window.crypto?.randomUUID?.();
        if (!key) throw new Error('Secure booking submission is unavailable in this browser.');
        bookingIdempotencyKey.current = { key, fingerprint };
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(bookingIdempotencyKey.current)); } catch { /* In-memory idempotency remains active for this form. */ }
      }
      const result = await request('/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': bookingIdempotencyKey.current.key },
        body: json(body)
      });
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Ignore unavailable session storage. */ }
      bookingIdempotencyKey.current = null;
      nav(`/garden/visits/${result.booking.id}`, { replace: true });
    } catch (submitError) {
      setError(errorText(submitError));
      if (submitError?.code === 'IDEMPOTENCY_KEY_REUSED') setSuccess('A previous booking request may already have been submitted. Check your visits before creating another.');
    } finally { setBusy(false); }
  };

  return <Shell title="Book a service" sub="Arrange a visit for your plants in four simple steps.">
    <Notice error={error} success={success}/><State loading={loading} error={error} onRetry={load}/>
    {!loading && <form className="p5-panel" onSubmit={submit} aria-busy={busy}>
      <fieldset className="p5-form-lock" disabled={busy}>
      <div className="p5-booking-wizard">
        <PageTitle eyebrow="YOUR VISIT" title="Let's plan your plant-care visit" sub="Choose what your plants need, then tell us when and where to visit."/>

        <nav className="p5-booking-steps" aria-label="Booking progress">
          {stepNames.map((name, index) => <button key={name} type="button" className={`p5-booking-step ${bookingStep === index ? 'is-current' : ''} ${bookingStep > index ? 'is-complete' : ''}`} aria-current={bookingStep === index ? 'step' : undefined} disabled={index > bookingStep} onClick={() => { setStepError(''); setBookingStep(index); }}>
            <span className="p5-booking-step-number">{bookingStep > index ? '✓' : index + 1}</span>
            <span className="p5-booking-step-copy"><b>{name}</b><small>{['Select how to pay', 'Choose what needs care', 'Set the time and location', 'Check everything'][index]}</small></span>
          </button>)}
        </nav>

        {stepError && <div className="p5-booking-step-error" role="alert">{stepError}</div>}

        <section className="p5-booking-step-content" aria-labelledby="booking-step-heading">
          {bookingStep === 0 && <>
            <div className="p5-booking-step-heading"><span>STEP 1 OF 4</span><h3 id="booking-step-heading" ref={stepHeadingRef} tabIndex="-1">Choose your service option</h3><p>Start with a one-time visit or choose a plan that suits your ongoing plant care.</p></div>
            <div className="p5-booking-choice-grid" role="radiogroup" aria-label="Plan or payment option">
              <label className={`p5-booking-option-card ${selectedPlanId === '' ? 'is-selected' : ''}`}>
                <input type="radio" name="bookingPlan" value="" checked={selectedPlanId === ''} onChange={() => choosePlan('')}/>
                <span className="p5-booking-radio-mark" aria-hidden="true"/>
                <span className="p5-booking-option-copy"><b>Pay per service</b><small>Book individual visits without a subscription.</small><strong>Pay for each visit</strong></span>
                <span className="p5-booking-option-tag">Flexible</span>
              </label>
              {availablePlans.map(plan => <label key={plan.id} className={`p5-booking-option-card ${selectedPlanId === plan.id ? 'is-selected' : ''}`}>
                <input type="radio" name="bookingPlan" value={plan.id} checked={selectedPlanId === plan.id} onChange={() => choosePlan(plan.id)}/>
                <span className="p5-booking-radio-mark" aria-hidden="true"/>
                <span className="p5-booking-option-copy"><b>{plan.name}</b><small>{plan.planTypeLabel || (plan.autoRenew ? 'Recurring care plan' : 'One-time service plan')} · {plan.billingCycle}</small><strong>{money(plan.price)} <em>/ {plan.billingCycle}</em></strong></span>
                <span className="p5-booking-option-tag">{plan.autoRenew ? 'Subscription' : 'One-time'}</span>
              </label>)}
            </div>

            {selectedPlan && <div className="p5-booking-selected-plan"><PlanDetails plan={selectedPlan}/></div>}
            {selectedPlan && !selectedPlan.bookingReady && <div className="p5-booking-callout is-warning" role="status"><b>This plan is not ready for new bookings yet.</b><span>Please choose another option or contact T-CARE support for help.</span></div>}
            {noRecurringCredit && <div className="p5-booking-callout is-warning"><b>Your subscription visit is not available yet.</b><span>Complete UPI AutoPay authorisation and the first-period payment to receive visit credits.</span><Link to="/garden/plan">Review and activate your subscription →</Link></div>}

            <div className="p5-booking-subheading"><div><h4>Choose a service</h4><p>Select the kind of care you would like us to provide.</p></div></div>
            {serviceOptions.length ? <div className="p5-booking-service-grid" role="radiogroup" aria-label="Available services">
              {serviceOptions.map(service => <label key={service.id} className={`p5-booking-service-card ${serviceId === service.id ? 'is-selected' : ''}`}>
                <input type="radio" name="bookingService" value={service.id} checked={serviceId === service.id} onChange={() => { setServiceId(service.id); setStepError(''); }}/>
                <span className="p5-booking-radio-mark" aria-hidden="true"/>
                <span className="p5-booking-service-copy"><b>{service.name}</b><small>{service.description || 'Professional plant-care service'}</small></span>
                <span className="p5-booking-service-duration">{service.durationLabel}</span>
              </label>)}
            </div> : <div className="p5-booking-empty"><b>No matching services are available</b><p>Choose another plan or contact T-CARE support. Your selection will not be submitted until a service is available.</p></div>}
          </>}

          {bookingStep === 1 && <>
            <div className="p5-booking-step-heading"><span>STEP 2 OF 4</span><h3 id="booking-step-heading" ref={stepHeadingRef} tabIndex="-1">Which plants need care?</h3><p>Select every plant you would like the Gardener to look after during this visit.</p></div>
            <div className="p5-booking-selection-count"><div><strong>{plantIds.length}</strong><span>{plantIds.length === 1 ? 'plant selected' : 'plants selected'}</span></div>{selectedPlan?.plantLimit ? <small>Plan allowance: up to {selectedPlan.plantLimit} {selectedPlan.plantLimit === 1 ? 'plant' : 'plants'} per visit</small> : <small>Select one or more plants for this visit.</small>}</div>
            {plants.length ? <div className="p5-booking-plant-grid">{plants.map(plant => {
              const checked = plantIds.includes(plant.id);
              const lockedByLimit = Boolean(selectedPlan?.plantLimit && plantIds.length >= selectedPlan.plantLimit && !checked);
              return <label key={plant.id} className={`p5-booking-plant-card ${checked ? 'is-selected' : ''} ${lockedByLimit ? 'is-disabled' : ''}`}>
                <input type="checkbox" checked={checked} disabled={lockedByLimit} onChange={event => { setPlantIds(current => event.target.checked ? [...current, plant.id] : current.filter(id => id !== plant.id)); setStepError(''); }}/>
                <span className="p5-booking-checkbox-mark" aria-hidden="true">{checked ? '✓' : ''}</span>
                <span className="p5-booking-plant-copy"><b>{plant.name}</b><small>{plant.type || 'Plant'}</small><em>{statusLabel(plant.healthStatus || 'HEALTHY')}</em></span>
                <span className="p5-booking-plant-action">{checked ? 'Selected' : lockedByLimit ? 'Plan limit reached' : 'Add plant'}</span>
              </label>;
            })}</div> : <div className="p5-booking-empty"><b>Your plant list is empty</b><p>Add a plant in a new tab, then refresh this list. Your booking selections will stay open here.</p><div className="p5-actions"><Link className="p5-button primary" to="/garden/plants" target="_blank" rel="noreferrer">Open Plants in a new tab</Link><Button variant="ghost" onClick={load}>Refresh plant list</Button></div></div>}
            {planPlantLimitExceeded && <div className="p5-booking-callout is-warning">This plan covers up to {selectedPlan.plantLimit} plants per visit. Remove a selection to continue.</div>}
          </>}

          {bookingStep === 2 && <>
            <div className="p5-booking-step-heading"><span>STEP 3 OF 4</span><h3 id="booking-step-heading" ref={stepHeadingRef} tabIndex="-1">When and where should we visit?</h3><p>Choose a convenient time and the address where your plants are located.</p></div>
            <div className="p5-booking-visit-layout">
              <Field label="Visit date and time" hint="Choose a time at least one hour from now. Times are shown in your local time zone."><input className="p5-booking-large-input" required type="datetime-local" value={scheduledStart} onChange={e => { setScheduledStart(e.target.value); setStepError(''); }} min={minDateTime}/></Field>
              {selectedPlan?.autoRenew && selectedPlan.minimumVisitIntervalDays && <div className="p5-booking-callout">Subscription visits must be at least {selectedPlan.minimumVisitIntervalDays} days apart and completed before the current paid period ends.</div>}
              <div className="p5-booking-subheading"><div><h4>Service address</h4><p>Where should your Gardener arrive?</p></div><Button variant="ghost" onClick={() => setShowAddress(value => !value)}>{showAddress ? 'Close address form' : '+ Add new address'}</Button></div>
              {addresses.length ? <div className="p5-booking-address-grid" role="radiogroup" aria-label="Saved service addresses">{addresses.map(item => <label className={`p5-booking-address-card ${addressId === item.id ? 'is-selected' : ''}`} key={item.id}>
                <input type="radio" name="address" checked={addressId === item.id} onChange={() => { setAddressId(item.id); setStepError(''); }}/>
                <span className="p5-booking-radio-mark" aria-hidden="true"/>
                <span><b>{item.label} {item.isDefault ? <em>Default</em> : null}</b><small>{[item.line1, item.line2, item.city, item.state, item.postalCode].filter(Boolean).join(', ')}</small></span>
              </label>)}</div> : <div className="p5-booking-empty"><b>No saved address yet</b><p>Add the address where you would like your Gardener to visit.</p></div>}
              {showAddress && <div className="p5-address-editor p5-booking-address-editor"><div className="p5-booking-subheading"><div><h4>Add a service address</h4><p>Save this address to your Customer account for future bookings.</p></div></div><FormGrid><Field label="Address name"><input required maxLength="80" value={address.label} onChange={e => setAddress({ ...address, label: e.target.value })} placeholder="Home, Office or Garden"/></Field><Field label="Address type"><select value={address.type} onChange={e => setAddress({ ...address, type: e.target.value })}><option value="HOME">Home</option><option value="OFFICE">Office</option><option value="OTHER">Other</option></select></Field><Field label="Address line 1"><input required maxLength="180" value={address.line1} onChange={e => setAddress({ ...address, line1: e.target.value })} placeholder="House number, street and area"/></Field><Field label="Address line 2 (optional)"><input maxLength="180" value={address.line2} onChange={e => setAddress({ ...address, line2: e.target.value })} placeholder="Apartment, landmark or nearby details"/></Field><Field label="City"><input required maxLength="100" value={address.city} onChange={e => setAddress({ ...address, city: e.target.value })}/></Field><Field label="State"><input required maxLength="100" value={address.state} onChange={e => setAddress({ ...address, state: e.target.value })}/></Field><Field label="PIN code"><input required inputMode="numeric" maxLength="12" value={address.postalCode} onChange={e => setAddress({ ...address, postalCode: e.target.value })}/></Field></FormGrid><div className="p5-actions"><Button onClick={createAddress} disabled={busy || !address.label.trim() || !address.line1.trim() || !address.city.trim() || !address.state.trim() || !address.postalCode.trim()}>{busy ? 'Saving address…' : 'Save and use this address'}</Button><Button variant="ghost" onClick={() => setShowAddress(false)}>Cancel</Button></div></div>}
              <Field label="Anything the Gardener should know?" hint="Optional — mention access instructions, plant-care concerns or areas that need attention."><textarea className="p5-booking-large-input" rows="4" maxLength="2000" value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="For example: Please call when you arrive, or pay special attention to the balcony plants."/></Field>
            </div>
          </>}

          {bookingStep === 3 && <>
            <div className="p5-booking-step-heading"><span>STEP 4 OF 4</span><h3 id="booking-step-heading" ref={stepHeadingRef} tabIndex="-1">Review your visit details</h3><p>Make sure everything is correct. You can go back to change any selection.</p></div>
            <section className="p5-booking-review p5-booking-review-large" aria-labelledby="booking-review-title">
              <div className="p5-booking-review-intro"><div><span>YOUR BOOKING SUMMARY</span><h4 id="booking-review-title">Your plant-care visit</h4></div><strong>{selectedPlan?.autoRenew ? 'Subscription visit' : selectedPlan?.planType === 'ONE_TIME_SERVICE' ? 'One-time service' : 'Pay per service'}</strong></div>
              <dl>
                <div><dt>Plan or payment option</dt><dd>{selectedPlan?.name || 'Pay per service'}</dd></div>
                <div><dt>Service</dt><dd>{selectedService?.name || 'Choose a service'}</dd></div>
                <div><dt>Plants ({selectedPlants.length})</dt><dd>{selectedPlants.length ? selectedPlants.map(plant => plant.name).join(', ') : 'No plants selected'}</dd></div>
                <div><dt>Visit date and time</dt><dd>{scheduledStart ? new Date(scheduledStart).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) : 'Choose a date and time'}</dd></div>
                <div><dt>Service address</dt><dd>{selectedAddress ? <>{selectedAddress.label} · {[selectedAddress.line1, selectedAddress.line2, selectedAddress.city, selectedAddress.state, selectedAddress.postalCode].filter(Boolean).join(', ')}</> : 'Choose or add an address'}</dd></div>
                <div><dt>Special instructions</dt><dd>{specialInstructions.trim() || 'None added'}</dd></div>
              </dl>
              <div className="p5-booking-total"><span>{selectedPlan?.autoRenew ? 'Visit payment' : 'Estimated amount for this visit'}</span><strong>{selectedPlan?.autoRenew ? 'Covered by your paid subscription' : selectedPrice ? money(selectedPrice.amount) : 'Price to be confirmed'}</strong></div>
              {!selectedPlan?.autoRenew && !selectedPrice && <p className="p5-booking-price-note">The final service price depends on the plant count and applicable service pricing. T-CARE will show the payable amount before payment.</p>}
            </section>
            {noRecurringCredit && <div className="p5-booking-callout is-warning"><b>Your subscription does not have a usable visit credit yet.</b><span>Activate UPI AutoPay and complete the first-period payment before booking with this plan.</span><Link to="/garden/plan">Review subscription →</Link></div>}
            <p className="p5-booking-policy">Submitting creates your booking request. It does not charge a recurring subscription again. Subscription visits use one credit from your current paid period; unused visits expire at period end. One-Time Service plans are paid through the existing Razorpay booking checkout.</p>
          </>}
        </section>

        <div className="p5-booking-controls">
          <div className="p5-booking-controls-summary"><b>{selectedService?.name || 'Choose a service'}</b><span>{plantIds.length} {plantIds.length === 1 ? 'plant' : 'plants'} selected</span>{selectedPrice && !selectedPlan?.autoRenew && <strong>{money(selectedPrice.amount)}</strong>}</div>
          <div className="p5-booking-controls-actions">
            {bookingStep > 0 && <Button variant="ghost" onClick={goBackStep}>← Back</Button>}
            {bookingStep < 3
              ? <Button onClick={continueStep}>Continue <span aria-hidden="true">→</span></Button>
              : <Button type="submit" disabled={busy || !serviceId || !plantIds.length || !addressId || !scheduledStart || !isPlanReady || planPlantLimitExceeded || noRecurringCredit}>{busy ? 'Submitting your request…' : 'Confirm booking request'}</Button>}
          </div>
        </div>
      </div>
      </fieldset>
    </form>}
  </Shell>;
}

function PlanDetails({ plan }) {
  const services = plan?.includedServices || [];
  const benefits = plan?.benefits || [];
  const limitations = plan?.limitations || [];
  return <div className="p5-plan-details">
    <div className="p5-plan-detail-line"><b>Plan type</b><span>{plan.planTypeLabel || statusLabel(plan.planType)}</span></div>
    <div className="p5-plan-detail-line"><b>Service frequency</b><span>{plan.serviceFrequency || 'Not specified yet'}</span></div>
    <div className="p5-plan-detail-line"><b>Included visits</b><span>{plan.includedVisitsPerPeriod ?? 'Not configured'} {plan.includedVisitsPerPeriod === 1 ? 'visit' : 'visits'} per {plan.billingCycle}</span></div>
    {plan.autoRenew && <div className="p5-plan-detail-line"><b>Minimum gap between visits</b><span>{plan.minimumVisitIntervalDays ? `${plan.minimumVisitIntervalDays} days` : 'Not configured'}</span></div>}
    {plan.autoRenew && <div className="p5-plan-detail-line"><b>Maximum renewals</b><span>{Number(plan.maxRenewalCycles ?? 0)} after the first paid period ({Number(plan.maxRenewalCycles ?? 0) + 1} total billing cycles)</span></div>}
    <div className="p5-plan-detail-line"><b>Plant limit</b><span>{plan.plantLimit ? `Up to ${plan.plantLimit} plants` : 'No stated plant limit'}</span></div>
    <div className="p5-plan-detail-group"><b>Included services</b>
      {services.length ? <ul>{services.map(service => <li key={service.id}><b>{service.name}{service.status === 'INACTIVE' ? ' (currently unavailable)' : ''}</b><small>{[service.durationLabel, service.description].filter(Boolean).join(' · ')}</small></li>)}</ul> : <small>No included services have been configured.</small>}
    </div>
    {benefits.length > 0 && <div className="p5-plan-detail-group"><b>Benefits</b><ul>{benefits.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
    {limitations.length > 0 && <div className="p5-plan-detail-group"><b>Limitations</b><ul>{limitations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
    {plan.autoRenew && <p className="p5-plan-renewal-note">Automatic renewal is intended through UPI AutoPay after you approve the mandate. You can cancel the mandate in your UPI app to stop future renewals. Services already paid for remain available until the paid-through date.</p>}
    {plan.planType === 'ONE_TIME_SERVICE' && <p className="p5-plan-renewal-note">One-time service. It does not renew automatically.</p>}
    {plan.planType === 'LEGACY_RECURRING' && <p className="p5-plan-renewal-note">This is an existing legacy plan. Its recurring payment method must be reviewed before it is offered for new automatic-renewal purchases.</p>}
    {plan.autoRenew && !plan.upiAutopayEligible && <p className="p5-plan-warning">This plan exceeds the current UPI AutoPay per-charge limit and cannot be offered through UPI AutoPay at this price.</p>}
  </div>;
}

export function CustomerSubscriptionsPage({ Shell }) {
  const nav = useNavigate();
  const plansState = useLoad('/subscriptions/plans', null, 60000);
  const subscriptionsState = useLoad('/subscriptions/customer', null, 30000);
  const plans = plansState.data?.plans || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const error = plansState.error || subscriptionsState.error;
  const [checkoutBusy, setCheckoutBusy] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const load = () => Promise.all([plansState.load(), subscriptionsState.load()]);
  const choosePlan = async plan => {
    setNotice('');
    setActionError('');
    if (!plan.bookingReady) {
      setActionError('This plan is not ready for purchase. Please contact T-CARE support.');
      return;
    }
    if (plan.planType === 'ONE_TIME_SERVICE') {
      nav(`/garden/book?planId=${encodeURIComponent(plan.id)}`);
      return;
    }
    if (!plan.autoRenew || !plan.autoPayCheckoutEnabled) {
      setActionError('UPI AutoPay checkout is not enabled for this T-CARE deployment yet. You can review the plan details, but cannot start a mandate right now.');
      return;
    }
    if (!window.crypto?.randomUUID) {
      setActionError('Secure mandate setup is unavailable in this browser. Update your browser and try again.');
      return;
    }
    setCheckoutBusy(plan.id);
    try {
      const idempotencyKey = `sub-${window.crypto.randomUUID()}`;
      const setup = await request('/subscriptions/customer', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: json({ planId: plan.id })
      });
      await loadRazorpayCheckout();
      let completed = false;
      const finish = async (message, isError = false) => {
        if (completed) return;
        completed = true;
        setCheckoutBusy('');
        if (isError) setActionError(message); else setNotice(message);
        await load();
      };
      const instance = new window.Razorpay({
        key: setup.checkout.keyId,
        subscription_id: setup.checkout.subscriptionId,
        name: 'T-CARE',
        description: `${plan.name} · UPI AutoPay`,
        handler: async response => {
          try {
            const verified = await request(`/subscriptions/customer/${encodeURIComponent(setup.subscription.id)}/verify`, {
              method: 'POST',
              body: json({
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySubscriptionId: response.razorpay_subscription_id,
                razorpaySignature: response.razorpay_signature
              })
            });
            await finish(verified.message || 'Your UPI AutoPay mandate response was verified. Visit credits will appear after the first plan payment is captured.');
          } catch (verifyError) {
            await finish(`${errorText(verifyError)} Do not create another mandate. Refresh your subscription history and contact support if the status remains uncertain.`, true);
          }
        },
        modal: { ondismiss: () => { void finish('Checkout was closed. If you approved the mandate in your UPI app, refresh your subscription history before trying again.'); } },
        theme: { color: '#91b75d' }
      });
      instance.on('payment.failed', event => {
        void finish(event?.error?.description || 'UPI AutoPay authorisation was not completed. Check your UPI app before trying again.', true);
      });
      instance.open();
      setNotice('Approve the UPI AutoPay mandate in your payment app. The plan becomes usable only after T-CARE receives a verified first-period payment.');
    } catch (checkoutError) {
      setActionError(errorText(checkoutError));
      setCheckoutBusy('');
    }
  };
  return <Shell title="Subscription plans" sub="Compare included visits, eligible services, price and renewal terms before choosing a plan.">
    <Notice error={error || actionError} success={notice}/>
    <Panel title="Your subscription history" sub="Paid visit credits are shown for their billing period only. Unused visits expire at period end. Cancel UPI AutoPay in your payment app to stop future renewals.">
      <State loading={subscriptionsState.loading} error={subscriptionsState.error} empty={!subscriptions.length && !subscriptionsState.loading && !subscriptionsState.error} onRetry={subscriptionsState.load}/>
      {subscriptions.map(item => <div className="p5-subscription-row" key={item.id}>
        <div>
          <b>{item.plan?.name || 'T-CARE plan'}</b>
          <small>{item.plan?.planTypeLabel || statusLabel(item.plan?.planType)} · {item.plan?.billingCycle} · {item.plan?.plantLimit ? `${item.plan.plantLimit} plant limit` : 'No stated plant limit'}</small>
          <small>Requested {dateOnly(item.createdAt)} · {item.startedAt ? `Started ${dateOnly(item.startedAt)}` : 'Not started'}</small>
          {item.paidThroughAt && <small>{item.status === 'CANCELLED' || item.cancelAtPeriodEnd ? 'Paid benefits available until' : 'Paid through'} {dateOnly(item.paidThroughAt)}</small>}
          {item.visitsAvailable > 0 && <small>{item.visitsAvailable} visit{item.visitsAvailable === 1 ? '' : 's'} remaining in the current paid period · Expires {dateOnly(item.visitCredits?.find(credit => credit.current)?.periodEnd)}</small>}
          {item.plan?.autoRenew && <small>{item.providerSubscriptionStatus ? `Razorpay mandate: ${statusLabel(item.providerSubscriptionStatus)}` : 'UPI AutoPay mandate status pending'}</small>}
          {item.status === 'CANCELLED' && <small>Future renewals have stopped. Any remaining paid-period visits expire on the paid-through date.</small>}
        </div>
        <div className="p5-subscription-actions"><Pill tone={item.status === 'ACTIVE' ? 'success' : item.status === 'PENDING' ? 'warning' : ''}>{statusLabel(item.status)}</Pill>
          {item.status === 'PENDING' && <small>{item.mandateAuthorizedAt ? 'Mandate authorised; waiting for the first captured plan payment.' : 'Awaiting UPI AutoPay mandate authorisation.'}</small>}
          {item.status === 'ACTIVE' && item.plan?.autoRenew && <small>Manage mandate in your UPI app.</small>}
          {item.status === 'PAUSED' && <small>Future billing is paused. Existing paid-period credits expire normally.</small>}
        </div>
      </div>)}
    </Panel>
    <Panel title="Available plans" sub="All plan details and prices come from the same Admin-managed catalogue used on the public Plans page.">
      <State loading={plansState.loading} error={plansState.error} empty={!plans.length && !plansState.loading && !plansState.error} onRetry={plansState.load}/>
      <div className="p5-subscription-grid">{plans.filter(plan => plan.planType !== 'LEGACY_RECURRING').map(plan => <article className="p5-subscription-card" key={plan.id}>
        <div className="p5-plan-card-top"><Pill tone={plan.autoRenew ? 'success' : ''}>{plan.planTypeLabel || statusLabel(plan.planType)}</Pill>{plan.autoRenew && <small>Auto-renewal</small>}</div>
        <h3>{plan.name}</h3><div className="p5-plan-price">{money(plan.price)} <small>/ {plan.billingCycle}</small></div>
        {plan.description && <p>{plan.description}</p>}
        <PlanDetails plan={plan}/>
        <Button onClick={() => choosePlan(plan)} disabled={checkoutBusy !== '' || !plan.bookingReady || (plan.autoRenew && !plan.autoPayCheckoutEnabled)}>{checkoutBusy === plan.id ? 'Opening secure checkout…' : plan.planType === 'ONE_TIME_SERVICE' ? 'Book this one-time plan' : plan.autoPayCheckoutEnabled ? 'Start UPI AutoPay' : 'AutoPay not enabled'}</Button>
        {!plan.bookingReady && <small className="p5-plan-warning">This plan is not fully configured by Admin yet.</small>}
      </article>)}</div>
    </Panel>
    <div className="p5-actions"><Button variant="ghost" onClick={load}>Refresh plans and subscriptions</Button></div>
  </Shell>;
}

export function CustomerBookingsPage({ Shell }) {
  const [filter, setFilter] = React.useState('All');
  const { data, loading, error, load } = useLoad('/bookings', null, 30000); const all = data?.bookings || [];
  const filters = ['All', 'Upcoming', 'Completed', 'Cancelled'];
  const visible = all.filter(b => filter === 'All' || filter === 'Upcoming' && !['SERVICE_COMPLETED', 'CANCELLED'].includes(b.status) || filter === 'Completed' && b.status === 'SERVICE_COMPLETED' || filter === 'Cancelled' && b.status === 'CANCELLED');
  return <Shell title="My visits" sub="Visit times, status updates and service reports." action={<Link className="p5-button primary" to="/garden/book">Book a service</Link>}>
    <div className="p5-toolbar">{filters.map(f => <button className={`p5-filter ${filter === f ? 'active' : ''}`} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div>
    <State loading={loading} error={error} empty={!visible.length && !loading && !error} onRetry={load}/>
    {!loading && !error && <div className="p5-record-list">{visible.map(b => <Link to={`/garden/visits/${b.id}`} className="p5-booking-row" key={b.id}><div><small>{b.reference} · {dateTime(b.scheduledStart)}</small><h3>{b.service?.name}</h3><p>{b.plants?.map(x => x.plant?.name).filter(Boolean).join(', ')}</p><small>{b.address?.label}: {b.address?.line1}, {b.address?.city}</small></div><div className="p5-right"><Pill>{statusLabel(b.status)}</Pill><b>{money(b.total)}</b><span>Open record →</span></div></Link>)}</div>}
  </Shell>;
}

export function CustomerBookingDetailPage({ Shell }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, error, load } = useLoad(`/bookings/${id}`, null, 30000);
  const { data: paymentAvailability, error: paymentAvailabilityError } = useLoad('/payments/customer/availability', null);
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState(''), [review, setReview] = React.useState({ rating: 5, comment: '' }), [issue, setIssue] = React.useState({ subject: '', description: '' });
  const booking = data?.booking;
  const isPlanCovered = Boolean(booking?.subscriptionVisitCreditId || booking?.subscriptionPlanId && booking?.total === 0);
  const canPay = !isPlanCovered && Number(booking?.total || 0) > 0 && booking?.status !== 'CANCELLED' && !['AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(booking?.payment?.status);
  const cancel = async () => { if (busy || !window.confirm('Cancel this booking?')) return; setBusy(true); setMessage(''); try { await request(`/bookings/${id}/cancel`, { method: 'POST', body: '{}' }); setMessage('Booking cancelled.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  const startBookingPayment = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const idempotencyKey = window.crypto?.randomUUID?.();
      if (!idempotencyKey) throw new Error('Secure payment setup is not available in this browser.');
      const { payment, checkout } = await request(`/payments/customer/booking/${encodeURIComponent(id)}/order`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: '{}'
      });
      await loadRazorpayCheckout();
      let returnHandled = false;
      const openPaymentReturn = outcome => {
        if (returnHandled) return;
        returnHandled = true;
        nav(`/garden/payments/return/${encodeURIComponent(payment.id)}?outcome=${encodeURIComponent(outcome)}`, { replace: true });
      };
      const instance = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: 'T-CARE',
        description: `Booking ${booking.reference}`,
        order_id: checkout.orderId,
        handler: async result => {
          try {
            const verification = await request(`/payments/customer/${encodeURIComponent(payment.id)}/verify`, {
              method: 'POST',
              body: json({
                razorpayOrderId: result.razorpay_order_id,
                razorpayPaymentId: result.razorpay_payment_id,
                razorpaySignature: result.razorpay_signature
              })
            });
            openPaymentReturn(verification.verified ? 'success' : 'pending');
          } catch (e) {
            setMessage(errorText(e));
            openPaymentReturn('pending');
          }
        },
        modal: { ondismiss: () => openPaymentReturn('cancelled') },
        theme: { color: '#91b75d' }
      });
      instance.on('payment.failed', event => {
        setMessage(event?.error?.description || 'Payment was not completed. You can try again.');
        openPaymentReturn('failed');
      });
      instance.open();
    } catch (e) {
      setMessage(errorText(e));
      setBusy(false);
    }
  };
  const startBookingQr = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const idempotencyKey = window.crypto?.randomUUID?.();
      if (!idempotencyKey) throw new Error('Secure payment setup is not available in this browser.');
      await request(`/payments/customer/booking/${encodeURIComponent(id)}/qr`, {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: '{}'
      });
      setMessage('A single-use UPI QR has been generated. Scan it and check the payment status below.');
      await load();
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  };
  const checkBookingQr = async () => {
    if (!booking?.payment?.id || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await request(`/payments/customer/${encodeURIComponent(booking.payment.id)}/reconcile`, { method: 'POST', body: '{}' });
      await load();
      setMessage(result.payment?.status === 'PAID' ? 'Payment confirmed by Razorpay.' : result.payment?.qr?.status === 'EXPIRED' ? 'QR expired. The payment is not marked as paid.' : 'Razorpay has not confirmed payment yet. Do not pay again while this QR remains active.');
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  };
  const cancelBookingQr = async () => {
    if (!booking?.payment?.id || busy) return;
    setBusy(true); setMessage('');
    try {
      await request(`/payments/customer/${encodeURIComponent(booking.payment.id)}/qr/cancel`, { method: 'POST', body: '{}' });
      await load();
      setMessage('The QR code has been closed. You can choose another payment method.');
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  };
  const submitReview = async e => { e.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { await request('/reviews-issues/customer/reviews', { method: 'POST', body: json({ bookingId: id, rating: Number(review.rating), comment: review.comment || null }) }); setMessage('Review submitted for moderation.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  const submitIssue = async e => { e.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { await request('/reviews-issues/customer/issues', { method: 'POST', body: json({ bookingId: id, ...issue }) }); setIssue({ subject: '', description: '' }); setMessage('Issue report submitted.'); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title={booking?.reference || 'Booking detail'} sub="Visit details, progress and service report.">
    <Notice error={error || paymentAvailabilityError || (message && /failed|cannot|not found|invalid|requires|must|not completed|not confirmed|could not/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid|requires|must|not completed|not confirmed|could not/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {booking && <><div className="p5-booking-head"><div><Pill>{statusLabel(booking.status)}</Pill><h2>{booking.service?.name}</h2><p>{dateTime(booking.scheduledStart)} · {booking.address?.label} · {booking.address?.line1}, {booking.address?.city}</p></div><strong>{money(booking.total)}</strong></div>
      <div className="p5-metrics"><div><small>Subtotal</small><b>{money(booking.subtotal)}</b></div><div><small>Convenience fee</small><b>{money(booking.convenienceFee)}</b></div><div><small>Total</small><b>{money(booking.total)}</b></div></div>
      {isPlanCovered && <Panel title="Subscription visit" sub="This booking uses one visit credit from your current paid subscription period."><Pill tone="success">Included in {booking.subscriptionPlan?.name || 'your subscription'}</Pill><p>Visit credits do not carry forward. If you cancel before service starts, this credit is restored once to the same billing period. The credit still expires at the end of that period.</p></Panel>}
      {canPay && paymentAvailability?.enabled && <Panel title="Booking payment" sub="Payments are processed securely by Razorpay.">
        <div className="p5-list-row"><span>Payment status</span><Pill tone={booking.payment?.status === 'PAID' ? 'success' : 'warning'}>{statusLabel(booking.payment?.status || 'UNPAID')}</Pill></div>
        {booking.payment?.status === 'AUTHORIZED' && <p>Payment is authorized and awaiting confirmation. Do not retry while this status is shown.</p>}
        {booking.payment?.refunds?.length > 0 && booking.payment.refunds.map(refund => <div className="p5-list-row" key={refund.id}><span>Refund · {refund.reason || statusLabel(refund.status)}</span><b>{money(refund.amount)}</b></div>)}
        {booking.payment?.qr?.status === 'ACTIVE' && <div className="p5-qr-block"><img src={booking.payment.qr.imageUrl} alt="Razorpay UPI payment QR code"/><p>Single-use QR · expires {dateTime(booking.payment.qr.expiresAt)}</p><a href={booking.payment.qr.shortUrl} target="_blank" rel="noreferrer">Open QR code link</a><div className="p5-actions"><Button onClick={checkBookingQr} disabled={busy}>{busy ? 'Checking…' : 'I have paid · Check status'}</Button><button className="p5-button ghost" type="button" onClick={cancelBookingQr} disabled={busy}>Close QR code</button></div></div>}
        {canPay && booking.payment?.qr?.status !== 'ACTIVE' && <div className="p5-actions"><Button onClick={startBookingPayment} disabled={busy}>{busy ? 'Opening secure checkout…' : `Pay ${money(booking.total)}`}</Button>{paymentAvailability?.qrEnabled === true && booking.payment?.checkoutStarted !== true && <button className="p5-button ghost" type="button" onClick={startBookingQr} disabled={busy}>Pay with UPI QR</button>}</div>}
      </Panel>}
      <Panel title="Plants in this booking">{booking.plants?.map(x => <div className="p5-list-row" key={x.plantId}><b>{x.plant?.name}</b><small>{statusLabel(x.plant?.healthStatus)}</small></div>)}</Panel>
      <Panel title="Gardener assignment">{booking.assignment ? <div className="p5-list-row"><div><b>{booking.assignment.gardener?.user?.fullName}</b><small>{booking.assignment.gardener?.user?.phone || 'Contact details not shared'}</small></div><Pill>{statusLabel(booking.assignment.status)}</Pill></div> : <Empty title="Awaiting assignment" text="T-CARE will assign a verified Gardener to your visit."/>}</Panel>
      <Panel title="Booking timeline">{booking.statusHistory?.length ? <div className="p5-timeline">{booking.statusHistory.map(h => <div key={h.id}><i/><div><b>{statusLabel(h.toStatus)}</b><small>{dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</small></div></div>)}</div> : <Empty/>}</Panel>
      {booking.report && <Panel title="Service report" sub={dateTime(booking.report.createdAt)}><h4>{booking.report.summary}</h4><p>{booking.report.observations}</p><p>{booking.report.recommendation}</p>{booking.report.checklistItems?.map(c => <div className="p5-list-row" key={c.id}><span>{c.label}</span><Pill tone={c.completed ? 'success' : 'warning'}>{c.completed ? 'Completed' : 'Pending'}</Pill></div>)}{booking.report.photos?.length > 0 && <div className="p5-photo-grid">{booking.report.photos.map(photo => <div key={photo.id}>{photo.url && <img src={photo.url} alt={photo.caption || 'Service evidence'} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<small>{photo.caption || 'Service evidence'}</small></div>)}</div>}</Panel>}
      {booking.status === 'SERVICE_COMPLETED' && !booking.review && <Panel title="Review your service"><form onSubmit={submitReview} aria-busy={busy}><Field label="Rating"><select value={review.rating} onChange={e => setReview({ ...review, rating: e.target.value })}>{[5,4,3,2,1].map(n => <option value={n} key={n}>{n} star{n > 1 ? 's' : ''}</option>)}</select></Field><Field label="Comment"><textarea maxLength="5000" value={review.comment} onChange={e => setReview({ ...review, comment: e.target.value })}/></Field><Button type="submit" disabled={busy}>Submit review</Button></form></Panel>}
      {booking.review && <Panel title="Your review"><Pill>{statusLabel(booking.review.status)}</Pill><p>{booking.review.rating}/5 · {booking.review.comment}</p></Panel>}
      <Panel title="Report an issue"><form onSubmit={submitIssue} aria-busy={busy}><Field label="Subject"><input required minLength="2" maxLength="200" value={issue.subject} onChange={e => setIssue({ ...issue, subject: e.target.value })}/></Field><Field label="Description"><textarea required minLength="2" maxLength="10000" value={issue.description} onChange={e => setIssue({ ...issue, description: e.target.value })}/></Field><Button type="submit" disabled={busy}>Submit issue</Button></form></Panel>
      {!['SERVICE_COMPLETED', 'CANCELLED', 'SERVICE_STARTED'].includes(booking.status) && <div className="p5-actions"><Button variant="danger" onClick={cancel} disabled={busy}>Cancel booking</Button></div>}
    </>}
  </Shell>;
}

export function CustomerPaymentReturnPage({ Shell }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const outcomeHint = searchParams.get('outcome') || 'processing';
  const nav = useNavigate();
  const [payment, setPayment] = React.useState(null);
  const [phase, setPhase] = React.useState('checking');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    let timer = null;
    let attempts = 0;
    const maxAttempts = 12;
    const check = async () => {
      try {
        const result = await request(`/payments/customer/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: '{}' });
        if (!active) return;
        setPayment(result.payment || null);
        setError('');
        if (result.payment?.status === 'PAID') {
          setPhase('success');
          timer = window.setTimeout(() => { if (active) nav(result.destination || (result.payment.bookingId ? `/garden/visits/${result.payment.bookingId}` : '/garden/plan'), { replace: true }); }, 1800);
          return;
        }
        if (['FAILED', 'CANCELLED'].includes(result.payment?.status)) {
          setPhase('failed');
          return;
        }
        if (attempts >= maxAttempts - 1) {
          setPhase('pending');
          return;
        }
        attempts += 1;
        timer = window.setTimeout(check, 5000);
      } catch (checkError) {
        if (!active) return;
        setError(errorText(checkError));
        if (attempts >= maxAttempts - 1) {
          setPhase('error');
          return;
        }
        attempts += 1;
        timer = window.setTimeout(check, 5000);
      }
    };
    check();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [id, nav]);

  const retryCheck = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await request(`/payments/customer/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: '{}' });
      setPayment(result.payment || null);
      if (result.payment?.status === 'PAID') nav(result.destination || (result.payment.bookingId ? `/garden/visits/${result.payment.bookingId}` : '/garden/plan'), { replace: true });
      else if (['FAILED', 'CANCELLED'].includes(result.payment?.status)) setPhase('failed');
      else setPhase('pending');
    } catch (checkError) {
      setError(errorText(checkError));
    } finally { setBusy(false); }
  };

  const backToBooking = payment?.bookingId ? `/garden/visits/${payment.bookingId}` : '/garden/visits';
  return <Shell title="Payment status" sub="T-CARE checks the payment directly with Razorpay before updating your booking.">
    <Panel title={phase === 'success' ? 'Payment confirmed' : phase === 'failed' ? 'Payment not completed' : phase === 'pending' ? 'Payment confirmation is pending' : 'Checking your payment'}>
      {phase === 'checking' && <State loading/>}
      {phase === 'success' && <><Pill tone="success">PAID</Pill><p>Your payment is confirmed. Opening the related T-CARE record…</p></>}
      {phase === 'failed' && <><Pill tone="warning">{statusLabel(payment?.status || 'FAILED')}</Pill><p>Razorpay has not confirmed a successful payment. You can return to your booking and try again after checking your bank or UPI app.</p></>}
      {phase === 'pending' && <><Pill tone="warning">{statusLabel(payment?.status || 'PENDING')}</Pill><p>Razorpay has not confirmed the final result yet. Do not pay again while this payment is pending. Check your bank or UPI app before retrying.</p></>}
      {phase === 'error' && <Notice error={error || 'We could not check the payment right now.'}/> }
      {phase !== 'checking' && phase !== 'success' && <div className="p5-actions">
        <Button onClick={retryCheck} disabled={busy}>{busy ? 'Checking…' : 'Check payment again'}</Button>
        <Link className="p5-button ghost" to={backToBooking}>Return to booking</Link>
      </div>}
      {outcomeHint === 'cancelled' && !payment?.status?.match(/PAID/) && <small className="p5-muted">The checkout window was closed. Closing it does not by itself prove that a payment failed.</small>}
      {error && phase !== 'error' && <small className="p5-muted">Latest check: {error}</small>}
    </Panel>
  </Shell>;
}

// ---------------- Gardener: job lifecycle, service reports, media and availability ----------------
function gardenerJobLabel(job) { return job?.booking?.reference || job?.id || 'Gardener job'; }
export function GardenerDashboardPage({ Shell }) {
  const now = new Date();
  const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const path = `/gardener/dashboard?todayFrom=${encodeURIComponent(todayFrom)}&todayTo=${encodeURIComponent(todayTo)}&monthFrom=${encodeURIComponent(monthFrom)}&monthTo=${encodeURIComponent(monthTo)}`;
  const { data, loading, error, load } = useLoad(path, null, 30000);
  const todayJobs = data?.today?.jobs || [];
  const nextVisit = data?.nextVisit;
  const updates = data?.recentCustomerPlantUpdates || [];
  const rating = data?.profile?.rating;
  return <Shell title="Your route" sub="Today’s visits, your next assignment and plant updates.">
    {data?.profile?.kycStatus && data.profile.kycStatus !== 'VERIFIED' && <Panel title="Complete your verification" sub="Submit your identity documents so T-CARE can review your profile before assigning service visits.">
      <div className="p5-actions"><Link className="p5-button primary" to="/crew/kyc">Continue verification</Link></div>
    </Panel>}
    <div className="p5-metric-grid">
      <div className="p5-metric"><small>Today's jobs</small><b>{loading ? '—' : data?.today?.count ?? 0}</b></div>
      <div className="p5-metric"><small>Completed this month</small><b>{loading ? '—' : data?.month?.completedJobs ?? 0}</b></div>
      <div className="p5-metric"><small>Completed booking value</small><b>{loading ? '—' : money(data?.month?.grossCompletedBookingValue)}</b><small>Booking totals, not your payouts</small></div>
      <div className="p5-metric"><small>Current rating</small><b>{rating == null ? '—' : `${Number(rating).toFixed(1)} / 5`}</b></div>
    </div>
    <State loading={loading} error={error} onRetry={load}/>
    {nextVisit && <Panel title="Next visit" sub="Next upcoming assignment on your route.">
      <Link to={`/crew/jobs/${nextVisit.id}`} className="p5-booking-row"><div><small>{gardenerJobLabel(nextVisit)} · {dateTime(nextVisit.booking?.scheduledStart)}</small><h3>{nextVisit.booking?.service?.name}</h3><p>{nextVisit.booking?.customer?.user?.fullName} · {nextVisit.booking?.address?.line1}, {nextVisit.booking?.address?.city}</p></div><div className="p5-right"><Pill>{statusLabel(nextVisit.status)}</Pill><span>Open visit →</span></div></Link>
    </Panel>}
    <Panel title="Today's jobs" sub={`${todayJobs.length} visit${todayJobs.length === 1 ? '' : 's'} scheduled for today.`} action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      {todayJobs.length ? todayJobs.map(job => <Link to={`/crew/jobs/${job.id}`} className="p5-booking-row" key={job.id}><div><small>{gardenerJobLabel(job)} · {dateTime(job.booking?.scheduledStart)}</small><h3>{job.booking?.service?.name}</h3><p>{job.booking?.customer?.user?.fullName} · {job.booking?.address?.line1}, {job.booking?.address?.city}</p><small>{job.booking?.plants?.map(x => x.plant?.name).filter(Boolean).join(' · ')}</small></div><div className="p5-right"><Pill>{statusLabel(job.status)}</Pill><span>Open job →</span></div></Link>) : <Empty title="No jobs scheduled today" text="Your assigned visits will appear here."/>}
    </Panel>
    <Panel title="Customer plant-health updates" sub="Recent customer-reported notes for plants in your active assigned visits.">
      {updates.length ? updates.map(record => <div className="p5-list-row" key={record.id}><div><b>{record.plant?.name || 'Customer plant'} · {statusLabel(record.plant?.healthStatus)}</b><small>{record.title} · {dateTime(record.recordedAt)}</small>{record.notes && <p>{record.notes}</p>}{record.nextCareAt && <small>Next care: {dateOnly(record.nextCareAt)}</small>}</div></div>) : <Empty title="No plant updates yet" text="Customer updates for your assigned visits will appear here."/>}
    </Panel>
    <Panel title="Availability and verification"><div className="p5-metrics"><div><small>Available time slots</small><b>{data?.availability?.activeSlots ?? 0}</b></div><div><small>Identity verification</small><b>{statusLabel(data?.profile?.kycStatus)}</b></div><div><small>Service area</small><b>{data?.profile?.serviceArea || 'Not provided'}</b></div></div><Link to="/crew/hours">Manage availability →</Link></Panel>
  </Shell>;
}
export function GardenerJobsPage({ Shell }) {
  const [filter, setFilter] = React.useState('All');
  const path = filter === 'All' ? '/gardener/jobs?limit=100' : `/gardener/jobs?limit=100&status=${({ Assigned: 'ASSIGNED', Accepted: 'ACCEPTED', 'In progress': 'IN_PROGRESS', Completed: 'COMPLETED' })[filter]}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const jobs = data?.jobs || [];
  return <Shell title="My jobs" sub="Review assignments, update visit progress and submit service reports.">
    <div className="p5-toolbar">{['All', 'Assigned', 'Accepted', 'In progress', 'Completed'].map(f => <button key={f} className={`p5-filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
    <State loading={loading} error={error} empty={!jobs.length && !loading && !error} onRetry={load}/>
    {jobs.map(j => <Link key={j.id} className="p5-booking-row" to={`/crew/jobs/${j.id}`}><div><small>{gardenerJobLabel(j)} · {dateTime(j.booking?.scheduledStart)}</small><h3>{j.booking?.service?.name}</h3><p>{j.booking?.customer?.user?.fullName} · {j.booking?.address?.line1}, {j.booking?.address?.city}</p><small>{j.booking?.plants?.map(x => x.plant?.name).join(', ')}</small></div><div className="p5-right"><Pill>{statusLabel(j.status)}</Pill><span>Open job →</span></div></Link>)}
  </Shell>;
}
export function GardenerJobDetailPage({ Shell }) {
  const { id } = useParams(); const { data, loading, error, load } = useLoad(`/gardener/jobs/${id}`, null, 30000); const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('');
  const [availablePlants, setAvailablePlants] = React.useState([]), [plantBusy, setPlantBusy] = React.useState(false);
  const assignment = data?.assignment, booking = assignment?.booking;
  const canEditVisitPlants = ['ASSIGNED', 'ACCEPTED'].includes(assignment?.status) && ['GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED'].includes(booking?.status);
  const loadAvailablePlants = async () => { try { const result = await request(`/gardener/jobs/${id}/plants/available`); setAvailablePlants(result.plants || []); } catch (e) { setMessage(errorText(e)); } };
  React.useEffect(() => { if (booking?.id && canEditVisitPlants) loadAvailablePlants(); }, [booking?.id, canEditVisitPlants]);
  const addVisitPlant = async plantId => { setPlantBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/plants`, { method: 'POST', body: json({ plantId }) }); setMessage('Plant added to this visit.'); await Promise.all([load(), loadAvailablePlants()]); } catch (e) { setMessage(errorText(e)); } finally { setPlantBusy(false); } };
  const removeVisitPlant = async plant => { if (!window.confirm(`Remove ${plant.name} from this visit? The plant will stay in the customer's collection.`)) return; setPlantBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/plants/${plant.id}`, { method: 'DELETE' }); setMessage('Plant removed from this visit.'); await Promise.all([load(), loadAvailablePlants()]); } catch (e) { setMessage(errorText(e)); } finally { setPlantBusy(false); } };
  const action = async (name, payload = {}) => { setBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/${name}`, { method: 'POST', body: json(payload) }); setMessage('Job status updated.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title={booking?.service?.name || 'Job detail'} sub={`${gardenerJobLabel(assignment)} · ${dateTime(booking?.scheduledStart)}`}>
    <Notice error={error || (message && /failed|cannot|invalid|not found|required/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|required/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {assignment && <><div className="p5-booking-head"><div><Pill>{statusLabel(assignment.status)}</Pill><h2>{booking?.customer?.user?.fullName}</h2><p>{booking?.address?.line1}, {booking?.address?.city}, {booking?.address?.state}</p></div><strong>{booking?.service?.name}</strong></div>
      <Panel title="Customer instructions"><p>{booking?.specialInstructions || 'No special instructions.'}</p><div className="p5-record-list">{booking?.plants?.map(x => <div className="p5-list-row" key={x.plantId}><div><b>{x.plant?.name}</b><small>{x.plant?.type || 'Plant'} · {statusLabel(x.plant?.healthStatus)}</small>{x.plant?.careRecords?.[0] && <><small>Latest care update: {x.plant.careRecords[0].title} · {dateTime(x.plant.careRecords[0].recordedAt)}</small>{x.plant.careRecords[0].notes && <small>{x.plant.careRecords[0].notes}</small>}</>}</div>{canEditVisitPlants && <Button variant="danger" disabled={plantBusy} onClick={() => removeVisitPlant(x.plant)}>Remove from visit</Button>}</div>)}</div>{canEditVisitPlants && <><Field label="Add another plant from the customer's collection"><select value="" onChange={e => { if (e.target.value) addVisitPlant(e.target.value); }} disabled={plantBusy}><option value="">Select plant to add</option>{availablePlants.map(plant => <option key={plant.id} value={plant.id}>{plant.name} · {statusLabel(plant.healthStatus)}</option>)}</select></Field><small>This changes the plant list for this visit only.</small></>}{!canEditVisitPlants && <small>The plant list is locked once service work begins.</small>}</Panel>
      <Panel title="Job actions" sub="Update the visit as you work."><div className="p5-actions">
        {assignment.status === 'ASSIGNED' && <><Button disabled={busy} onClick={() => action('accept')}>Accept assignment</Button><Button variant="danger" disabled={busy} onClick={() => { const reason = window.prompt('Reason for rejecting this assignment (optional)') || ''; action('reject', { reason }); }}>Reject assignment</Button></>}
        {assignment.status === 'ACCEPTED' && booking.status === 'GARDENER_ACCEPTED' && <Button disabled={busy} onClick={() => action('on-the-way')}>Mark on the way</Button>}
        {assignment.status === 'ACCEPTED' && booking.status === 'ON_THE_WAY' && <Button disabled={busy} onClick={() => action('arrived')}>Mark arrived</Button>}
        {assignment.status === 'ACCEPTED' && booking.status === 'ARRIVED' && <Button disabled={busy} onClick={() => action('start')}>Start service</Button>}
        {booking.status === 'SERVICE_STARTED' && <><Link className="p5-button primary" to={`/crew/jobs/${id}/report`}>Open service report</Link><Button disabled={busy} onClick={() => action('complete')}>Complete job (after report)</Button></>}
        {assignment.status === 'COMPLETED' && <Link className="p5-button ghost" to={`/crew/jobs/${id}/report`}>View completed report</Link>}
      </div></Panel>
      {booking.report && <Panel title="Saved service report"><h4>{booking.report.summary}</h4><p>{booking.report.observations}</p><p>{booking.report.recommendation}</p></Panel>}
    </>}
  </Shell>;
}
export function GardenerReportPage({ Shell }) {
  const { id } = useParams();
  const { data, loading, error, load } = useLoad(`/gardener/jobs/${id}`);
  const reportState = useLoad(`/gardener/jobs/${id}/report`);
  const [summary, setSummary] = React.useState(''), [observations, setObservations] = React.useState(''), [recommendation, setRecommendation] = React.useState(''), [nextCareAt, setNextCareAt] = React.useState(''), [checks, setChecks] = React.useState([]), [plantStates, setPlantStates] = React.useState({}), [plantNotes, setPlantNotes] = React.useState({}), [plantRecommendations, setPlantRecommendations] = React.useState({}), [saving, setSaving] = React.useState(false), [message, setMessage] = React.useState(''), [photoBusy, setPhotoBusy] = React.useState(false);
  const booking = data?.assignment?.booking;
  const report = reportState.data?.report || booking?.report;
  React.useEffect(() => { if (report) { setSummary(report.summary || ''); setObservations(report.observations || ''); setRecommendation(report.recommendation || ''); setNextCareAt(report.nextCareAt ? new Date(report.nextCareAt).toISOString().slice(0, 10) : ''); setChecks(report.checklistItems || []); setPlantStates(Object.fromEntries((report.plants || []).map(p => [p.plantId, p.healthStatus]))); setPlantNotes(Object.fromEntries((report.plants || []).map(p => [p.plantId, p.conditionNote || '']))); setPlantRecommendations(Object.fromEntries((report.plants || []).map(p => [p.plantId, p.recommendation || '']))); } else if (booking?.plants) setChecks(booking.plants.map(p => ({ label: `Inspect ${p.plant?.name || 'plant'}`, completed: false }))); }, [booking?.id, report?.id, report?.updatedAt]);
  const save = async e => { e.preventDefault(); setSaving(true); setMessage(''); try { const plants = (booking?.plants || []).map(p => ({ plantId: p.plantId, healthStatus: plantStates[p.plantId] || p.plant?.healthStatus || 'HEALTHY', conditionNote: plantNotes[p.plantId] || null, recommendation: plantRecommendations[p.plantId] || null })); await request(`/gardener/jobs/${id}/report`, { method: 'PUT', body: json({ summary, observations: observations || null, recommendation: recommendation || null, nextCareAt: nextCareAt ? new Date(`${nextCareAt}T12:00:00`).toISOString() : null, checklistItems: checks, plants }) }); setMessage('Service report saved.'); await Promise.all([load(), reportState.load()]); } catch (e2) { setMessage(errorText(e2)); } finally { setSaving(false); } };
  const addPhoto = async e => { const file = e.target.files?.[0]; if (!file || !report?.id) { setMessage('Save the report first, then upload photos.'); return; } setPhotoBusy(true); try { const asset = await uploadToStorage(file, { kind: 'SERVICE_REPORT_PHOTO', targetType: 'SERVICE_REPORT', targetId: report.id }); await request(`/gardener/jobs/${id}/report/photos`, { method: 'POST', body: json({ objectKey: asset.objectKey, caption: file.name }) }); setMessage('Report photo uploaded.'); await reportState.load(); } catch (e2) { setMessage(errorText(e2)); } finally { setPhotoBusy(false); e.target.value = ''; } };
  const removePhoto = async photo => { if (!window.confirm('Remove this service evidence photo?')) return; setPhotoBusy(true); try { await request(`/gardener/jobs/${id}/report/photos/${photo.id}`, { method: 'DELETE' }); setMessage('Report photo removed.'); await reportState.load(); } catch (e) { setMessage(errorText(e)); } finally { setPhotoBusy(false); } };
  return <Shell title="Service report" sub="Document the work, plant condition and recommendations before completion."><Notice error={error || (message && /failed|cannot|required|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|required|invalid/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {booking && <form className="p5-panel" onSubmit={save}><Field label="Service summary"><textarea required minLength="1" maxLength="5000" value={summary} onChange={e => setSummary(e.target.value)}/></Field><Field label="Observations"><textarea maxLength="10000" value={observations} onChange={e => setObservations(e.target.value)}/></Field><Field label="Recommendations"><textarea maxLength="10000" value={recommendation} onChange={e => setRecommendation(e.target.value)}/></Field><Field label="Next care date"><input type="date" value={nextCareAt} onChange={e => setNextCareAt(e.target.value)}/></Field>
      <Panel title="Checklist"><div className="p5-record-list">{checks.map((c, i) => <label className="p5-check" key={c.id || i}><input type="checkbox" checked={!!c.completed} onChange={e => setChecks(current => current.map((x, j) => j === i ? { ...x, completed: e.target.checked } : x))}/><span>{c.label}</span></label>)}</div><div className="p5-actions"><Button variant="ghost" onClick={() => setChecks(current => [...current, { label: `Additional task ${current.length + 1}`, completed: false }])}>Add checklist item</Button></div></Panel>
      <Panel title="Plant condition"><div className="p5-record-list">{booking.plants?.map(p => <div className="p5-list-row" key={p.plantId}><div><b>{p.plant?.name}</b><small>Customer-reported status: {statusLabel(p.plant?.healthStatus)}</small></div><Field label="Observed condition"><select value={plantStates[p.plantId] || p.plant?.healthStatus || 'HEALTHY'} onChange={e => setPlantStates(current => ({ ...current, [p.plantId]: e.target.value }))}>{['EXCELLENT','HEALTHY','NEEDS_ATTENTION','CRITICAL'].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Condition notes"><textarea maxLength="5000" value={plantNotes[p.plantId] || ''} onChange={e => setPlantNotes(current => ({ ...current, [p.plantId]: e.target.value }))} placeholder="Describe what you observed…"/></Field><Field label="Care recommendation"><textarea maxLength="5000" value={plantRecommendations[p.plantId] || ''} onChange={e => setPlantRecommendations(current => ({ ...current, [p.plantId]: e.target.value }))} placeholder="Suggested next steps…"/></Field></div>)}</div></Panel>
      <div className="p5-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save report'}</Button><label className="p5-button ghost">{photoBusy ? 'Uploading…' : 'Upload photo'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={addPhoto} disabled={photoBusy}/></label></div>
      {report?.photos?.length > 0 && <Panel title="Service evidence photos"><div className="p5-photo-grid">{report.photos.map(photo => <div key={photo.id}>{photo.url && <img src={photo.url} alt={photo.caption || 'Service evidence'} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<small>{photo.caption || 'Service evidence'}</small><Button variant="danger" disabled={photoBusy} onClick={() => removePhoto(photo)}>Remove photo</Button></div>)}</div></Panel>}
    </form>}
  </Shell>;
}
export function GardenerReportsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/gardener/history', null, 30000);
  const jobs = data?.jobs || [];
  return <Shell title="Completed reports" sub="Your completed visits and service reports."><State loading={loading} error={error} empty={!jobs.length && !loading && !error} onRetry={load}/>
    {jobs.map(job => <Link className="p5-booking-row" key={job.id} to={`/crew/jobs/${job.id}`}><div><small>{gardenerJobLabel(job)} · {dateTime(job.completedAt || job.booking?.scheduledEnd)}</small><h3>{job.booking?.service?.name}</h3><p>{job.booking?.customer?.user?.fullName} · {job.booking?.address?.city}</p></div><div className="p5-right"><Pill tone="success">Completed</Pill><span>View report →</span></div></Link>)}
  </Shell>;
}

export function GardenerAvailabilityPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/gardener/availability', null, 30000);
  const emptyForm = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isActive: true };
  const [form, setForm] = React.useState(emptyForm); const [editing, setEditing] = React.useState(null); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const save = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request(editing ? `/gardener/availability/${editing}` : '/gardener/availability', { method: editing ? 'PATCH' : 'POST', body: json(form) }); setMessage(editing ? 'Availability updated.' : 'Availability slot saved.'); setEditing(null); setForm(emptyForm); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  const edit = slot => { setEditing(slot.id); setForm({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, isActive: slot.isActive }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const toggle = async slot => { setBusy(true); setMessage(''); try { await request(`/gardener/availability/${slot.id}`, { method: 'PATCH', body: json({ isActive: !slot.isActive }) }); setMessage(slot.isActive ? 'Availability paused.' : 'Availability activated.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  const remove = async slot => { if (!window.confirm(`Delete the ${days[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime} slot?`)) return; setBusy(true); setMessage(''); try { await request(`/gardener/availability/${slot.id}`, { method: 'DELETE' }); setMessage('Availability slot deleted.'); if (editing === slot.id) { setEditing(null); setForm(emptyForm); } await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title="Availability" sub="Set the days and hours when you can accept visits."><Notice error={error || (message && /failed|cannot|overlap|invalid|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|overlap|invalid|not found/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    <Panel title={editing ? 'Edit availability slot' : 'Add availability'}><form onSubmit={save}><FormGrid><Field label="Day"><select value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>{days.map((d,i) => <option value={i} key={d}>{d}</option>)}</select></Field><Field label="Start time"><input type="time" required value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}/></Field><Field label="End time"><input type="time" required value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })}/></Field></FormGrid><div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update hours' : 'Save hours'}</Button>{editing && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel edit</Button>}</div></form></Panel>
    <Panel title="Saved weekly availability" sub="Pause a slot temporarily or remove it when it no longer applies.">{(data?.availability || []).length ? data.availability.map(slot => <div className="p5-list-row" key={slot.id}><div><b>{days[slot.dayOfWeek]}</b><small>{slot.startTime}–{slot.endTime}</small></div><Pill tone={slot.isActive ? 'success' : undefined}>{slot.isActive ? 'Active' : 'Paused'}</Pill><div className="p5-actions"><Button variant="ghost" disabled={busy} onClick={() => edit(slot)}>Edit</Button><Button variant="ghost" disabled={busy} onClick={() => toggle(slot)}>{slot.isActive ? 'Pause' : 'Activate'}</Button><Button variant="danger" disabled={busy} onClick={() => remove(slot)}>Delete</Button></div></div>) : <Empty title="No availability entered" text="Add the weekdays and time ranges when you can accept assignments."/>}</Panel>
  </Shell>;
}

export function GardenerPayoutsPage({ Shell }) {
  const [page, setPage] = React.useState(1);
  const { data, loading, error, load } = useLoad(`/gardener/payouts?page=${page}&limit=25`, null, 30000);
  const payouts = data?.payouts || [];
  const totals = data?.totals || {};
  const last = data?.lastPaidPayout;
  const pagination = data?.pagination;
  return <Shell title="Payouts" sub="Payout amounts and their recorded status.">
    <State loading={loading} error={error} onRetry={load}/>
    <div className="p5-metric-grid"><div className="p5-metric"><small>Total paid</small><b>{money(totals.paid)}</b></div><div className="p5-metric"><small>Pending payout</small><b>{money(totals.pending)}</b></div><div className="p5-metric"><small>Last payout</small><b>{last ? money(last.amount) : '—'}</b><small>{last ? dateTime(last.paidAt) : 'No paid payout recorded'}</small></div></div>
    <Panel title="Payout history"><div className="p5-actions"><Button variant="ghost" onClick={load}>Refresh</Button></div>{payouts.length ? <RecordTable headers={['Recorded','Period','Amount','Status','Paid on']}>
      {payouts.map(p => <tr key={p.id}><td>{dateTime(p.createdAt)}</td><td>{p.periodStart || p.periodEnd ? `${dateOnly(p.periodStart)} – ${dateOnly(p.periodEnd)}` : 'Not specified'}</td><td>{money(p.amount)}</td><td><Pill tone={p.status === 'PAID' ? 'success' : undefined}>{statusLabel(p.status)}</Pill></td><td>{p.paidAt ? dateTime(p.paidAt) : '—'}</td></tr>)}
    </RecordTable> : <Empty title="No payout records yet"/>}
      {pagination?.pages > 1 && <div className="p5-actions"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><small>Page {pagination.page} of {pagination.pages}</small><Button variant="ghost" disabled={page >= pagination.pages} onClick={() => setPage(value => Math.min(pagination.pages, value + 1))}>Next</Button></div>}
    </Panel>
  </Shell>;
}

// ---------------- Customer: payment history (read-only) ----------------
export function CustomerPaymentsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/payments/customer', null, 30000);
  const payments = data?.payments || [];
  const completed = payments.filter(item => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(item.status));
  const paidTotal = completed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const refundedTotal = payments.reduce((sum, item) => sum + (item.refunds || [])
    .filter(refund => ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(refund.status))
    .reduce((partial, refund) => partial + Number(refund.amount || 0), 0), 0);
  const netTotal = Math.max(0, paidTotal - refundedTotal);
  const referenceFor = item => item.booking?.reference || item.subscription?.plan?.name || (item.bookingId ? 'Service booking' : 'Subscription');
  const kindFor = item => item.booking ? (item.booking.service?.name || 'Service booking') : item.subscription ? `${item.subscription.plan?.name || 'Subscription'}${item.subscription.plan?.billingCycle ? ` · ${item.subscription.plan.billingCycle}` : ''}` : 'T-CARE payment';
  return <Shell title="Payments & refunds" sub="View payments and refunds linked to your bookings and plans.">
    <div className="p5-metric-grid">
      <div className="p5-metric"><small>Recorded paid amount</small><b>{money(paidTotal)}</b></div>
      <div className="p5-metric"><small>Processed refunds</small><b>{money(refundedTotal)}</b></div>
      <div className="p5-metric"><small>Net after refunds</small><b>{money(netTotal)}</b></div>
      <div className="p5-metric"><small>Payment records</small><b>{payments.length}</b></div>
    </div>
    <Notice error={error}/>
    <Panel title="Payment history" action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      <State loading={loading} error={error} empty={!payments.length && !loading && !error} onRetry={load}/>
      {payments.length > 0 && <RecordTable headers={['Date','For','Reference','Amount','Status','Paid at']}>
        {payments.map(item => <tr key={item.id}>
          <td>{dateTime(item.createdAt)}</td>
          <td>{kindFor(item)}</td>
          <td>{referenceFor(item)}</td>
          <td>{money(item.amount)}</td>
          <td><Pill tone={item.status === 'PAID' ? 'success' : ['REFUNDED','FAILED','CANCELLED'].includes(item.status) ? 'warning' : ''}>{statusLabel(item.status)}</Pill></td>
          <td>{dateTime(item.paidAt)}</td>
        </tr>)}
      </RecordTable>}
    </Panel>
    {payments.some(item => item.refunds?.length) && <Panel title="Refund records">
      {payments.flatMap(item => (item.refunds || []).map(refund => ({ ...refund, paymentReference: referenceFor(item) }))).map(refund => <div className="p5-list-row" key={refund.id}>
        <div><b>{money(refund.amount)} · {statusLabel(refund.status)}</b><small>{refund.paymentReference} · Requested {dateTime(refund.createdAt)}</small>{refund.reason && <small>Reason: {refund.reason}</small>}</div>
        <Pill tone={refund.status === 'REFUNDED' || refund.status === 'PARTIALLY_REFUNDED' ? 'success' : 'warning'}>{statusLabel(refund.status)}</Pill>
      </div>)}
    </Panel>}
  </Shell>;
}

// ---------------- Shared notifications ----------------
export function NotificationsPage({ Shell }) {
  const [unreadOnly, setUnreadOnly] = React.useState(false); const path = `/notifications?limit=50${unreadOnly ? '&unreadOnly=true' : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const items = data?.notifications || [];
  const [mutationError,setMutationError] = React.useState('');
  const markRead = async id => { setMutationError(''); try { await request(`/notifications/${id}/read`, { method: 'POST', body: '{}' }); await load(); window.dispatchEvent(new Event('tcare:notifications-changed')); } catch (error) { setMutationError(errorText(error)); } };
  const markAll = async () => { setMutationError(''); try { await request('/notifications/read-all', { method: 'POST', body: '{}' }); await load(); window.dispatchEvent(new Event('tcare:notifications-changed')); } catch (error) { setMutationError(errorText(error)); } };
  return <Shell title="Notifications" sub="Your booking, service and account updates from T-CARE."><Notice error={error || mutationError}/><div className="p5-toolbar"><button className={`p5-filter ${!unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(false)}>All</button><button className={`p5-filter ${unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(true)}>Unread ({data?.unreadCount ?? '—'})</button><Button variant="ghost" onClick={markAll}>Mark all read</Button></div><State loading={loading} error={error} empty={!items.length && !loading && !error} onRetry={load}/>{items.map(n => <div className={`p5-notification ${n.readAt ? '' : 'unread'}`} key={n.id}><div><Pill>{statusLabel(n.type)}</Pill><h3>{n.title}</h3><p>{n.body}</p><small>{dateTime(n.createdAt)}</small></div>{!n.readAt && <Button variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}</div>)}</Shell>;
}

// ---------------- Admin: operations, accounts, verification, services, issues, content and analytics ----------------
export function AdminNotificationsPage({ Shell }) {
  const [filter, setFilter] = React.useState('');
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const path = `/notifications/admin?limit=100${filter ? `&type=${filter}` : ''}${unreadOnly ? '&unreadOnly=true' : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000);
  const { data: usersData, loading: usersLoading, error: usersError } = useLoad('/admin/users?limit=100&status=ACTIVE', null, 60000);
  const [form, setForm] = React.useState({ userId: '', type: 'SYSTEM', channel: 'IN_APP', title: '', body: '' });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const users = usersData?.users || [];
  const notifications = data?.notifications || [];
  React.useEffect(() => { if (!form.userId && users.length) setForm(current => ({ ...current, userId: users[0].id })); }, [users, form.userId]);
  const send = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request('/notifications/admin/send', { method: 'POST', body: json(form) }); setMessage('Notification created and delivered to the in-app inbox.'); setForm(current => ({ ...current, title: '', body: '' })); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  return <Shell title="Notification centre" sub="Review account updates and send a message to an active customer or Gardener."><Notice error={error || usersError || (message && /failed|cannot|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid/i.test(message) ? message : ''}/>
    <Panel title="Send an in-app notification"><form onSubmit={send}><FormGrid><Field label="Recipient"><select required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} disabled={usersLoading || !users.length}><option value="">{usersLoading ? 'Loading accounts…' : 'Select active user'}</option>{users.map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.role} · {u.email}</option>)}</select></Field><Field label="Notification type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{['BOOKING','SERVICE','PLANT_CARE','SYSTEM'].map(x => <option key={x}>{x}</option>)}</select></Field></FormGrid><Field label="Title"><input required minLength="1" maxLength="160" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></Field><Field label="Message"><textarea required minLength="1" maxLength="4000" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}/></Field><Button type="submit" disabled={busy || usersLoading || !form.userId}>{busy ? 'Sending…' : 'Create notification'}</Button></form></Panel>
    <div className="p5-toolbar"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All types</option>{['BOOKING','SERVICE','PLANT_CARE','SYSTEM'].map(x => <option key={x}>{x}</option>)}</select><button className={`p5-filter ${!unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(false)}>All</button><button className={`p5-filter ${unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(true)}>Unread only</button><Button variant="ghost" onClick={load}>Refresh</Button></div>
    <State loading={loading} error={error} empty={!notifications.length && !loading && !error} onRetry={load}/>
    {notifications.map(n => <div className={`p5-notification ${n.readAt ? '' : 'unread'}`} key={n.id}><div><Pill>{statusLabel(n.type)}</Pill><h3>{n.title}</h3><p>{n.body}</p><small>{n.user?.fullName || n.user?.email || n.userId} · {n.user?.role || ''} · {dateTime(n.createdAt)} · {n.readAt ? 'Read' : 'Unread'}</small></div></div>)}
  </Shell>;
}

export function AdminDashboardPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/admin/overview', null, 30000);
  const activityState = useLoad('/admin/recent-activities?limit=10', null, 30000);
  const popularState = useLoad('/admin/popular-services?days=30', null, 30000);
  const o = data?.overview;
  const f = o?.finance || {};
  const metrics = [
    ['Total users', o?.users], ['Customers', o?.customers], ['Gardeners', o?.gardeners],
    ['Active bookings', o?.activeBookings], ['Pending KYC', o?.pendingKyc], ['Open issues', o?.openIssues],
    ['Pending reviews', o?.pendingReviews], ['Pending payments', o?.pendingPayments]
  ];
  return <Shell title="Operations overview" sub="Bookings, accounts, payments and subscriptions at a glance.">
    <State loading={loading} error={error} onRetry={load}/>
    {o && <>
      <div className="p5-metric-grid">{metrics.map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value ?? 0}</b></div>)}</div>
      <Panel title="Payment summary" sub="Totals reflect recorded payments and refunds, not accounting revenue or profit.">
        <div className="p5-metric-grid">
          {[["Gross collected",money(f.grossCollected)],['Refunded',money(f.refunded)],['Net collected',money(f.netCollected)],['Paid transactions',f.paidTransactionCount ?? 0],['Paid Gardener payouts',money(f.paidPayouts)],['Pending Gardener payouts',money(f.pendingPayouts)]].map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value}</b></div>)}
        </div>
      </Panel>
      <Panel title="Subscriptions by status"><div className="p5-metric-grid"><div className="p5-metric"><small>Active subscriptions</small><b>{o.subscriptions?.active ?? 0}</b></div><div className="p5-metric"><small>Pending subscriptions</small><b>{o.subscriptions?.pending ?? 0}</b></div></div><Link className="p5-button ghost" to="/hq/plans">Manage subscriptions</Link></Panel>
      <Panel title="Bookings by day" sub="Bookings created in the past 14 days.">
        {(o.dailyBookings || []).length ? <RecordTable headers={['Day','New bookings','Completed','Cancelled']}>{o.dailyBookings.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.total}</td><td>{row.completed}</td><td>{row.cancelled}</td></tr>)}</RecordTable> : <Empty title="No daily booking activity"/>}
      </Panel>
    </>}
    <div className="p5-columns">
      <Panel title="Popular services" sub="Most booked services in the past 30 days.">
        <State loading={popularState.loading} error={popularState.error} empty={!popularState.data?.services?.length && !popularState.loading && !popularState.error} onRetry={popularState.load}/>
        {(popularState.data?.services || []).map((service,index) => <div className="p5-list-row" key={service.id}><div><b>{index+1}. {service.name}</b><small>{service.category} · {statusLabel(service.status)}</small></div><Pill>{service.bookingCount} bookings</Pill></div>)}
      </Panel>
      <Panel title="Recent activity" sub="Recent changes made in T-CARE.">
        <State loading={activityState.loading} error={activityState.error} empty={!activityState.data?.activities?.length && !activityState.loading && !activityState.error} onRetry={activityState.load}/>
        {(activityState.data?.activities || []).map(activity => <div className="p5-list-row" key={activity.id}><div><b>{statusLabel(activity.action)} · {activity.entityType}</b><small>{activity.actor?.fullName || activity.actor?.email || 'System'} · {activity.actor?.role || 'SYSTEM'} · {dateTime(activity.createdAt)}</small><small>{activity.entityId || 'No record reference'}</small></div></div>)}
        <Link to="/hq/money" className="p5-button ghost">Open finance records</Link>
      </Panel>
    </div>
    <div className="p5-columns"><Panel title="Work queues"><Link className="p5-list-row" to="/hq/crew"><b>Gardener verification</b><span>Review identity documents →</span></Link><Link className="p5-list-row" to="/hq/visits"><b>Bookings</b><span>Assign Gardeners and update booking status →</span></Link><Link className="p5-list-row" to="/hq/reviews"><b>Reviews and customer issues</b><span>Review feedback and resolve reports →</span></Link><Link className="p5-list-row" to="/hq/notifications"><b>Notification centre</b><span>Review and send account updates →</span></Link></Panel><Panel title="Refresh data"><div className="p5-actions"><Button variant="ghost" onClick={load}>Refresh overview</Button><Button variant="ghost" onClick={activityState.load}>Refresh activity</Button><Button variant="ghost" onClick={popularState.load}>Refresh popular services</Button></div></Panel></div>
  </Shell>;
}

export function AdminSubscriptionsPage({ Shell }) {
  const plansState = useLoad('/subscriptions/admin/plans', null, 30000);
  const subscriptionsState = useLoad('/subscriptions/admin', null, 30000);
  const servicesState = useLoad('/services', null, 60000);
  const plans = plansState.data?.plans || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const services = servicesState.data?.services || [];
  const initialForm = { name: '', description: '', planType: 'ONE_MONTH', billingCycle: '1 month', serviceFrequency: '', includedServiceIds: [], includedVisitsPerPeriod: '1', minimumVisitIntervalDays: '7', maxRenewalCycles: '11', plantLimit: '', price: '', benefitsText: '', limitationsText: '', status: 'ACTIVE' };
  const [form, setForm] = React.useState(initialForm);
  const [editing, setEditing] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('');
  const visibleSubscriptions = subscriptions.filter(item => !statusFilter || item.status === statusFilter);
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const savePlan = async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        planType: form.planType,
        ...(form.planType === 'LEGACY_RECURRING' ? { billingCycle: form.billingCycle } : {}),
        ...(form.serviceFrequency.trim() ? { serviceFrequency: form.serviceFrequency.trim() } : {}),
        includedServiceIds: form.includedServiceIds,
        ...(form.planType !== 'LEGACY_RECURRING' ? {
          includedVisitsPerPeriod: form.planType === 'ONE_TIME_SERVICE' ? 1 : Number(form.includedVisitsPerPeriod),
          ...(recurring ? { minimumVisitIntervalDays: Number(form.minimumVisitIntervalDays), maxRenewalCycles: Number(form.maxRenewalCycles) } : { minimumVisitIntervalDays: null, maxRenewalCycles: null })
        } : {}),
        plantLimit: form.plantLimit === '' ? null : Number(form.plantLimit),
        price: Number(form.price),
        benefits: form.benefitsText.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
        limitations: form.limitationsText.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
        status: form.status
      };
      await request(editing ? `/subscriptions/admin/plans/${editing}` : '/subscriptions/admin/plans', { method: editing ? 'PATCH' : 'POST', body: json(payload) });
      setMessage(editing ? 'Subscription plan updated.' : 'Subscription plan created.'); setEditing(null); setForm(initialForm); await plansState.load();
    } catch (e2) { setMessage(errorText(e2)); }
    finally { setBusy(false); }
  };
  const startEdit = plan => {
    setEditing(plan.id);
    setForm({
      name: plan.name,
      description: plan.description || '',
      planType: plan.planType || 'LEGACY_RECURRING',
      billingCycle: plan.billingCycle || 'monthly',
      serviceFrequency: plan.serviceFrequency || '',
      includedServiceIds: plan.includedServiceIds || [],
      includedVisitsPerPeriod: String(plan.includedVisitsPerPeriod ?? 1),
      minimumVisitIntervalDays: String(plan.minimumVisitIntervalDays ?? 1),
      maxRenewalCycles: String(plan.maxRenewalCycles ?? 0),
      plantLimit: plan.plantLimit ?? '',
      price: String(plan.price),
      benefitsText: (plan.benefits || []).join('\n'),
      limitationsText: (plan.limitations || []).join('\n'),
      status: plan.status
    });
  };
  const deletePlan = async plan => {
    if (!window.confirm(`Delete or deactivate the ${plan.name} plan? Existing subscription history will be preserved.`)) return;
    try { const result = await request(`/subscriptions/admin/plans/${plan.id}`, { method: 'DELETE' }); setMessage(result?.deactivated ? 'Plan has subscriptions or a Razorpay plan and was deactivated.' : 'Plan deleted.'); await plansState.load(); }
    catch (e) { setMessage(errorText(e)); }
  };
  const updateSubscription = async (subscription, status) => {
    if (!window.confirm(`Change ${subscription.customer?.user?.fullName || 'this customer'} subscription to ${status}?`)) return;
    try { await request(`/subscriptions/admin/${subscription.id}/status`, { method: 'PATCH', body: json({ status }) }); setMessage(`Subscription status updated to ${status}.`); await subscriptionsState.load(); }
    catch (e) { setMessage(errorText(e)); await subscriptionsState.load(); }
  };
  const recurring = ['WEEKLY', 'ONE_MONTH', 'ONE_YEAR'].includes(form.planType);
  const upiPriceEligible = Number.isFinite(Number(form.price)) && Number(form.price) > 0 && Number(form.price) < 5000;
  return <Shell title="Subscription management" sub="Manage one-time services and recurring UPI AutoPay plan definitions.">
    <Notice error={plansState.error || subscriptionsState.error || servicesState.error || (message && /failed|cannot|not found|unsupported|required|payment|UPI/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|unsupported|required|payment|UPI/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit plan' : 'Create plan'} sub="Set the exact services and terms customers will see before they choose a plan.">
      <form onSubmit={savePlan}>
        <FormGrid>
          <Field label="Plan name"><input required minLength="2" maxLength="120" value={form.name} onChange={e => updateForm('name', e.target.value)}/></Field>
          <Field label="Plan type"><select value={form.planType} onChange={e => updateForm('planType', e.target.value)}><option value="ONE_TIME_SERVICE">One-Time Service</option><option value="WEEKLY">Weekly</option><option value="ONE_MONTH">One-Month</option><option value="ONE_YEAR">One-Year</option>{editing && form.planType === 'LEGACY_RECURRING' && <option value="LEGACY_RECURRING">Legacy recurring (preserve existing)</option>}</select></Field>
          <Field label="Price (INR)"><input required type="number" min="0.01" step="0.01" value={form.price} onChange={e => updateForm('price', e.target.value)}/></Field>
          <Field label="Plant limit (blank = no stated limit)"><input type="number" min="1" value={form.plantLimit} onChange={e => updateForm('plantLimit', e.target.value)}/></Field>
          <Field label="Service frequency" hint="Customer-facing schedule description."><input required={form.planType !== 'LEGACY_RECURRING'} minLength="2" maxLength="160" value={form.serviceFrequency} onChange={e => updateForm('serviceFrequency', e.target.value)} placeholder="e.g. Weekly plant-care visit"/></Field>
          {form.planType === 'ONE_TIME_SERVICE' ? <Field label="Included visits"><input value="1" readOnly aria-readonly="true"/></Field> : form.planType !== 'LEGACY_RECURRING' && <>
            <Field label="Included visits per billing period"><input required type="number" min="1" max="100" step="1" value={form.includedVisitsPerPeriod} onChange={e => updateForm('includedVisitsPerPeriod', e.target.value)}/></Field>
            <Field label="Minimum days between visits"><input required type="number" min="1" max="365" step="1" value={form.minimumVisitIntervalDays} onChange={e => updateForm('minimumVisitIntervalDays', e.target.value)}/></Field>
            <Field label="Maximum renewals after first period"><input required type="number" min="0" max={form.planType === 'WEEKLY' ? 520 : form.planType === 'ONE_MONTH' ? 119 : 9} step="1" value={form.maxRenewalCycles} onChange={e => updateForm('maxRenewalCycles', e.target.value)}/></Field>
          </>}
          <Field label="Visibility"><select value={form.status} onChange={e => updateForm('status', e.target.value)}><option value="ACTIVE">Active / customer-visible</option><option value="INACTIVE">Inactive</option></select></Field>
          {form.planType === 'LEGACY_RECURRING' && <Field label="Existing billing cycle"><input required value={form.billingCycle} onChange={e => updateForm('billingCycle', e.target.value)}/></Field>}
        </FormGrid>
        <Field label="Description"><textarea maxLength="2000" value={form.description} onChange={e => updateForm('description', e.target.value)}/></Field>
        <Field label="Included services" hint="Select only active services. At least one service is required.">
          {servicesState.loading ? <div className="p5-state">Loading services…</div> : servicesState.error ? <div className="p5-state p5-error">{servicesState.error} <Button variant="ghost" onClick={servicesState.load}>Retry</Button></div> : <div className="p5-check-grid">{services.map(service => <label className="p5-check" key={service.id}><input type="checkbox" checked={form.includedServiceIds.includes(service.id)} onChange={e => updateForm('includedServiceIds', e.target.checked ? [...form.includedServiceIds, service.id] : form.includedServiceIds.filter(id => id !== service.id))}/><span><b>{service.name}</b><small>{service.category} · {service.durationLabel}</small></span></label>)}</div>}
          {!services.length && !servicesState.loading && !servicesState.error && <small>No active services exist. Create or activate services before configuring a plan.</small>}
        </Field>
        <Field label="Benefits" hint="Enter one benefit per line. Leave blank when no approved benefit has been defined."><textarea value={form.benefitsText} onChange={e => updateForm('benefitsText', e.target.value)} maxLength="6000" placeholder="One benefit per line"/></Field>
        <Field label="Limitations" hint="Enter one limitation per line. These are displayed before customers choose a plan."><textarea value={form.limitationsText} onChange={e => updateForm('limitationsText', e.target.value)} maxLength="6000" placeholder="One limitation per line"/></Field>
        <div className="p5-plan-renewal-note">
          {form.planType === 'ONE_TIME_SERVICE' ? 'This plan is charged once and does not renew.' : recurring ? 'Recurring plans use Razorpay UPI AutoPay after the customer explicitly approves a mandate. Customers cancel the mandate from their UPI payment app to stop future renewals. Already-paid access continues until the paid-through date.' : 'Legacy billing terms are preserved. Review them before offering the plan for new purchases.'}
        </div>
        {recurring && !upiPriceEligible && <div className="p5-plan-warning">The configured Razorpay UPI AutoPay settings currently document a per-charge limit below ₹5,000. This plan can be saved only as inactive until its price and payment-method eligibility are confirmed.</div>}
        <div className="p5-actions"><Button type="submit" disabled={busy || servicesState.loading || (!editing && !form.includedServiceIds.length) || (recurring && !upiPriceEligible && form.status === 'ACTIVE')}>{busy ? 'Saving…' : editing ? 'Save plan changes' : 'Create plan'}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(initialForm); }}>Cancel</Button>}</div>
      </form>
    </Panel>
    <Panel title="Plans" sub={`${plans.length} plans`}>
      <State loading={plansState.loading} error={plansState.error} empty={!plans.length && !plansState.loading && !plansState.error} onRetry={plansState.load}/>
      {plans.map(plan => <div className="p5-list-row p5-admin-plan-row" key={plan.id}><div><b>{plan.name} · {money(plan.price)}</b><small>{plan.planTypeLabel || statusLabel(plan.planType)} · {plan.billingCycle} · {plan.includedVisitsPerPeriod ?? '—'} visits/period · {plan.serviceFrequency || 'Frequency not configured'} · {plan.plantLimit ? `${plan.plantLimit} plants` : 'No stated plant limit'} · {statusLabel(plan.status)} · {plan._count?.subscriptions ?? '—'} subscriptions</small><small>Services: {(plan.includedServices || []).map(service => service.name).join(', ') || 'None configured'}</small><small>Benefits: {(plan.benefits || []).join(' · ') || 'Not supplied'} · Limitations: {(plan.limitations || []).join(' · ') || 'Not supplied'}</small><small>{plan.autoRenew ? `UPI AutoPay ${plan.upiAutopayEligible ? 'eligible by amount' : 'not eligible at this amount'} · ${plan.maxRenewalCycles ?? '—'} renewals after first period` : 'No automatic renewal'}</small></div><div className="p5-actions"><Button variant="ghost" onClick={() => startEdit(plan)}>Edit</Button><Button variant="danger" onClick={() => deletePlan(plan)}>Delete / deactivate</Button></div></div>)}
    </Panel>
    <Panel title="Customer subscriptions" sub="UPI AutoPay status and paid-period visit credits are synchronized from verified Razorpay subscription webhooks. Do not manually mark a recurring subscription paid.">
      <div className="p5-toolbar"><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All subscription states</option>{['PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'].map(s => <option key={s}>{s}</option>)}</select><Button variant="ghost" onClick={subscriptionsState.load}>Refresh</Button></div>
      <State loading={subscriptionsState.loading} error={subscriptionsState.error} empty={!visibleSubscriptions.length && !subscriptionsState.loading && !subscriptionsState.error} onRetry={subscriptionsState.load}/>
      {visibleSubscriptions.map(item => <div className="p5-list-row" key={item.id}><div><b>{item.customer?.user?.fullName || 'Customer'} · {item.plan?.name}</b><small>{item.customer?.user?.email} · {item.plan?.billingCycle} · {money(item.plan?.price)}</small><small>{statusLabel(item.status)} · Created {dateTime(item.createdAt)} · {item.cancelAtPeriodEnd ? `Paid access ends ${dateOnly(item.renewsAt)}` : `Renews ${dateOnly(item.renewsAt)}`}</small>{item.providerSubscriptionId && <small>Razorpay subscription: {item.providerSubscriptionId}</small>}</div><div className="p5-actions">{item.plan?.autoRenew ? <span className="p5-plan-subscription-managed">Managed by Razorpay UPI AutoPay</span> : <select aria-label="New subscription status" value={item.status} onChange={e => updateSubscription(item, e.target.value)}>{['PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'].map(s => <option key={s}>{s}</option>)}</select>}</div></div>)}
    </Panel>
  </Shell>;
}

export function AdminFinancePage({ Shell }) {
  const overviewState = useLoad('/admin/overview', null, 30000);
  const [paymentPage,setPaymentPage]=React.useState(1);
  const [paymentSearchInput,setPaymentSearchInput]=React.useState('');
  const [paymentSearch,setPaymentSearch]=React.useState('');
  const paymentsPath=`/admin/payments?page=${paymentPage}&limit=25${paymentSearch?`&search=${encodeURIComponent(paymentSearch)}`:''}`;
  const paymentsState = useLoad(paymentsPath, null, 60000);
  const payoutsState = useLoad('/admin/payouts?limit=100', null, 60000);
  const [receiptBusy,setReceiptBusy]=React.useState('');
  const [receiptNotice,setReceiptNotice]=React.useState('');
  const [receiptError,setReceiptError]=React.useState('');
  const f = overviewState.data?.overview?.finance || {};
  const payments = paymentsState.data?.payments || [];
  const payouts = payoutsState.data?.payouts || [];
  const sendReceipt = async payment => {
    setReceiptBusy(payment.id);setReceiptNotice('');setReceiptError('');
    try {
      const result=await request(`/payments/admin/${payment.id}/receipt/resend`,{method:'POST',body:'{}'});
      setReceiptNotice(result.receipt?.deliveryStatus==='SENT'
        ?`Receipt sent to ${payment.booking?.customer?.user?.email || payment.subscription?.customer?.user?.email || 'the customer email on record'}.`
        :result.message||'Receipt delivery is being processed.');
      await paymentsState.load();
    } catch (error) { setReceiptError(errorText(error)); }
    finally { setReceiptBusy(''); }
  };
  return <Shell title="Finance" sub="Review customer payments, receipts and Gardener payouts.">
    <Notice error={overviewState.error || paymentsState.error || payoutsState.error || receiptError} success={receiptNotice}/>
    <State loading={overviewState.loading} error={overviewState.error} onRetry={overviewState.load}/>
    {overviewState.data && <div className="p5-metric-grid">{[["Gross collected",money(f.grossCollected)],['Refunded',money(f.refunded)],['Net collected',money(f.netCollected)],['Paid transactions',f.paidTransactionCount ?? 0],['Payouts paid',money(f.paidPayouts)],['Payouts pending',money(f.pendingPayouts)]].map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value}</b></div>)}</div>}
    <Panel title="Payments" sub="Search payments, refunds and receipt status.">
      <form className="p5-toolbar" onSubmit={event=>{event.preventDefault();setPaymentPage(1);setPaymentSearch(paymentSearchInput.trim().slice(0,120));}}>
        <input type="search" aria-label="Search payments" maxLength={120} placeholder="Search customer, email, service or transaction…" value={paymentSearchInput} onChange={event=>setPaymentSearchInput(event.target.value)}/>
        <Button type="submit">Search</Button>
        <Button variant="ghost" type="button" onClick={()=>{setPaymentSearchInput('');setPaymentSearch('');setPaymentPage(1);}}>Clear</Button>
        <Button variant="ghost" type="button" onClick={paymentsState.load}>Refresh</Button>
      </form>
      <State loading={paymentsState.loading} error={paymentsState.error} empty={!payments.length && !paymentsState.loading && !paymentsState.error} onRetry={paymentsState.load}/>
      {payments.length > 0 && <RecordTable headers={['Created','Customer','Reference / purpose','Amount','Method','Status','Transaction ID','Receipt','Action']}>
        {payments.map(p=>{
          const email=p.booking?.customer?.user?.email||p.subscription?.customer?.user?.email||p.shopOrder?.customer?.user?.email||'';
          const canReceipt=['PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(p.status)&&Boolean(email);
          const receiptStatus=p.receipt?.deliveryStatus||'NOT_ISSUED';
          return <tr key={p.id}>
            <td>{dateTime(p.createdAt)}</td>
            <td>{p.booking?.customer?.user?.fullName||p.subscription?.customer?.user?.fullName||p.shopOrder?.customer?.user?.fullName||'—'}<small>{email}</small></td>
            <td>{p.booking?.service?.name||p.booking?.reference||p.subscription?.plan?.name||p.shopOrder?.orderNumber||'—'}<small>{p.booking?.reference||p.providerOrderId||p.subscription?.plan?.billingCycle||p.shopOrder?.orderNumber||''}</small></td>
            <td>{money(p.amount)}</td>
            <td>{statusLabel(p.method)}</td>
            <td><Pill tone={p.status==='PAID'?'success':p.status==='FAILED'?'danger':'warning'}>{statusLabel(p.status)}</Pill></td>
            <td>{p.providerPaymentId||p.providerOrderId||'—'}</td>
            <td><Pill tone={receiptStatus==='SENT'?'success':receiptStatus==='FAILED'?'danger':'warning'}>{receiptStatus==='NOT_ISSUED'?'Not issued':statusLabel(receiptStatus)}</Pill>{p.receipt?.receiptNumber&&<small>{p.receipt.receiptNumber}</small>}{p.receipt?.sentAt&&<small>{dateTime(p.receipt.sentAt)}</small>}</td>
            <td>{canReceipt?<Button variant="ghost" disabled={receiptBusy===p.id} onClick={()=>sendReceipt(p)}>{receiptBusy===p.id?'Sending…':receiptStatus==='SENT'?'Resend':'Send receipt'}</Button>:'—'}</td>
          </tr>;
        })}
      </RecordTable>}
      {paymentsState.data?.pagination?.total>0&&<div className="p5-toolbar" aria-label="Payment pagination">
        <span className="p5-muted">Page {paymentsState.data.pagination.page} of {paymentsState.data.pagination.pages} · {paymentsState.data.pagination.total} payment records</span>
        <div className="p5-actions">
          <Button variant="ghost" disabled={paymentsState.loading||paymentPage<=1} onClick={()=>setPaymentPage(value=>Math.max(1,value-1))}>Previous</Button>
          <Button variant="ghost" disabled={paymentsState.loading||paymentPage>=paymentsState.data.pagination.pages} onClick={()=>setPaymentPage(value=>value+1)}>Next</Button>
        </div>
      </div>}
    </Panel>
    <Panel title="Gardener payouts" sub="Review payout amounts and status recorded for Gardeners.">
      <State loading={payoutsState.loading} error={payoutsState.error} empty={!payouts.length && !payoutsState.loading && !payoutsState.error} onRetry={payoutsState.load}/>
      {payouts.length > 0 && <RecordTable headers={['Gardener','Amount','Period','Status','Paid at','Created']}>
        {payouts.map(p => <tr key={p.id}><td>{p.gardener?.user?.fullName || 'Gardener'}<small>{p.gardener?.user?.email || ''}</small></td><td>{money(p.amount)}</td><td>{dateOnly(p.periodStart)} – {dateOnly(p.periodEnd)}</td><td><Pill tone={p.status === 'PAID' ? 'success' : 'warning'}>{statusLabel(p.status)}</Pill></td><td>{dateTime(p.paidAt)}</td><td>{dateTime(p.createdAt)}</td></tr>)}
      </RecordTable>}
    </Panel>
  </Shell>;
}

export function AdminServicesPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/services/admin', null, 60000);
  const [form, setForm] = React.useState({ name: '', description: '', category: 'Care', durationLabel: '60 min', durationMinutes: 60, status: 'ACTIVE' });
  const [priceForms, setPriceForms] = React.useState({}); const [editing, setEditing] = React.useState(null); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const services = data?.services || [];
  const saveService = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { const payload = { ...form, durationMinutes: Number(form.durationMinutes) }; await request(editing ? `/services/admin/${editing}` : '/services/admin', { method: editing ? 'PATCH' : 'POST', body: json(payload) }); setEditing(null); setForm({ name: '', description: '', category: 'Care', durationLabel: '60 min', durationMinutes: 60, status: 'ACTIVE' }); setMessage('Service saved.'); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  const addPrice = async (serviceId, e) => { e.preventDefault(); const p = priceForms[serviceId] || { amount: '', minPlants: 1, maxPlants: '' }; setBusy(true); setMessage(''); try { await request(`/services/admin/${serviceId}/prices`, { method: 'POST', body: json({ amount: Number(p.amount), minPlants: p.minPlants === '' ? null : Number(p.minPlants), maxPlants: p.maxPlants === '' ? null : Number(p.maxPlants) }) }); setMessage('Price added.'); setPriceForms(v => ({ ...v, [serviceId]: { amount: '', minPlants: 1, maxPlants: '' } })); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  const deactivate = async s => { if (!window.confirm(`Delete or deactivate ${s.name}?`)) return; try { await request(`/services/admin/${s.id}`, { method: 'DELETE' }); setMessage('Service removed or deactivated based on booking history.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  const editPrice = async (service, price) => {
    const amountText = window.prompt('Price amount in INR', String(price.amount));
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount < 0) { setMessage('Enter a valid non-negative price.'); return; }
    const minText = window.prompt('Minimum plant count (blank = any)', price.minPlants ?? '');
    if (minText === null) return;
    const maxText = window.prompt('Maximum plant count (blank = no limit)', price.maxPlants ?? '');
    if (maxText === null) return;
    try { await request(`/services/admin/${service.id}/prices/${price.id}`, { method: 'PATCH', body: json({ amount, minPlants: minText.trim() ? Number(minText) : null, maxPlants: maxText.trim() ? Number(maxText) : null }) }); setMessage('Price tier updated.'); await load(); } catch (e) { setMessage(errorText(e)); }
  };
  const deletePrice = async (service, price) => { if (!window.confirm(`Delete the ${money(price.amount)} price tier for ${service.name}?`)) return; try { await request(`/services/admin/${service.id}/prices/${price.id}`, { method: 'DELETE' }); setMessage('Price tier deleted.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Service catalogue" sub="Manage customer-visible services, availability and effective price tiers."><Notice error={error || (message && /failed|cannot|invalid|already|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|already|not found/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit service' : 'Create service'}><form onSubmit={saveService}><FormGrid><Field label="Service name"><input required minLength="2" maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field><Field label="Category"><input required maxLength="80" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}/></Field><Field label="Duration label"><input required maxLength="80" value={form.durationLabel} onChange={e => setForm({ ...form, durationLabel: e.target.value })}/></Field><Field label="Duration minutes"><input type="number" min="1" max="1440" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })}/></Field><Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></Field></FormGrid><Field label="Description"><textarea required maxLength="2000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></Field><div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update service' : 'Create service'}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm({ name: '', description: '', category: 'Care', durationLabel: '60 min', durationMinutes: 60, status: 'ACTIVE' }); }}>Cancel</Button>}</div></form></Panel>
    <State loading={loading} error={error} onRetry={load}/>
    {!loading && <div className="p5-record-list">{services.map(s => <Panel key={s.id} title={s.name} sub={`${s.category} · ${s.durationLabel} · ${statusLabel(s.status)}`} action={<div className="p5-actions"><Button variant="ghost" onClick={() => { setEditing(s.id); setForm({ name: s.name, description: s.description, category: s.category, durationLabel: s.durationLabel, durationMinutes: s.durationMinutes || 60, status: s.status }); }}>Edit</Button><Button variant="danger" onClick={() => deactivate(s)}>Delete / deactivate</Button></div>}>
      <p>{s.description}</p><RecordTable headers={['Price', 'Minimum plants', 'Maximum plants', 'Effective from', 'Effective to', 'Actions']}>
        {(s.prices || []).map(p => <tr key={p.id}><td>{money(p.amount)}</td><td>{p.minPlants ?? 'Any'}</td><td>{p.maxPlants ?? 'No limit'}</td><td>{dateOnly(p.effectiveFrom)}</td><td>{p.effectiveTo ? dateOnly(p.effectiveTo) : 'Open ended'}</td><td><div className="p5-actions"><Button variant="ghost" onClick={() => editPrice(s, p)}>Edit</Button><Button variant="danger" onClick={() => deletePrice(s, p)}>Delete</Button></div></td></tr>)}
      </RecordTable>
      <form className="p5-inline-form" onSubmit={e => addPrice(s.id, e)}><Field label="Amount (INR)"><input required type="number" min="0" step="0.01" value={priceForms[s.id]?.amount ?? ''} onChange={e => setPriceForms(v => ({ ...v, [s.id]: { minPlants: 1, maxPlants: '', ...v[s.id], amount: e.target.value } }))}/></Field><Field label="Min plants"><input type="number" min="1" value={priceForms[s.id]?.minPlants ?? 1} onChange={e => setPriceForms(v => ({ ...v, [s.id]: { amount: '', maxPlants: '', ...v[s.id], minPlants: e.target.value } }))}/></Field><Field label="Max plants (optional)"><input type="number" min="1" value={priceForms[s.id]?.maxPlants ?? ''} onChange={e => setPriceForms(v => ({ ...v, [s.id]: { amount: '', minPlants: 1, ...v[s.id], maxPlants: e.target.value } }))}/></Field><Button type="submit" disabled={busy}>Add price tier</Button></form>
    </Panel>)}{!services.length && <Empty title="No services configured" text="Add a service and its prices to make them available for booking."/>}</div>}
  </Shell>;
}

export function AdminAccountManagementPage({ Shell }) {
  const [form, setForm] = React.useState({ fullName: '', email: '', phone: '', role: 'CUSTOMER' });
  const [searchEmail, setSearchEmail] = React.useState('');
  const [customer, setCustomer] = React.useState(null);
  const [credential, setCredential] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const createAccount = async event => {
    event.preventDefault();
    setBusy('create'); setError(''); setMessage(''); setCredential(null);
    try {
      const result = await request('/admin/users', {
        method: 'POST',
        body: json({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          role: form.role
        })
      });
      setCredential({ ...result.user, password: result.temporaryPassword, action: 'created' });
      setForm({ fullName: '', email: '', phone: '', role: 'CUSTOMER' });
      setMessage(`${result.user.role === 'GARDENER' ? 'Gardener' : 'Customer'} account created. Share the temporary password through a trusted channel.`);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy('');
    }
  };

  const findCustomer = async event => {
    event.preventDefault();
    setBusy('lookup'); setError(''); setMessage(''); setCustomer(null); setCredential(null);
    try {
      const result = await request(`/admin/users/lookup?email=${encodeURIComponent(searchEmail.trim())}`);
      setCustomer(result.user);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy('');
    }
  };

  const resetCustomerPassword = async () => {
    if (!customer || !window.confirm(`Generate a new temporary password for ${customer.email}? All active sessions for this Customer will be invalidated.`)) return;
    setBusy('reset'); setError(''); setMessage(''); setCredential(null);
    try {
      const result = await request(`/admin/users/${customer.id}/password-reset`, { method: 'POST', body: '{}' });
      setCredential({ ...result.user, password: result.temporaryPassword, action: 'reset' });
      setMessage('Customer password reset. Share the new temporary password through a trusted channel.');
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy('');
    }
  };

  const copyPassword = async () => {
    if (!credential) return;
    setError(''); setMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(credential.password);
      setMessage('Temporary password copied. Share it through a trusted channel, then clear it from this screen.');
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the temporary password. Select and copy it manually.');
    }
  };

  return <Shell title="Account management" sub="Create accounts and reset Customer passwords.">
    <Notice error={error} success={message}/>
    <div className="p5-columns">
      <Panel title="Create an account" sub="A temporary password will appear once after the account is created.">
        <form onSubmit={createAccount}>
          <FormGrid>
            <Field label="Full name"><input required minLength="2" maxLength="100" autoComplete="name" value={form.fullName} onChange={event => updateForm('fullName', event.target.value)}/></Field>
            <Field label="Email address"><input required type="email" maxLength="254" autoComplete="email" value={form.email} onChange={event => updateForm('email', event.target.value)}/></Field>
            <Field label="Phone number (optional)"><input type="tel" maxLength="20" autoComplete="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)}/></Field>
            <Field label="Account type"><select value={form.role} onChange={event => updateForm('role', event.target.value)}><option value="CUSTOMER">Customer</option><option value="GARDENER">Gardener</option></select></Field>
          </FormGrid>
          <p className="p5-account-security-note">Check the email address before creating the account. Share the temporary password through a trusted channel.</p>
          <div className="p5-actions"><Button type="submit" disabled={Boolean(busy)}><UserPlus size={16}/>{busy === 'create' ? 'Creating account…' : 'Create account'}</Button></div>
        </form>
      </Panel>

      <Panel title="Find a Customer" sub="Search by the Customer's email address to reset their password.">
        <form onSubmit={findCustomer}>
          <Field label="Customer email address"><input required type="email" maxLength="254" autoComplete="email" value={searchEmail} onChange={event => setSearchEmail(event.target.value)}/></Field>
          <div className="p5-actions"><Button type="submit" disabled={Boolean(busy)}>{busy === 'lookup' ? 'Searching…' : 'Find Customer'}</Button></div>
        </form>
        {customer && <div className="p5-account-result">
          <div><b>{customer.fullName}</b><small>{customer.email}</small></div>
          <Pill tone={customer.status === 'ACTIVE' ? 'success' : 'warning'}>{statusLabel(customer.status)}</Pill>
          <Button variant="danger" disabled={Boolean(busy)} onClick={resetCustomerPassword}><KeyRound size={16}/>{busy === 'reset' ? 'Resetting…' : 'Generate new password'}</Button>
        </div>}
      </Panel>
    </div>

    {credential && <Panel title={credential.action === 'created' ? 'Account credentials' : 'New Customer credentials'} sub="Copy this temporary password now. It will not be shown again.">
      <div className="p5-credential-display">
        <div><small>Login email</small><b>{credential.email}</b></div>
        <div><small>Temporary password</small><code>{credential.password}</code></div>
      </div>
      <p className="p5-account-security-note">Share it through a trusted channel, then clear it from this screen.</p>
      <div className="p5-actions"><Button onClick={copyPassword}><Copy size={16}/>Copy temporary password</Button><Button variant="ghost" onClick={() => setCredential(null)}>Clear credentials</Button></div>
    </Panel>}
  </Shell>;
}

export function AdminUsersPage({ Shell, role }) {
  const [search, setSearch] = React.useState(''); const [status, setStatus] = React.useState(''); const path = `/admin/users?limit=100${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const users = data?.users || []; const [message, setMessage] = React.useState('');
  const updateStatus = async (user, next) => { if (user.role === 'ADMIN') return; if (!window.confirm(`Set ${user.fullName} to ${next}?`)) return; try { await request(`/admin/users/${user.id}/status`, { method: 'PATCH', body: json({ status: next }) }); setMessage(`Account status changed to ${next}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title={role === 'GARDENER' ? 'Gardeners' : 'Customers'} sub="Review account status, email verification and recent activity.">
    <Notice error={error || (message && /failed|cannot|not found|forbidden/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|forbidden/i.test(message) ? message : ''}/>
    <div className="p5-toolbar"><input placeholder="Search name, email or phone" value={search} onChange={e => setSearch(e.target.value)}/><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All account statuses</option>{['ACTIVE','PENDING','BLOCKED','INACTIVE'].map(s => <option key={s}>{s}</option>)}</select><Button variant="ghost" onClick={load}>Refresh</Button></div>
    <State loading={loading} error={error} empty={!users.length && !loading && !error} onRetry={load}/>
    {!loading && <RecordTable headers={['User', 'Role', 'Email verified', 'Account status', 'Last login', 'Actions']}>
      {users.map(u => <tr key={u.id}><td><Link to={`/hq/people/${u.id}`}><b>{u.fullName}</b></Link><small>{u.email}</small></td><td>{u.role}</td><td>{u.emailVerifiedAt ? 'Verified' : 'Unverified'}</td><td><Pill tone={u.status === 'ACTIVE' ? 'success' : 'warning'}>{u.status}</Pill></td><td>{dateTime(u.lastLoginAt)}</td><td><div className="p5-actions">{u.status !== 'BLOCKED' ? <Button variant="danger" onClick={() => updateStatus(u, 'BLOCKED')}>Block</Button> : <Button onClick={() => updateStatus(u, 'ACTIVE')}>Activate</Button>}</div></td></tr>)}
    </RecordTable>}
  </Shell>;
}

export function AdminUserDetailPage({ Shell }) {
  const { id } = useParams();
  const { data, loading, error, load } = useLoad(`/admin/users/${id}`, null, 30000);
  const user = data?.user; const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const updateStatus = async status => { if (!user || user.role === 'ADMIN') return; if (!window.confirm(`Change ${user.fullName}'s account status to ${status}?`)) return; setBusy(true); try { await request(`/admin/users/${user.id}/status`, { method: 'PATCH', body: json({ status }) }); setMessage(`Account status changed to ${status}.`); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title={user?.fullName || 'Account details'} sub="Account status and profile details." action={<Link className="p5-button ghost" to={user?.role === 'GARDENER' ? '/hq/crew' : '/hq/people'}>Back to users</Link>}>
    <Notice error={error || (message && /failed|cannot|forbidden|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|forbidden|not found/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {user && <><Panel title="Account information"><FormGrid><div><small>Email</small><b>{user.email}</b></div><div><small>Role</small><b>{user.role}</b></div><div><small>Status</small><Pill>{user.status}</Pill></div><div><small>Email verification</small><Pill tone={user.emailVerifiedAt ? 'success' : 'warning'}>{user.emailVerifiedAt ? 'Verified' : 'Unverified'}</Pill></div><div><small>Created</small><b>{dateTime(user.createdAt)}</b></div><div><small>Last login</small><b>{dateTime(user.lastLoginAt)}</b></div></FormGrid><div className="p5-actions">{user.role !== 'ADMIN' && user.status !== 'BLOCKED' && <Button variant="danger" disabled={busy} onClick={() => updateStatus('BLOCKED')}>Block account</Button>}{user.role !== 'ADMIN' && user.status === 'BLOCKED' && <Button disabled={busy} onClick={() => updateStatus('ACTIVE')}>Reactivate account</Button>}</div></Panel>
      {user.customerProfile && <><Panel title="Customer addresses">{user.customerProfile.addresses?.length ? user.customerProfile.addresses.map(a => <div className="p5-list-row" key={a.id}><b>{a.label}</b><small>{a.line1}, {a.city}, {a.state} {a.postalCode}</small></div>) : <Empty/>}</Panel><Panel title="Customer plants">{user.customerProfile.plants?.length ? user.customerProfile.plants.map(p => <div className="p5-list-row" key={p.id}><b>{p.name}</b><small>{p.type || 'Plant'} · {statusLabel(p.healthStatus)}</small></div>) : <Empty/>}</Panel></>}
      {user.gardenerProfile && <Panel title="Gardener profile"><FormGrid><div><small>Identity verification</small><Pill>{statusLabel(user.gardenerProfile.kycStatus)}</Pill></div><div><small>Service area</small><b>{user.gardenerProfile.serviceArea || 'Not provided'}</b></div><div><small>Rating</small><b>{user.gardenerProfile.rating == null ? '—' : Number(user.gardenerProfile.rating).toFixed(1)}</b></div></FormGrid><p>{user.gardenerProfile.bio || 'No professional bio provided.'}</p><Link to="/hq/crew">Review identity documents →</Link></Panel>}
    </>}
  </Shell>;
}

export function AdminGardenersKycPage({ Shell }) {
  const [status, setStatus] = React.useState(''); const [search, setSearch] = React.useState(''); const path = `/admin/gardeners?limit=100${status ? `&kycStatus=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const gardeners = data?.gardeners || []; const [message, setMessage] = React.useState(''); const [review, setReview] = React.useState({});
  const decide = async (g, kycStatus) => { if (kycStatus === 'VERIFIED' && !(g.kycDocuments || []).length) { setMessage(`Cannot verify ${g.user.fullName}: no identity documents have been submitted.`); return; } if (!window.confirm(`${kycStatus === 'VERIFIED' ? 'Approve' : kycStatus === 'REJECTED' ? 'Reject' : 'Mark pending'} identity verification for ${g.user.fullName}?`)) return; try { await request(`/admin/gardeners/${g.id}/kyc`, { method: 'PATCH', body: json({ kycStatus, note: review[g.id] || '' }) }); setMessage(`Identity verification updated for ${g.user.fullName}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Gardener verification" sub="Review identity documents and approve or decline Gardener verification."><Notice error={error || (message && /cannot|failed|not found|required/i.test(message) ? message : '')} success={message && !/cannot|failed|not found|required/i.test(message) ? message : ''}/>
    <div className="p5-toolbar"><input placeholder="Search gardeners" value={search} onChange={e => setSearch(e.target.value)}/><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All verification statuses</option>{['NOT_STARTED','PENDING','VERIFIED','REJECTED'].map(s => <option key={s}>{statusLabel(s)}</option>)}</select></div>
    <State loading={loading} error={error} empty={!gardeners.length && !loading && !error} onRetry={load}/>
    {gardeners.map(g => <Panel key={g.id} title={g.user.fullName} sub={`${g.user.email} · ${g.user.phone || 'No phone'} · ${g.serviceArea || 'No service area'}`} action={<div className="p5-actions"><Pill>{`KYC ${statusLabel(g.kycStatus)}`}</Pill><Pill tone={g.user.status === 'ACTIVE' ? 'success' : 'warning'}>{`Account ${statusLabel(g.user.status)}`}</Pill></div>}>
      <div className="p5-record-list">{(g.kycDocuments || []).map(d => <div key={d.id} className="p5-list-row"><div><b>{statusLabel(d.documentType)}</b><small>{d.originalFileName} · {dateOnly(d.createdAt)}</small></div><Pill>{statusLabel(d.status)}</Pill><Button variant="ghost" onClick={() => { const preview = window.open('about:blank', '_blank'); request(`/media/${d.mediaAssetId}`).then(result => { if (preview) preview.location.href = result.url; }).catch(e => { preview?.close(); setMessage(errorText(e)); }); }}>View document</Button></div>)}{!g.kycDocuments?.length && <Empty title="No identity documents" text="This Gardener has not submitted any documents."/>}</div>
      <Field label="Review note"><textarea maxLength="1000" value={review[g.id] || ''} onChange={e => setReview(v => ({ ...v, [g.id]: e.target.value }))} placeholder="Reason for approval or rejection"/></Field>
      <div className="p5-actions"><Button onClick={() => decide(g, 'VERIFIED')}>Approve verification</Button><Button variant="danger" onClick={() => decide(g, 'REJECTED')}>Decline verification</Button><Button variant="ghost" onClick={() => decide(g, 'PENDING')}>Mark pending</Button></div>
    </Panel>)}
  </Shell>;
}

export function GardenerKycDocumentsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/gardener/kyc/documents'); const [type, setType] = React.useState('GOVERNMENT_ID'); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const documents = data?.documents || [];
  const submit = async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setMessage(''); try { const profile = await request('/gardener/profile'); const asset = await uploadToStorage(file, { kind: 'KYC_DOCUMENT', targetType: 'KYC_DOCUMENT', targetId: profile.profile.id }); await request('/gardener/kyc/documents', { method: 'POST', body: json({ documentType: type, mediaAssetId: asset.id, originalFileName: file.name }) }); setMessage('Document submitted for review.'); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); e.target.value = ''; } };
  const removeDocument = async d => { if (!window.confirm(`Remove ${d.originalFileName} from your KYC submission?`)) return; try { await request(`/gardener/kyc/documents/${d.id}`, { method: 'DELETE' }); setMessage('KYC document removed.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Identity verification" sub="Submit your documents for review."><Notice error={error || (message && /failed|cannot|not supported|invalid|missing/i.test(message) ? message : '')} success={message && !/failed|cannot|not supported|invalid|missing/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    <Panel title="Upload a document" sub="Upload a clear image or PDF (up to 10 MB)."><Field label="Document type"><select value={type} onChange={e => setType(e.target.value)}><option value="GOVERNMENT_ID">Government identity document</option><option value="ADDRESS_PROOF">Address proof</option><option value="PROFESSIONAL_CERTIFICATE">Professional certificate</option><option value="OTHER">Other supporting document</option></select></Field><label className="p5-button primary">{busy ? 'Uploading…' : 'Choose a file'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={submit} disabled={busy}/></label></Panel>
    <Panel title="Your documents">{documents.length ? documents.map(d => <div className="p5-list-row" key={d.id}><div><b>{statusLabel(d.documentType)}</b><small>{d.originalFileName} · {dateTime(d.createdAt)}</small>{d.reviewNote && <small>Review note: {d.reviewNote}</small>}</div><Pill>{statusLabel(d.status)}</Pill>{d.status !== 'VERIFIED' && <Button variant="danger" onClick={() => removeDocument(d)}>Remove</Button>}</div>) : <Empty title="No documents submitted" text="Upload an identity document to begin verification."/>}</Panel>
  </Shell>;
}

export function AdminBookingsPage({ Shell }) {
  const [filter, setFilter] = React.useState(''); const [search, setSearch] = React.useState(''); const path = `/admin/bookings?limit=100${filter ? `&status=${filter}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const bookings = data?.bookings || []; const [gardeners, setGardeners] = React.useState([]); const [message, setMessage] = React.useState('');
  React.useEffect(() => { request('/admin/gardeners?limit=100&kycStatus=VERIFIED').then(d => setGardeners(d.gardeners || [])).catch(() => setGardeners([])); }, []);
  const assign = async (bookingId, gardenerId) => { if (!gardenerId) return; try { await request(`/admin/bookings/${bookingId}/assign`, { method: 'POST', body: json({ gardenerId }) }); setMessage('Gardener assignment saved.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  const transitions = { CONFIRMED: ['CANCELLED'], GARDENER_ASSIGNED: ['CONFIRMED','CANCELLED'], GARDENER_ACCEPTED: ['CANCELLED'], ON_THE_WAY: ['CANCELLED'], ARRIVED: ['CANCELLED'], SERVICE_STARTED: [], SERVICE_COMPLETED: [], CANCELLED: [] };
  const changeStatus = async (booking, status) => { try { await request(`/admin/bookings/${booking.id}/status`, { method: 'PATCH', body: json({ status, note: 'Booking status updated by T-CARE.' }) }); setMessage(`Booking status changed to ${statusLabel(status)}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Bookings" sub="Review booking details, assign verified Gardeners and update status."><Notice error={error || (message && /failed|cannot|invalid|not found|kyc/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|kyc/i.test(message) ? message : ''}/>
    <div className="p5-toolbar"><input placeholder="Search reference or customer" value={search} onChange={e => setSearch(e.target.value)}/><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{['CONFIRMED','GARDENER_ASSIGNED','GARDENER_ACCEPTED','ON_THE_WAY','ARRIVED','SERVICE_STARTED','SERVICE_COMPLETED','CANCELLED'].map(s => <option key={s}>{s}</option>)}</select></div>
    <State loading={loading} error={error} empty={!bookings.length && !loading && !error} onRetry={load}/>
    {bookings.map(b => <Panel key={b.id} title={`${b.reference} · ${b.service?.name}`} sub={`${b.customer?.user?.fullName} · ${b.customer?.user?.email} · ${dateTime(b.scheduledStart)}`} action={<Pill>{statusLabel(b.status)}</Pill>}>
      <p>{b.address?.line1}, {b.address?.city} · {b.plants?.length || 0} plants · {money(b.total)}</p>
      <p>{b.plants?.map(x => x.plant?.name).join(', ')}</p>
      <div className="p5-inline-form"><Field label="Assign verified Gardener"><select value={b.assignment?.gardenerId || ''} onChange={e => assign(b.id, e.target.value)}><option value="">Select Gardener</option>{gardeners.filter(g => g.user.status === 'ACTIVE').map(g => <option key={g.id} value={g.id}>{g.user.fullName} · {g.serviceArea || 'No area'}</option>)}</select></Field><div className="p5-actions">{(transitions[b.status] || []).map(s => <Button key={s} variant={s === 'CANCELLED' ? 'danger' : 'ghost'} onClick={() => changeStatus(b, s)}>{statusLabel(s)}</Button>)}</div></div>
      {b.assignment && <small>Assigned to {b.assignment.gardener?.user?.fullName} · {statusLabel(b.assignment.status)}</small>}
    </Panel>)}
  </Shell>;
}

export function AdminReviewsIssuesPage({ Shell, mode = 'reviews' }) {
  const [filter, setFilter] = React.useState(''); const path = mode === 'reviews' ? `/reviews-issues/admin/reviews${filter ? `?status=${filter}` : ''}` : `/reviews-issues/admin/issues${filter ? `?status=${filter}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 30000); const rows = mode === 'reviews' ? data?.reviews || [] : data?.issues || []; const [message, setMessage] = React.useState('');
  const update = async (item, status) => { try { await request(mode === 'reviews' ? `/reviews-issues/admin/reviews/${item.id}` : `/reviews-issues/admin/issues/${item.id}`, { method: 'PATCH', body: json({ status }) }); setMessage(`${mode === 'reviews' ? 'Review' : 'Issue'} updated.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  const options = mode === 'reviews' ? ['PENDING','PUBLISHED','HIDDEN'] : ['OPEN','IN_REVIEW','RESOLVED','CLOSED'];
  return <Shell title={mode === 'reviews' ? 'Customer reviews' : 'Customer issues'} sub={mode === 'reviews' ? 'Review feedback and choose which reviews appear publicly.' : 'Review customer reports and update their status.'}><Notice error={error || (message && /failed|cannot|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid/i.test(message) ? message : ''}/>
    <div className="p5-toolbar"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{options.map(x => <option key={x}>{x}</option>)}</select></div>
    <State loading={loading} error={error} empty={!rows.length && !loading && !error} onRetry={load}/>
    {rows.map(item => <Panel key={item.id} title={mode === 'reviews' ? `${item.rating}/5 · ${item.booking?.service?.name || 'Service review'}` : item.subject} sub={`${item.customer?.user?.fullName || 'Customer'} · ${item.customer?.user?.email || ''} · ${dateTime(item.createdAt)}`} action={<Pill>{statusLabel(item.status)}</Pill>}>
      <p>{mode === 'reviews' ? item.comment || 'No written comment.' : item.description}</p>
      {item.booking && <small>Booking: {item.booking.reference || item.booking.id} · {item.booking.service?.name}</small>}
      <div className="p5-actions">{options.map(s => <Button key={s} variant={s === 'HIDDEN' || s === 'CLOSED' ? 'danger' : 'ghost'} onClick={() => update(item, s)}>{statusLabel(s)}</Button>)}</div>
    </Panel>)}
  </Shell>;
}

export function AdminCmsPage({ Shell }) {
  const [status, setStatus] = React.useState(''); const [search, setSearch] = React.useState(''); const path = `/cms/admin?limit=100${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 60000); const items = data?.items || []; const [form, setForm] = React.useState({ key: '', title: '', body: '', status: 'DRAFT' }); const [editing, setEditing] = React.useState(null); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const save = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request(editing ? `/cms/admin/${editing}` : '/cms/admin', { method: editing ? 'PATCH' : 'POST', body: json(form) }); setEditing(null); setForm({ key: '', title: '', body: '', status: 'DRAFT' }); setMessage('CMS content saved.'); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  const statusAction = async (id, action) => { try { await request(`/cms/admin/${id}/${action}`, { method: 'POST', body: '{}' }); setMessage(action === 'publish' ? 'Content published.' : 'Content archived.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Content management" sub="Publish new content or archive outdated items."><Notice error={error || (message && /failed|cannot|exists|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|exists|not found|invalid/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit content' : 'New content'}><form onSubmit={save}><FormGrid><Field label="Unique key"><input required maxLength="120" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} disabled={!!editing}/></Field><Field label="Title"><input required maxLength="200" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></Field><Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></Field></FormGrid><Field label="Body"><textarea required maxLength="50000" rows={7} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}/></Field><div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save content'}</Button>{editing && <Button variant="ghost" onClick={() => setEditing(null)}>Cancel edit</Button>}</div></form></Panel>
    <div className="p5-toolbar"><input placeholder="Search content" value={search} onChange={e => setSearch(e.target.value)}/><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['DRAFT','PUBLISHED','ARCHIVED'].map(s => <option key={s}>{s}</option>)}</select></div>
    <State loading={loading} error={error} empty={!items.length && !loading && !error} onRetry={load}/>
    {items.map(item => <Panel key={item.id} title={item.title} sub={`${item.key} · ${statusLabel(item.status)} · Updated ${dateOnly(item.updatedAt)}`}><p className="p5-body-preview">{item.body}</p><div className="p5-actions"><Button variant="ghost" onClick={() => { setEditing(item.id); setForm({ key: item.key, title: item.title, body: item.body, status: item.status }); }}>Edit</Button>{item.status !== 'PUBLISHED' && <Button onClick={() => statusAction(item.id, 'publish')}>Publish</Button>}{item.status !== 'ARCHIVED' && <Button variant="danger" onClick={() => statusAction(item.id, 'archive')}>Archive</Button>}</div></Panel>)}
  </Shell>;
}

export function AdminAnalyticsPage({ Shell }) {
  const [range, setRange] = React.useState(90);
  const { from, to } = React.useMemo(() => { const end = new Date(); return { from: new Date(end.getTime() - range * 86400000).toISOString(), to: end.toISOString() }; }, [range]);
  const analyticsPath = `/analytics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { data, loading, error, load } = useLoad(analyticsPath); const o = data?.overview;
  const [series, setSeries] = React.useState({ bookings: [], revenue: [], gardeners: [] }); const [seriesError, setSeriesError] = React.useState('');
  React.useEffect(() => { let live = true; setSeriesError(''); Promise.all([request(`/analytics/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), request(`/analytics/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), request('/analytics/gardeners')]).then(([b,r,g]) => { if (live) setSeries({ bookings: b.rows || [], revenue: r.rows || [], gardeners: g.gardeners || [] }); }).catch(e => { if (live) setSeriesError(errorText(e)); }); return () => { live = false; }; }, [from, to]);
  const labels = [['Users',o?.users],['Customers',o?.customers],['Gardeners',o?.gardeners],['Bookings',o?.bookings],['Completed',o?.completedBookings],['Cancelled',o?.cancelledBookings],['Paid volume',money(o?.grossPaid)],['Issues',o?.issues],['Reviews',o?.reviews]];
  return <Shell title="Analytics" sub="Review bookings, payments and Gardener activity over time."><Notice error={seriesError}/><div className="p5-toolbar"><select value={range} onChange={e => setRange(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option><option value={365}>Last 365 days</option></select></div><State loading={loading} error={error} onRetry={load}/>{o && <div className="p5-metric-grid">{labels.map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value ?? 0}</b></div>)}</div>}
    <div className="p5-columns"><Panel title="Booking activity" sub={`${series.bookings.length} daily data points`}>{series.bookings.length ? <RecordTable headers={['Day','Bookings','Completed','Cancelled']}>{series.bookings.map(r => <tr key={String(r.day)}><td>{dateOnly(r.day)}</td><td>{r.total}</td><td>{r.completed}</td><td>{r.cancelled}</td></tr>)}</RecordTable> : <Empty title="No booking activity in this range"/>}</Panel><Panel title="Gardener performance" sub="Assignments, ratings and identity verification">{series.gardeners.length ? <RecordTable headers={['Gardener','Assignments','Rating','KYC']}>
      {series.gardeners.map(g => <tr key={g.id}><td>{g.user?.fullName}</td><td>{g._count?.assignments || 0}</td><td>{g.rating == null ? '—' : Number(g.rating).toFixed(1)}</td><td>{statusLabel(g.kycStatus)}</td></tr>)}</RecordTable> : <Empty/>}</Panel></div>
    <Panel title="Payments and refunds" sub="Confirmed payments and recorded refunds.">{series.revenue.length ? <RecordTable headers={['Day','Paid volume','Refunded']}>{series.revenue.map(r => <tr key={String(r.day)}><td>{dateOnly(r.day)}</td><td>{money(r.paid)}</td><td>{money(r.refunded)}</td></tr>)}</RecordTable> : <Empty title="No payment activity in this period"/>}</Panel>
  </Shell>;
}

export function AdminPlantKnowledgePage({ Shell }) {
  const { data, loading, error, load } = useLoad('/admin/plant-knowledge?limit=100', null, 60000); const items = data?.items || [];
  const trackedPlantsState = useLoad('/admin/plants?limit=100', null, 30000);
  const trackedPlants = trackedPlantsState.data?.plants || [];
  const [form, setForm] = React.useState({ commonName: '', scientificName: '', category: '', watering: '', light: '', feeding: '', notes: '' }); const [editing, setEditing] = React.useState(null); const [message, setMessage] = React.useState('');
  const save = async e => { e.preventDefault(); try { await request(editing ? `/admin/plant-knowledge/${editing}` : '/admin/plant-knowledge', { method: editing ? 'PATCH' : 'POST', body: json(form) }); setMessage('Plant knowledge saved.'); setEditing(null); setForm({ commonName: '', scientificName: '', category: '', watering: '', light: '', feeding: '', notes: '' }); await load(); } catch (e2) { setMessage(errorText(e2)); } };
  const del = async item => { if (!window.confirm(`Delete knowledge record for ${item.commonName}?`)) return; try { await request(`/admin/plant-knowledge/${item.id}`, { method: 'DELETE' }); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Plant care library" sub="Manage plant-care guidance and view customer plant updates."><Notice error={error || (message && /failed|cannot|exists|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|exists|not found/i.test(message) ? message : ''}/><Panel title={editing ? 'Edit plant guidance' : 'Add plant guidance'}><form onSubmit={save}><FormGrid>{['commonName','scientificName','category','watering','light','feeding'].map(k => <Field label={statusLabel(k)} key={k}><input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}/></Field>)}</FormGrid><Field label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field><Button type="submit">Save guidance</Button></form></Panel><State loading={loading} error={error} empty={!items.length && !loading && !error} onRetry={load}/>{items.map(item => <div className="p5-list-row" key={item.id}><div><b>{item.commonName}</b><small>{item.scientificName} · {item.category}</small></div><div className="p5-actions"><Button variant="ghost" onClick={() => { setEditing(item.id); setForm(Object.fromEntries(Object.keys(form).map(k => [k, item[k] || '']))); }}>Edit</Button><Button variant="danger" onClick={() => del(item)}>Delete</Button></div></div>)}
    <Panel title="Customer plants" sub="Customer plant health and upcoming care dates."><State loading={trackedPlantsState.loading} error={trackedPlantsState.error} empty={!trackedPlants.length && !trackedPlantsState.loading && !trackedPlantsState.error} onRetry={trackedPlantsState.load}/>{trackedPlants.length > 0 && <RecordTable headers={['Plant','Customer','Health','Next care','Last updated']}>{trackedPlants.map(plant => <tr key={plant.id}><td><b>{plant.name}</b><small>{plant.type || 'Plant'}</small></td><td>{plant.customer?.user?.fullName || 'Customer'}<small>{plant.customer?.user?.email || ''}</small></td><td><Pill>{statusLabel(plant.healthStatus)}</Pill></td><td>{dateOnly(plant.nextCareAt)}</td><td>{dateTime(plant.updatedAt)}</td></tr>)}</RecordTable>}</Panel>
  </Shell>;
}



function StoreSettingsAdminPanel() {
  const { data, loading, error, load } = useLoad('/orders/admin/settings', null);
  const [shippingFee, setShippingFee] = React.useState('0.00');
  const [taxRatePercent, setTaxRatePercent] = React.useState('0');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  React.useEffect(() => {
    if (data?.settings) {
      setShippingFee(String(data.settings.shippingFee));
      setTaxRatePercent(String(data.settings.taxRatePercent));
    }
  }, [data?.settings?.shippingFee, data?.settings?.taxRatePercent]);
  const save = async event => {
    event.preventDefault();
    const shipping = shippingFee.trim();
    const tax = taxRatePercent.trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(shipping) || !/^\d{1,3}(?:\.\d{1,2})?$/.test(tax) || Number(tax) > 100) {
      setMessage('Enter a valid non-negative shipping fee and a tax rate from 0% to 100%.'); return;
    }
    setSaving(true); setMessage('');
    try {
      await request('/orders/admin/settings', { method: 'PUT', body: json({ shippingFee: shipping, taxRatePercent: tax }) });
      setMessage('Store pricing settings saved. New checkouts will use these values.'); await load();
    } catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  };
  return <Panel title="Store pricing" sub="Admin controls shipping and tax for new orders. Existing orders retain their original price snapshots.">
    <State loading={loading} error={error} onRetry={load}/>
    <Notice error={message && /failed|cannot|invalid|not found|enter/i.test(message) ? message : ''} success={message && !/failed|cannot|invalid|not found|enter/i.test(message) ? message : ''}/>
    {!loading && !error && <form onSubmit={save}>
      <FormGrid>
        <Field label="Shipping fee (INR)"><input type="number" min="0" max="1000000" step="0.01" value={shippingFee} onChange={event => setShippingFee(event.target.value)}/></Field>
        <Field label="Tax rate (%)"><input type="number" min="0" max="100" step="0.01" value={taxRatePercent} onChange={event => setTaxRatePercent(event.target.value)}/></Field>
      </FormGrid>
      <div className="p5-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save store pricing'}</Button></div>
      <small className="p5-muted">Default shipping is free and the default tax rate is 0% until configured. Use only rates approved for T-CARE.</small>
    </form>}
  </Panel>;
}

function StoreOrdersAdminPanel() {
  const { data, loading, error, load } = useLoad('/orders/admin', null, 30000);
  const orders = data?.orders || [];
  const [busy, setBusy] = React.useState('');
  const [message, setMessage] = React.useState('');
  const update = async (order, status) => {
    let trackingNumber; let carrier;
    if (status === 'SHIPPED') {
      trackingNumber = window.prompt(`Tracking number for ${order.orderNumber}:`);
      if (!trackingNumber?.trim()) { setMessage('A tracking number is required before shipment.'); return; }
      carrier = window.prompt('Courier / carrier name (optional):') || '';
    }
    if (!window.confirm(`Move ${order.orderNumber} to ${status.replaceAll('_', ' ')}?`)) return;
    setBusy(order.id); setMessage('');
    try {
      await request(`/orders/admin/${encodeURIComponent(order.id)}/fulfillment`, { method: 'PATCH', body: json({ status, ...(trackingNumber ? { trackingNumber: trackingNumber.trim() } : {}), ...(carrier !== undefined ? { carrier: carrier.trim() || null } : {}) }) });
      setMessage(`${order.orderNumber} updated.`); await load();
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(''); }
  };
  const refund = async order => {
    if (!order.payment?.id) { setMessage('No payment record is linked to this order.'); return; }
    if (!window.confirm(`Request a full refund for ${order.orderNumber}? This sends a real refund request to Razorpay.`)) return;
    setBusy(order.id); setMessage('');
    try {
      const result = await request(`/payments/admin/${encodeURIComponent(order.payment.id)}/refund`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: json({ reason: `Plant Store order ${order.orderNumber} refund` })
      });
      setMessage(result.refund?.status === 'REFUNDED' ? `${order.orderNumber}: refund processed.` : `${order.orderNumber}: refund request submitted and awaiting provider confirmation.`);
      await load();
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(''); }
  };
  return <Panel title="Customer orders" sub={`${orders.length} recent orders. Paid orders move through processing, shipment and delivery.`} action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
    <Notice error={message && /failed|cannot|invalid|not found|must|could not/i.test(message) ? message : ''} success={message && !/failed|cannot|invalid|not found|must|could not/i.test(message) ? message : ''}/>
    <State loading={loading} error={error} empty={!orders.length && !loading && !error} onRetry={load}/>
    {!!orders.length && <RecordTable headers={['Order','Customer','Items','Total','Status','Fulfilment']}>
      {orders.map(order => <tr key={order.id}>
        <td><b>{order.orderNumber}</b><small>{dateTime(order.createdAt)}</small></td>
        <td>{order.customer?.name || order.recipientName}<small>{order.customer?.email || order.recipientEmail}</small><small>{order.recipientPhone}</small></td>
        <td>{order.items.map(item => `${item.name} × ${item.quantity}`).join(', ')}</td>
        <td><b>{money(order.total)}</b><small>Tax {money(order.taxAmount)} · Shipping {money(order.shippingFee)}</small></td>
        <td><Pill tone={['PAID','PROCESSING','SHIPPED','DELIVERED'].includes(order.status) ? 'good' : order.status === 'PAYMENT_REVIEW' ? 'bad' : ''}>{statusLabel(order.status)}</Pill><small>Payment: {statusLabel(order.payment?.status)}</small></td>
        <td><div className="p5-actions">
          {order.status === 'PAID' && <><Button disabled={busy === order.id} onClick={() => update(order, 'PROCESSING')}>Start processing</Button><Button variant="danger" disabled={busy === order.id || !['PAID','PARTIALLY_REFUNDED'].includes(order.payment?.status)} onClick={() => refund(order)}>Refund</Button></>}
          {order.status === 'PROCESSING' && <Button disabled={busy === order.id} onClick={() => update(order, 'SHIPPED')}>Mark shipped</Button>}
          {order.status === 'SHIPPED' && <Button disabled={busy === order.id} onClick={() => update(order, 'DELIVERED')}>Mark delivered</Button>}
          {order.status === 'PAYMENT_REVIEW' && <><small>Review captured payment; stock reservation had ended. Confirm stock and contact the customer before fulfilment.</small><Button variant="danger" disabled={busy === order.id || !['PAID','PARTIALLY_REFUNDED'].includes(order.payment?.status)} onClick={() => refund(order)}>Request full refund</Button></>}
          {order.trackingNumber && <small>Tracking: {order.carrier ? `${order.carrier} · ` : ''}{order.trackingNumber}</small>}
          {!['PAID','PROCESSING','SHIPPED','PAYMENT_REVIEW'].includes(order.status) && <small>No fulfilment action available.</small>}
        </div></td>
      </tr>)}
    </RecordTable>}
  </Panel>;
}

export function AdminProductsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/products/admin', null, 30000);
  const products = data?.products || [];
  const initialForm = { sku: '', name: '', description: '', category: '', kind: '', imageUrl: '', careInstructions: '', lightRequirements: '', wateringFrequency: '', safetyNote: '', potColor: '', price: '', compareAtPrice: '', stockQuantity: '0', status: 'ACTIVE' };
  const [form, setForm] = React.useState(initialForm);
  const [editing, setEditing] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [movementProduct, setMovementProduct] = React.useState(null);
  const [movements, setMovements] = React.useState([]);
  const [movementLoading, setMovementLoading] = React.useState(false);
  const save = async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    const payload = {
      sku: form.sku.trim(), name: form.name.trim(), description: form.description.trim(), category: form.category.trim(),
      kind: form.kind.trim() || null, imageUrl: form.imageUrl.trim() || null, careInstructions: form.careInstructions.trim() || null, lightRequirements: form.lightRequirements.trim() || null, wateringFrequency: form.wateringFrequency.trim() || null, safetyNote: form.safetyNote.trim() || null, potColor: form.potColor.trim() || null,
      price: Number(form.price), compareAtPrice: form.compareAtPrice === '' ? null : Number(form.compareAtPrice),
      status: form.status
    };
    if (!editing) payload.stockQuantity = Number(form.stockQuantity);
    try {
      await request(editing ? `/products/admin/${editing}` : '/products/admin', { method: editing ? 'PATCH' : 'POST', body: json(payload) });
      setMessage(editing ? 'Product details updated.' : 'Product created.'); setEditing(null); setForm(initialForm); await load();
    } catch (e2) { setMessage(errorText(e2)); }
    finally { setBusy(false); }
  };
  const edit = product => {
    setEditing(product.id);
    setForm({ sku: product.sku, name: product.name, description: product.description || '', category: product.category, kind: product.kind || '', imageUrl: product.imageUrl || '', careInstructions: product.careInstructions || '', lightRequirements: product.lightRequirements || '', wateringFrequency: product.wateringFrequency || '', safetyNote: product.safetyNote || '', potColor: product.potColor || '', price: String(product.price), compareAtPrice: product.compareAtPrice == null ? '' : String(product.compareAtPrice), stockQuantity: String(product.stockQuantity), status: product.status });
  };
  const adjustStock = async product => {
    const deltaText = window.prompt(`Current stock: ${product.stockQuantity}. Enter a positive number to add or a negative number to remove.`);
    if (deltaText === null) return;
    const delta = Number(deltaText);
    if (!Number.isSafeInteger(delta) || delta === 0) { setMessage('Enter a non-zero whole number for the stock change.'); return; }
    const reason = window.prompt('Reason for this stock movement (required):', 'Stock count adjustment');
    if (reason === null) return;
    try {
      await request(`/products/admin/${product.id}/stock`, { method: 'POST', body: json({ delta, reason }) });
      setMessage('Stock movement recorded.'); await load();
    } catch (e) { setMessage(errorText(e)); }
  };
  const deactivate = async product => {
    if (!window.confirm(`Deactivate ${product.name}? It will no longer appear in the public store.`)) return;
    try { await request(`/products/admin/${product.id}`, { method: 'DELETE' }); setMessage('Product deactivated; inventory history is preserved.'); await load(); }
    catch (e) { setMessage(errorText(e)); }
  };
  const viewMovements = async product => {
    setMovementLoading(true); setMovementProduct(product);
    try { const result = await request(`/products/admin/${product.id}/stock-movements`); setMovements(result.movements || []); }
    catch (e) { setMessage(errorText(e)); setMovements([]); }
    finally { setMovementLoading(false); }
  };
  return <Shell title="Plant store" sub="Manage product information, inventory, store pricing and customer orders.">
    <Notice error={error || (message && /failed|cannot|invalid|not found|insufficient|must/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|insufficient|must/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit product details' : 'Add a product'} sub="Product details do not change stock. Use Adjust stock to update inventory.">
      <form onSubmit={save}>
        <FormGrid>
          <Field label="SKU"><input required minLength="2" maxLength="80" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}/></Field>
          <Field label="Product name"><input required minLength="2" maxLength="160" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
          <Field label="Category"><input required minLength="2" maxLength="80" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}/></Field>
          <Field label="Illustration type (optional)"><input maxLength="40" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} placeholder="e.g. monstera"/></Field>
          <Field label="Image URL (optional)"><input type="url" maxLength="2000" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}/></Field>
          <Field label="Light requirements (optional)"><input maxLength="500" value={form.lightRequirements} onChange={e => setForm({ ...form, lightRequirements: e.target.value })}/></Field>
          <Field label="Watering frequency (optional)"><input maxLength="500" value={form.wateringFrequency} onChange={e => setForm({ ...form, wateringFrequency: e.target.value })}/></Field>
          <Field label="Safety note (optional)"><input maxLength="500" value={form.safetyNote} onChange={e => setForm({ ...form, safetyNote: e.target.value })}/></Field>
          <Field label="Pot colour (optional)"><input maxLength="40" value={form.potColor} onChange={e => setForm({ ...form, potColor: e.target.value })}/></Field>
          <Field label="Selling price (INR)"><input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></Field>
          <Field label="Compare-at price (optional)"><input type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={e => setForm({ ...form, compareAtPrice: e.target.value })}/></Field>
          {!editing && <Field label="Opening stock"><input required type="number" min="0" max="100000" step="1" value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: e.target.value })}/></Field>}
          <Field label="Publication status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></Field>
        </FormGrid>
        <Field label="Description"><textarea maxLength="5000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></Field>
        <Field label="Care instructions (optional)"><textarea maxLength="3000" value={form.careInstructions} onChange={e => setForm({ ...form, careInstructions: e.target.value })}/></Field>
        <div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save product details' : 'Create product'}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(initialForm); }}>Cancel</Button>}</div>
      </form>
    </Panel>
    <Panel title="Inventory" sub={`${products.length} products`} action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      <State loading={loading} error={error} empty={!products.length && !loading && !error} onRetry={load}/>
      {!!products.length && <RecordTable headers={['Product','SKU / category','Price','Stock','Status','Actions']}>
        {products.map(product => <tr key={product.id}>
          <td><b>{product.name}</b><small>{product.imageUrl ? 'Custom image configured' : 'No custom image'}</small></td>
          <td>{product.sku}<small>{product.category}</small></td>
          <td>{money(product.price)}{product.compareAtPrice != null && <small>Compare at {money(product.compareAtPrice)}</small>}</td>
          <td><b>{product.stockQuantity}</b></td><td><Pill tone={product.status === 'ACTIVE' ? 'good' : ''}>{statusLabel(product.status)}</Pill></td>
          <td><div className="p5-actions"><Button variant="ghost" onClick={() => edit(product)}>Edit</Button><Button variant="ghost" onClick={() => adjustStock(product)}>Adjust stock</Button><Button variant="ghost" onClick={() => viewMovements(product)}>Stock history</Button>{product.status === 'ACTIVE' && <Button variant="danger" onClick={() => deactivate(product)}>Deactivate</Button>}</div></td>
        </tr>)}
      </RecordTable>}
    </Panel>
    {movementProduct && <Panel title={`Stock history · ${movementProduct.name}`} sub={`${movements.length} recent adjustments`} action={<Button variant="ghost" onClick={() => setMovementProduct(null)}>Close</Button>}>
      {movementLoading ? <State loading/> : movements.length ? <RecordTable headers={['Date','Change','Reason','Updated by']}>{movements.map(item => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td><b>{item.quantityChange > 0 ? '+' : ''}{item.quantityChange}</b></td><td>{item.reason}</td><td>{item.actorUserId || 'System'}</td></tr>)}</RecordTable> : <Empty title="No stock adjustments yet"/>}
    </Panel>}
    <StoreOrdersAdminPanel/>
    <StoreSettingsAdminPanel/>
  </Shell>;
}

export function OutOfScopePage({ Shell, title = 'Not available', sub = 'This feature is not available yet.' }) {
  return <Shell title={title} sub={sub}><Panel title="Not available yet"/></Shell>;
}
