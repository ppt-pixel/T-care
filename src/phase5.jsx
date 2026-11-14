import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_V1 } from './phase5Api.js';
import './phase5.css';

async function request(path, options = {}) {
  const response = await fetch(`${API_V1}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw || 'Unexpected server response.' }; }
  if (!response.ok) {
    const error = new Error(data.message || data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = data.error;
    error.details = data.details;
    throw error;
  }
  return data;
}
const json = value => JSON.stringify(value);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const dateTime = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not scheduled';
const dateOnly = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';
const statusLabel = value => String(value || 'UNKNOWN').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const errorText = error => error?.message || 'Something went wrong. Please try again.';

function Notice({ error, success }) {
  if (!error && !success) return null;
  return <div className={`p5-notice ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>{error || success}</div>;
}
function State({ loading, error, empty, onRetry }) {
  if (loading) return <div className="p5-state"><span className="p5-spinner"/>Loading live T-CARE data…</div>;
  if (error) return <div className="p5-state p5-error"><b>Unable to load this section</b><p>{error}</p><button className="p5-button" onClick={onRetry}>Try again</button></div>;
  if (empty) return <div className="p5-state"><b>Nothing here yet</b><p>Records will appear here when they are created in T-CARE.</p></div>;
  return null;
}
function useLoad(path, fallbackKey, pollMs = 0) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const inFlight = React.useRef(false);
  // Every request gets a ticket. Only the newest ticket may write state, so a slow response for an old path
  // (previous page, previous job id) can never overwrite the view the person is looking at now.
  const ticket = React.useRef(0);
  const load = React.useCallback(async ({ silent = false } = {}) => {
    // Background polling is skipped while another request runs; an explicit load (first load, path change,
    // retry, refresh after saving) always runs and supersedes whatever was in flight.
    if (silent && inFlight.current) return null;
    const mine = ++ticket.current;
    inFlight.current = true;
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await request(path);
      if (mine === ticket.current) setData(result);
      return result;
    } catch (e) {
      if (mine === ticket.current) setError(errorText(e));
      return null;
    } finally {
      if (mine === ticket.current) { inFlight.current = false; setLoading(false); }
    }
  }, [path]);
  React.useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load({ silent: true }); };
    const timer = pollMs ? window.setInterval(refresh, pollMs) : 0;
    if (pollMs) document.addEventListener('visibilitychange', refresh);
    return () => {
      ticket.current += 1; // invalidate anything still in flight for this path or an unmounted page
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
function Panel({ title, sub, children, action }) {
  return <section className="p5-panel"><div className="p5-panel-head"><div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}
function Pill({ children, tone }) { return <span className={`p5-pill ${tone || ''}`}>{children}</span>; }
function Empty({ title = 'No records yet', text = 'Records will appear here once they are created.' }) { return <div className="p5-empty"><b>{title}</b><p>{text}</p></div>; }
function Field({ label, children, hint }) { return <label className="p5-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Button({ children, onClick, type = 'button', disabled, variant = 'primary' }) { return <button type={type} className={`p5-button ${variant}`} disabled={disabled} onClick={onClick}>{children}</button>; }
function FormGrid({ children }) { return <div className="p5-form-grid">{children}</div>; }
function RecordTable({ headers, children }) { return <div className="p5-table-wrap"><table className="p5-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

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
  return <Shell title="Your profile" sub="Manage your Customer account details and verification status.">
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
  const plantsState = useLoad('/customer/plants', null, 20000);
  const bookingsState = useLoad('/bookings', null, 15000);
  const notificationsState = useLoad('/notifications?limit=5', null, 15000);
  const subscriptionsState = useLoad('/subscriptions/customer', null, 20000);
  const plants = plantsState.data?.plants || [];
  const bookings = bookingsState.data?.bookings || [];
  const notifications = notificationsState.data?.notifications || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const currentSubscription = subscriptions.find(item => ['ACTIVE', 'PENDING', 'PAUSED'].includes(item.status));
  const upcoming = bookings.filter(b => !['SERVICE_COMPLETED', 'CANCELLED'].includes(b.status)).slice(0, 3);
  const loading = plantsState.loading || bookingsState.loading || notificationsState.loading || subscriptionsState.loading;
  const error = plantsState.error || bookingsState.error || notificationsState.error || subscriptionsState.error;
  const load = () => Promise.all([plantsState.load(), bookingsState.load(), notificationsState.load(), subscriptionsState.load()]);
  return <Shell title="Your garden today" sub="Your plants, upcoming visits and T-CARE updates refresh automatically while this page is open.">
    <div className="p5-metrics"><div><small>Plants in your care</small><b>{loading ? '—' : plants.length}</b></div><div><small>Upcoming bookings</small><b>{loading ? '—' : upcoming.length}</b></div><div><small>Notifications</small><b>{loading ? '—' : notificationsState.data?.unreadCount ?? notifications.filter(n => !n.readAt).length} unread</b></div><div><small>Subscription</small><b>{loading ? '—' : currentSubscription ? statusLabel(currentSubscription.status) : 'No plan'}</b></div></div>
    <Notice error={error}/><State loading={loading} error={error} onRetry={load}/>
    {!loading && !error && <div className="p5-columns">
      <Panel title="Upcoming visits" sub="Live booking records from your account" action={<Link to="/garden/visits">All visits →</Link>}>
        {upcoming.length ? upcoming.map(b => <Link className="p5-list-row" key={b.id} to={`/garden/visits/${b.id}`}><div><b>{b.service?.name || 'T-CARE service'}</b><small>{b.reference} · {dateTime(b.scheduledStart)}</small></div><Pill>{statusLabel(b.status)}</Pill><strong>{money(b.total)}</strong></Link>) : <Empty title="No upcoming visits" text="Book a service to get your plant care on the calendar."/>}
      </Panel>
      <Panel title="Your plants" sub="Live customer plant records" action={<Link to="/garden/plants">View plants →</Link>}>
        {plants.slice(0, 5).map(p => <Link className="p5-list-row" key={p.id} to={`/garden/plants/${p.id}`}><div><b>{p.name}</b><small>{p.type || 'Plant'} · {statusLabel(p.healthStatus)}</small></div><Pill>{p.nextCareAt ? dateOnly(p.nextCareAt) : 'No care date'}</Pill></Link>)}
        {!plants.length && <Empty title="Your collection is waiting" text="Add your first plant to start building its care history."/>}
      </Panel>
      <Panel title="Your subscription" sub="Plan status and renewal information from your account." action={<Link to="/garden/plan">Manage plans →</Link>}>
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
  return <Shell title="Services" sub="Browse services configured by T-CARE operations, with live prices and booking demand.">
    {top && <Panel title="Most booked — last 30 days" sub={`Based on ${popularState.data?.range || '30d'} non-cancelled booking records. Updated ${dateTime(popularState.data?.generatedAt)}.`}>
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
    {showForm && <Panel title={editing ? 'Edit address' : 'Add a new address'} sub="Only addresses saved to your account can be selected for your bookings.">
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
  const remove = async plant => { if (!window.confirm(`Delete ${plant.name} from your collection?`)) return; try { await request(`/customer/plants/${plant.id}`, { method: 'DELETE' }); setMessage('Plant removed.'); await load(); } catch (e) { setFormError(errorText(e)); } };
  return <Shell title="My plants" sub="Manage your plant collection, care dates and notes from your saved customer profile." action={<Button onClick={() => open(null)}>＋ Add plant</Button>}>
    <Notice error={formError || error} success={message}/><State loading={loading} error={error} onRetry={load}/>
    {showForm && <Panel title={editing ? 'Edit plant' : 'Add a plant'} sub="This record is saved to your customer profile."><form onSubmit={save}><FormGrid>
      <Field label="Plant name"><input required minLength="1" maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
      <Field label="Type / species"><input maxLength="120" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}/></Field>
      <Field label="Location in home"><input maxLength="160" value={form.locationInHome} onChange={e => setForm({ ...form, locationInHome: e.target.value })}/></Field>
      <Field label="Current plant health"><select value={form.healthStatus} onChange={e => setForm({ ...form, healthStatus: e.target.value })}>{['EXCELLENT','HEALTHY','NEEDS_ATTENTION','CRITICAL'].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></Field>
      <Field label="Next care date"><input type="date" value={form.nextCareAt} onChange={e => setForm({ ...form, nextCareAt: e.target.value })}/></Field>
      <Field label="Care notes"><textarea maxLength="2000" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field>
    </FormGrid><div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save plant'}</Button><Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div></form></Panel>}
    {!loading && !error && <div className="p5-card-grid">{plants.map(p => <article className="p5-card" key={p.id}><div className="p5-card-top"><Pill>{statusLabel(p.healthStatus)}</Pill><small>{p.type || 'Plant'}</small></div><h3>{p.name}</h3><p>{p.locationInHome || 'Location not specified'}</p><p>{p.notes || 'No care notes yet.'}</p><div className="p5-card-meta"><span>Next care: {dateOnly(p.nextCareAt)}</span><span>{(p.photos || []).length} photos</span></div><div className="p5-actions"><Link className="p5-button primary" to={`/garden/plants/${p.id}`}>Open record</Link><Button variant="ghost" onClick={() => open(p)}>Edit</Button><Button variant="danger" onClick={() => remove(p)}>Delete</Button></div></article>)}{!plants.length && <Empty title="No plants added yet" text="Use Add plant to create the first live record."/>}</div>}
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
      setMessage('Plant care update saved. Assigned Gardeners have been notified when this plant is part of an active visit.');
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
  const removePhoto = async photo => { if (!window.confirm('Delete this plant photo from T-CARE Storage?')) return; setUploading(true); try { await request(`/customer/plants/${plant.id}/photos/${photo.id}`, { method: 'DELETE' }); setMessage('Plant photo deleted.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setUploading(false); } };
  return <Shell title={plant?.name || 'Plant record'} sub="Plant information, uploaded photos and care history." action={<Link className="p5-button ghost" to="/garden/plants">Back to plants</Link>}>
    <Notice error={error || (message && /failed|error|invalid|cannot|not found|denied|required/i.test(message) ? message : '')} success={message && !/failed|error|invalid|cannot|not found|denied|required/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {plant && <><div className="p5-metrics"><div><small>Health</small><b>{statusLabel(plant.healthStatus)}</b></div><div><small>Next care</small><b>{dateOnly(plant.nextCareAt)}</b></div><div><small>Photos</small><b>{plant.photos?.length || 0}</b></div></div>
      <Panel title="Plant details" sub={`${plant.type || 'Type not specified'} · ${plant.locationInHome || 'Location not specified'}`} action={<label className="p5-button primary">{uploading ? 'Uploading…' : 'Upload photo'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={addPhoto} disabled={uploading}/></label>}><p>{plant.notes || 'No notes have been added.'}</p></Panel>
      <Panel title="Update plant health" sub="Tell T-CARE about the latest condition. A health change is saved to the care history and shared with an assigned Gardener when relevant.">
        <form onSubmit={saveHealth}><FormGrid>
          <Field label="Plant health"><select value={healthForm.healthStatus} onChange={e => setHealthForm({ ...healthForm, healthStatus: e.target.value })}>{['EXCELLENT','HEALTHY','NEEDS_ATTENTION','CRITICAL'].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></Field>
          <Field label="Next care date"><input type="date" value={healthForm.nextCareAt} onChange={e => setHealthForm({ ...healthForm, nextCareAt: e.target.value })}/></Field>
        </FormGrid>
        <Field label="Current observations / notes"><textarea maxLength="2000" value={healthForm.notes} onChange={e => setHealthForm({ ...healthForm, notes: e.target.value })} placeholder="Describe yellow leaves, watering concerns, pests or recent changes."/></Field>
        <Button type="submit" disabled={savingHealth}>{savingHealth ? 'Saving report…' : 'Save health update'}</Button></form>
      </Panel>
      <Panel title="Photos" sub="Private Supabase Storage assets linked to this plant.">{plant.photos?.length ? <div className="p5-photo-grid">{plant.photos.map(photo => <div key={photo.id}><img src={photo.url || ''} alt={photo.altText || plant.name} onError={e => { e.currentTarget.style.display = 'none'; }}/><small>{photo.altText || 'Plant photo'} · {dateOnly(photo.createdAt)}</small>{photo.mediaAssetId && <Button variant="danger" disabled={uploading} onClick={() => removePhoto(photo)}>Delete photo</Button>}</div>)}</div> : <Empty title="No plant photos" text="Upload a JPG, PNG or WebP image up to 10 MB."/>}</Panel>
      <Panel title="Care history" sub="Completed service and care records.">{plant.careRecords?.length ? <div className="p5-record-list">{plant.careRecords.map(r => <div key={r.id}><b>{r.title}</b><p>{r.notes || 'No notes recorded.'}</p><small>{dateTime(r.recordedAt)}{r.nextCareAt ? ` · Next care ${dateOnly(r.nextCareAt)}` : ''}</small></div>)}</div> : <Empty title="No care history yet"/>}</Panel>
    </>}
  </Shell>;
}

export function CustomerBookingCreatePage({ Shell }) {
  const nav = useNavigate();
  const [services, setServices] = React.useState([]), [plants, setPlants] = React.useState([]), [addresses, setAddresses] = React.useState([]);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [success, setSuccess] = React.useState('');
  const [serviceId, setServiceId] = React.useState(''), [plantIds, setPlantIds] = React.useState([]), [addressId, setAddressId] = React.useState(''), [scheduledStart, setScheduledStart] = React.useState(''), [specialInstructions, setSpecialInstructions] = React.useState('');
  const [showAddress, setShowAddress] = React.useState(false), [address, setAddress] = React.useState({ label: 'Home', type: 'HOME', line1: '', line2: '', city: '', state: '', postalCode: '', isDefault: true });
  const load = React.useCallback(async () => { setLoading(true); setError(''); try { const [s, p, a] = await Promise.all([request('/services'), request('/customer/plants'), request('/customer/addresses')]); setServices(s.services || []); setPlants(p.plants || []); setAddresses(a.addresses || []); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!addressId && addresses.length) setAddressId(addresses.find(a => a.isDefault)?.id || addresses[0].id); }, [addresses, addressId]);
  React.useEffect(() => { if (!serviceId && services.length) setServiceId(services[0].id); }, [services, serviceId]);
  const selectedService = services.find(s => s.id === serviceId);
  const selectedPrice = (selectedService?.prices || [])
    .filter(p => (p.minPlants == null || plantIds.length >= p.minPlants) && (p.maxPlants == null || plantIds.length <= p.maxPlants))
    .sort((a, b) => {
      const minA = a.minPlants == null ? Number.NEGATIVE_INFINITY : a.minPlants;
      const minB = b.minPlants == null ? Number.NEGATIVE_INFINITY : b.minPlants;
      return minB - minA || new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    })[0];
  const createAddress = async e => { e.preventDefault(); setBusy(true); setError(''); try { const result = await request('/customer/addresses', { method: 'POST', body: json(address) }); setAddresses(current => [result.address, ...current]); setAddressId(result.address.id); setShowAddress(false); setSuccess('Address saved.'); } catch (e2) { setError(errorText(e2)); } finally { setBusy(false); } };
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); setSuccess(''); try {
    const result = await request('/bookings', { method: 'POST', body: json({ serviceId, plantIds, addressId, scheduledStart: new Date(scheduledStart).toISOString(), specialInstructions }) });
    nav(`/garden/visits/${result.booking.id}`, { replace: true });
  } catch (e2) { setError(errorText(e2)); } finally { setBusy(false); } };
  return <Shell title="Book a service" sub="Create a real booking against your plants, saved address and the live service catalogue.">
    <Notice error={error} success={success}/><State loading={loading} error={error} onRetry={load}/>
    {!loading && <form className="p5-panel" onSubmit={submit}>
      <PageTitle eyebrow="Booking details" title="Tell us what you need" sub="Choose an Admin-approved service, select the plants it should cover and schedule your visit." action={<Link to="/garden/addresses">Manage saved addresses →</Link>}/>
      <div className="p5-booking-intent" aria-live="polite"><span>I need</span><strong>{selectedService?.name || 'a T-CARE service plan'}</strong><span>for</span><strong>{plantIds.length} {plantIds.length === 1 ? 'plant' : 'plants'}</strong></div>
      <FormGrid>
        <Field label="Choose your service plan"><select required value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="">Select service</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.durationLabel}</option>)}</select></Field>
        <Field label="Visit date and time"><input required type="datetime-local" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} min={new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}/></Field>
      </FormGrid>
      <Panel title="Select plants" sub="Only plants belonging to your Customer profile are shown.">
        {plants.length ? <div className="p5-check-grid">{plants.map(p => <label key={p.id} className="p5-check"><input type="checkbox" checked={plantIds.includes(p.id)} onChange={e => setPlantIds(current => e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id))}/><span><b>{p.name}</b><small>{p.type || statusLabel(p.healthStatus)}</small></span></label>)}</div> : <Empty title="Add plants before booking" text="Create at least one plant record in My plants."/>}
      </Panel>
      <Panel title="Service address" action={<Button variant="ghost" onClick={() => setShowAddress(v => !v)}>{showAddress ? 'Close' : '+ Add address'}</Button>}>
        {addresses.length ? <div className="p5-check-grid">{addresses.map(a => <label className="p5-check" key={a.id}><input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)}/><span><b>{a.label} {a.isDefault ? '· Default' : ''}</b><small>{[a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(', ')}</small></span></label>)}</div> : <Empty title="No saved addresses" text="Add the service address where the Gardener should visit."/>}
        {showAddress && <div className="p5-address-editor"><FormGrid><Field label="Label"><input required value={address.label} onChange={e => setAddress({ ...address, label: e.target.value })}/></Field><Field label="Address type"><select value={address.type} onChange={e => setAddress({ ...address, type: e.target.value })}><option>HOME</option><option>OFFICE</option><option>OTHER</option></select></Field><Field label="Address line 1"><input required value={address.line1} onChange={e => setAddress({ ...address, line1: e.target.value })}/></Field><Field label="Address line 2"><input value={address.line2} onChange={e => setAddress({ ...address, line2: e.target.value })}/></Field><Field label="City"><input required value={address.city} onChange={e => setAddress({ ...address, city: e.target.value })}/></Field><Field label="State"><input required value={address.state} onChange={e => setAddress({ ...address, state: e.target.value })}/></Field><Field label="Postal code"><input required value={address.postalCode} onChange={e => setAddress({ ...address, postalCode: e.target.value })}/></Field></FormGrid><Button onClick={createAddress} disabled={busy}>Save address</Button></div>}
      </Panel>
      <Field label="Special instructions"><textarea maxLength="2000" value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="Access notes, plant-care priorities or other details"/></Field>
      <div className="p5-booking-summary"><div><span>Selected plants</span><b>{plantIds.length}</b></div><div><span>Price estimate</span><b>{selectedPrice ? money(selectedPrice.amount) : 'Price unavailable'}</b></div><small>Estimate uses the current price tier for the selected plant count. The server recalculates the final amount at submission. This booking request does not collect payment.</small></div>
      <div className="p5-actions"><Button type="submit" disabled={busy || !serviceId || !plantIds.length || !addressId || !scheduledStart || !selectedPrice}>{busy ? 'Creating booking…' : 'Confirm booking'}</Button></div>
    </form>}
  </Shell>;
}

export function CustomerSubscriptionsPage({ Shell }) {
  const plansState = useLoad('/subscriptions/plans', null, 60000);
  const subscriptionsState = useLoad('/subscriptions/customer', null, 20000);
  const [busyId, setBusyId] = React.useState('');
  const [message, setMessage] = React.useState('');
  const plans = plansState.data?.plans || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const occupied = subscriptions.some(item => ['PENDING', 'ACTIVE', 'PAUSED'].includes(item.status));
  const error = plansState.error || subscriptionsState.error;
  const load = () => Promise.all([plansState.load(), subscriptionsState.load()]);
  const subscribe = async plan => {
    if (occupied) return;
    setBusyId(plan.id); setMessage('');
    try {
      const result = await request('/subscriptions/customer', { method: 'POST', body: json({ planId: plan.id }) });
      setMessage(result.message || `${plan.name} request created. Payment verification is pending.`);
      await subscriptionsState.load();
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusyId(''); }
  };
  const changeStatus = async (subscription, action) => {
    if (action === 'cancel' && !window.confirm(`Cancel ${subscription.plan?.name || 'this subscription'}?`)) return;
    setBusyId(subscription.id); setMessage('');
    try {
      await request(`/subscriptions/customer/${subscription.id}/${action}`, { method: 'POST', body: '{}' });
      setMessage(`Subscription ${action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'resumed'}.`);
      await subscriptionsState.load();
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusyId(''); }
  };
  return <Shell title="Subscription plans" sub="Choose a T-CARE plan for recurring plant care. A request remains pending until payment is verified; online checkout is a later integration.">
    <Notice error={error || (message && /failed|cannot|invalid|not found|already|denied/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|already|denied/i.test(message) ? message : ''}/>
    <Panel title="Your subscription history" sub="Status and renewal dates from your customer account.">
      <State loading={subscriptionsState.loading} error={subscriptionsState.error} empty={!subscriptions.length && !subscriptionsState.loading && !subscriptionsState.error} onRetry={subscriptionsState.load}/>
      {subscriptions.map(item => <div className="p5-subscription-row" key={item.id}>
        <div><b>{item.plan?.name || 'T-CARE plan'}</b><small>{item.plan?.billingCycle} · {item.plan?.plantLimit ? `${item.plan.plantLimit} plant limit` : 'No stated plant limit'}</small><small>Requested {dateOnly(item.createdAt)} · {item.startedAt ? `Started ${dateOnly(item.startedAt)}` : 'Not started'}</small>{item.renewsAt && <small>Renews / ends {dateOnly(item.renewsAt)}</small>}</div>
        <div className="p5-subscription-actions"><Pill tone={item.status === 'ACTIVE' ? 'success' : item.status === 'PENDING' ? 'warning' : ''}>{statusLabel(item.status)}</Pill>
          {item.status === 'PENDING' && <small>Awaiting verified payment</small>}
          {item.status === 'ACTIVE' && <Button variant="ghost" disabled={busyId === item.id} onClick={() => changeStatus(item, 'pause')}>Pause</Button>}
          {item.status === 'PAUSED' && <Button variant="ghost" disabled={busyId === item.id} onClick={() => changeStatus(item, 'resume')}>Resume</Button>}
          {['PENDING', 'ACTIVE', 'PAUSED'].includes(item.status) && <Button variant="danger" disabled={busyId === item.id} onClick={() => changeStatus(item, 'cancel')}>Cancel</Button>}
        </div>
      </div>)}
    </Panel>
    <Panel title="Available plans" sub="Plans and prices are maintained by T-CARE Admin. Prices are displayed from the live catalogue.">
      <State loading={plansState.loading} error={plansState.error} empty={!plans.length && !plansState.loading && !plansState.error} onRetry={plansState.load}/>
      <div className="p5-subscription-grid">{plans.map(plan => <article className="p5-subscription-card" key={plan.id}>
        <span className="eyebrow">T-CARE subscription</span><h3>{plan.name}</h3><div className="p5-plan-price">{money(plan.price)} <small>/ {plan.billingCycle}</small></div>
        <p>{plan.description || 'Recurring plant-care support managed by T-CARE.'}</p>
        <div className="p5-plan-includes"><span>{plan.plantLimit ? `Up to ${plan.plantLimit} plants` : 'Plant limit as agreed with T-CARE'}</span><span>Admin-managed service plan</span><span>Subscription status visible in your account</span></div>
        <Button disabled={occupied || Boolean(busyId)} onClick={() => subscribe(plan)}>{busyId === plan.id ? 'Submitting…' : occupied ? 'Existing subscription active or pending' : 'Request this plan'}</Button>
      </article>)}</div>
      {occupied && <small className="p5-muted">You already have a pending, active or paused subscription. Cancel it before requesting another plan.</small>}
    </Panel>
  </Shell>;
}

export function CustomerBookingsPage({ Shell }) {
  const [filter, setFilter] = React.useState('All');
  const { data, loading, error, load } = useLoad('/bookings', null, 15000); const all = data?.bookings || [];
  const filters = ['All', 'Upcoming', 'Completed', 'Cancelled'];
  const visible = all.filter(b => filter === 'All' || filter === 'Upcoming' && !['SERVICE_COMPLETED', 'CANCELLED'].includes(b.status) || filter === 'Completed' && b.status === 'SERVICE_COMPLETED' || filter === 'Cancelled' && b.status === 'CANCELLED');
  return <Shell title="My visits" sub="Track each booking from confirmation through service completion." action={<Link className="p5-button primary" to="/garden/book">Book a service</Link>}>
    <div className="p5-toolbar">{filters.map(f => <button className={`p5-filter ${filter === f ? 'active' : ''}`} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div>
    <State loading={loading} error={error} empty={!visible.length && !loading && !error} onRetry={load}/>
    {!loading && !error && <div className="p5-record-list">{visible.map(b => <Link to={`/garden/visits/${b.id}`} className="p5-booking-row" key={b.id}><div><small>{b.reference} · {dateTime(b.scheduledStart)}</small><h3>{b.service?.name}</h3><p>{b.plants?.map(x => x.plant?.name).filter(Boolean).join(', ')}</p><small>{b.address?.label}: {b.address?.line1}, {b.address?.city}</small></div><div className="p5-right"><Pill>{statusLabel(b.status)}</Pill><b>{money(b.total)}</b><span>Open record →</span></div></Link>)}</div>}
  </Shell>;
}

export function CustomerBookingDetailPage({ Shell }) {
  const { id } = useParams();
  const { data, loading, error, load } = useLoad(`/bookings/${id}`, null, 12000);
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState(''), [review, setReview] = React.useState({ rating: 5, comment: '' }), [issue, setIssue] = React.useState({ subject: '', description: '' });
  const booking = data?.booking;
  const cancel = async () => { if (!window.confirm('Cancel this booking?')) return; setBusy(true); setMessage(''); try { await request(`/bookings/${id}/cancel`, { method: 'POST', body: '{}' }); setMessage('Booking cancelled.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  const submitReview = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request('/reviews-issues/customer/reviews', { method: 'POST', body: json({ bookingId: id, rating: Number(review.rating), comment: review.comment || null }) }); setMessage('Review submitted for moderation.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  const submitIssue = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request('/reviews-issues/customer/issues', { method: 'POST', body: json({ bookingId: id, ...issue }) }); setIssue({ subject: '', description: '' }); setMessage('Issue report submitted.'); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title={booking?.reference || 'Booking detail'} sub="Live booking record, service status, assignment and report.">
    <Notice error={error || (message && /failed|cannot|not found|invalid|requires|must/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid|requires|must/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {booking && <><div className="p5-booking-head"><div><Pill>{statusLabel(booking.status)}</Pill><h2>{booking.service?.name}</h2><p>{dateTime(booking.scheduledStart)} · {booking.address?.label} · {booking.address?.line1}, {booking.address?.city}</p></div><strong>{money(booking.total)}</strong></div>
      <div className="p5-metrics"><div><small>Subtotal</small><b>{money(booking.subtotal)}</b></div><div><small>Convenience fee</small><b>{money(booking.convenienceFee)}</b></div><div><small>Total</small><b>{money(booking.total)}</b></div></div>
      <Panel title="Plants in this booking">{booking.plants?.map(x => <div className="p5-list-row" key={x.plantId}><b>{x.plant?.name}</b><small>{statusLabel(x.plant?.healthStatus)}</small></div>)}</Panel>
      <Panel title="Gardener assignment">{booking.assignment ? <div className="p5-list-row"><div><b>{booking.assignment.gardener?.user?.fullName}</b><small>{booking.assignment.gardener?.user?.phone || 'Contact details not shared'}</small></div><Pill>{statusLabel(booking.assignment.status)}</Pill></div> : <Empty title="Awaiting assignment" text="A KYC-verified Gardener will be assigned by T-CARE operations."/>}</Panel>
      <Panel title="Booking timeline">{booking.statusHistory?.length ? <div className="p5-timeline">{booking.statusHistory.map(h => <div key={h.id}><i/><div><b>{statusLabel(h.toStatus)}</b><small>{dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</small></div></div>)}</div> : <Empty/>}</Panel>
      {booking.report && <Panel title="Service report" sub={dateTime(booking.report.createdAt)}><h4>{booking.report.summary}</h4><p>{booking.report.observations}</p><p>{booking.report.recommendation}</p>{booking.report.checklistItems?.map(c => <div className="p5-list-row" key={c.id}><span>{c.label}</span><Pill tone={c.completed ? 'success' : 'warning'}>{c.completed ? 'Completed' : 'Pending'}</Pill></div>)}{booking.report.photos?.length > 0 && <div className="p5-photo-grid">{booking.report.photos.map(photo => <div key={photo.id}>{photo.url && <img src={photo.url} alt={photo.caption || 'Service evidence'} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<small>{photo.caption || 'Service evidence'}</small></div>)}</div>}</Panel>}
      {booking.status === 'SERVICE_COMPLETED' && !booking.review && <Panel title="Review your service"><form onSubmit={submitReview}><Field label="Rating"><select value={review.rating} onChange={e => setReview({ ...review, rating: e.target.value })}>{[5,4,3,2,1].map(n => <option value={n} key={n}>{n} star{n > 1 ? 's' : ''}</option>)}</select></Field><Field label="Comment"><textarea maxLength="5000" value={review.comment} onChange={e => setReview({ ...review, comment: e.target.value })}/></Field><Button type="submit" disabled={busy}>Submit review</Button></form></Panel>}
      {booking.review && <Panel title="Your review"><Pill>{statusLabel(booking.review.status)}</Pill><p>{booking.review.rating}/5 · {booking.review.comment}</p></Panel>}
      <Panel title="Report an issue"><form onSubmit={submitIssue}><Field label="Subject"><input required minLength="2" maxLength="200" value={issue.subject} onChange={e => setIssue({ ...issue, subject: e.target.value })}/></Field><Field label="Description"><textarea required minLength="2" maxLength="10000" value={issue.description} onChange={e => setIssue({ ...issue, description: e.target.value })}/></Field><Button type="submit" disabled={busy}>Submit issue</Button></form></Panel>
      {!['SERVICE_COMPLETED', 'CANCELLED', 'SERVICE_STARTED'].includes(booking.status) && <div className="p5-actions"><Button variant="danger" onClick={cancel} disabled={busy}>Cancel booking</Button></div>}
    </>}
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
  const { data, loading, error, load } = useLoad(path, null, 15000);
  const todayJobs = data?.today?.jobs || [];
  const nextVisit = data?.nextVisit;
  const updates = data?.recentCustomerPlantUpdates || [];
  const rating = data?.profile?.rating;
  return <Shell title="Your route" sub="A live view of today's assignments, upcoming visits, customer plant updates and recorded performance.">
    <div className="p5-metric-grid">
      <div className="p5-metric"><small>Today's jobs</small><b>{loading ? '—' : data?.today?.count ?? 0}</b></div>
      <div className="p5-metric"><small>Completed this month</small><b>{loading ? '—' : data?.month?.completedJobs ?? 0}</b></div>
      <div className="p5-metric"><small>Gross completed booking value</small><b>{loading ? '—' : money(data?.month?.grossCompletedBookingValue)}</b><small>Includes the booking total; not Gardener earnings</small></div>
      <div className="p5-metric"><small>Current rating</small><b>{rating == null ? '—' : `${Number(rating).toFixed(1)} / 5`}</b></div>
    </div>
    <State loading={loading} error={error} onRetry={load}/>
    {nextVisit && <Panel title="Next visit" sub="Next upcoming assignment on your route.">
      <Link to={`/crew/jobs/${nextVisit.id}`} className="p5-booking-row"><div><small>{gardenerJobLabel(nextVisit)} · {dateTime(nextVisit.booking?.scheduledStart)}</small><h3>{nextVisit.booking?.service?.name}</h3><p>{nextVisit.booking?.customer?.user?.fullName} · {nextVisit.booking?.address?.line1}, {nextVisit.booking?.address?.city}</p></div><div className="p5-right"><Pill>{statusLabel(nextVisit.status)}</Pill><span>Open visit →</span></div></Link>
    </Panel>}
    <Panel title="Today's jobs" sub={`${todayJobs.length} active assignment${todayJobs.length === 1 ? '' : 's'} scheduled for your local day.`} action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      {todayJobs.length ? todayJobs.map(job => <Link to={`/crew/jobs/${job.id}`} className="p5-booking-row" key={job.id}><div><small>{gardenerJobLabel(job)} · {dateTime(job.booking?.scheduledStart)}</small><h3>{job.booking?.service?.name}</h3><p>{job.booking?.customer?.user?.fullName} · {job.booking?.address?.line1}, {job.booking?.address?.city}</p><small>{job.booking?.plants?.map(x => x.plant?.name).filter(Boolean).join(' · ')}</small></div><div className="p5-right"><Pill>{statusLabel(job.status)}</Pill><span>Open job →</span></div></Link>) : <Empty title="No jobs scheduled today" text="New assignments will appear here as soon as T-CARE operations assigns them."/>}
    </Panel>
    <Panel title="Customer plant-health updates" sub="Recent customer-reported notes for plants in your active assigned visits.">
      {updates.length ? updates.map(record => <div className="p5-list-row" key={record.id}><div><b>{record.plant?.name || 'Customer plant'} · {statusLabel(record.plant?.healthStatus)}</b><small>{record.title} · {dateTime(record.recordedAt)}</small>{record.notes && <p>{record.notes}</p>}{record.nextCareAt && <small>Next care: {dateOnly(record.nextCareAt)}</small>}</div></div>) : <Empty title="No new customer plant updates" text="Customer health notes linked to active visits will appear here."/>}
    </Panel>
    <Panel title="Availability and verification"><div className="p5-metrics"><div><small>Active availability slots</small><b>{data?.availability?.activeSlots ?? 0}</b></div><div><small>KYC status</small><b>{statusLabel(data?.profile?.kycStatus)}</b></div><div><small>Service area</small><b>{data?.profile?.serviceArea || 'Not provided'}</b></div></div><Link to="/crew/hours">Manage availability →</Link></Panel>
  </Shell>;
}
export function GardenerJobsPage({ Shell }) {
  const [filter, setFilter] = React.useState('All');
  const path = filter === 'All' ? '/gardener/jobs?limit=100' : `/gardener/jobs?limit=100&status=${({ Assigned: 'ASSIGNED', Accepted: 'ACCEPTED', 'In progress': 'IN_PROGRESS', Completed: 'COMPLETED' })[filter]}`;
  const { data, loading, error, load } = useLoad(path, null, 15000); const jobs = data?.jobs || [];
  return <Shell title="My jobs" sub="Accept assignments, update visit progress and complete service reports.">
    <div className="p5-toolbar">{['All', 'Assigned', 'Accepted', 'In progress', 'Completed'].map(f => <button key={f} className={`p5-filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
    <State loading={loading} error={error} empty={!jobs.length && !loading && !error} onRetry={load}/>
    {jobs.map(j => <Link key={j.id} className="p5-booking-row" to={`/crew/jobs/${j.id}`}><div><small>{gardenerJobLabel(j)} · {dateTime(j.booking?.scheduledStart)}</small><h3>{j.booking?.service?.name}</h3><p>{j.booking?.customer?.user?.fullName} · {j.booking?.address?.line1}, {j.booking?.address?.city}</p><small>{j.booking?.plants?.map(x => x.plant?.name).join(', ')}</small></div><div className="p5-right"><Pill>{statusLabel(j.status)}</Pill><span>Open job →</span></div></Link>)}
  </Shell>;
}
export function GardenerJobDetailPage({ Shell }) {
  const { id } = useParams(); const { data, loading, error, load } = useLoad(`/gardener/jobs/${id}`, null, 15000); const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('');
  const [availablePlants, setAvailablePlants] = React.useState([]), [plantBusy, setPlantBusy] = React.useState(false);
  const assignment = data?.assignment, booking = assignment?.booking;
  const canEditVisitPlants = ['ASSIGNED', 'ACCEPTED'].includes(assignment?.status) && ['GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED'].includes(booking?.status);
  const loadAvailablePlants = async () => { try { const result = await request(`/gardener/jobs/${id}/plants/available`); setAvailablePlants(result.plants || []); } catch (e) { setMessage(errorText(e)); } };
  React.useEffect(() => { if (booking?.id && canEditVisitPlants) loadAvailablePlants(); }, [booking?.id, canEditVisitPlants]);
  const addVisitPlant = async plantId => { setPlantBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/plants`, { method: 'POST', body: json({ plantId }) }); setMessage('Plant added to this visit. Customer inventory was not changed.'); await Promise.all([load(), loadAvailablePlants()]); } catch (e) { setMessage(errorText(e)); } finally { setPlantBusy(false); } };
  const removeVisitPlant = async plant => { if (!window.confirm(`Remove ${plant.name} from this visit? It will remain in the customer's plant collection.`)) return; setPlantBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/plants/${plant.id}`, { method: 'DELETE' }); setMessage('Plant removed from this visit; customer inventory is unchanged.'); await Promise.all([load(), loadAvailablePlants()]); } catch (e) { setMessage(errorText(e)); } finally { setPlantBusy(false); } };
  const action = async (name, payload = {}) => { setBusy(true); setMessage(''); try { await request(`/gardener/jobs/${id}/${name}`, { method: 'POST', body: json(payload) }); setMessage('Job status updated.'); await load(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } };
  return <Shell title={booking?.service?.name || 'Job detail'} sub={`${gardenerJobLabel(assignment)} · ${dateTime(booking?.scheduledStart)}`}>
    <Notice error={error || (message && /failed|cannot|invalid|not found|required/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|required/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {assignment && <><div className="p5-booking-head"><div><Pill>{statusLabel(assignment.status)}</Pill><h2>{booking?.customer?.user?.fullName}</h2><p>{booking?.address?.line1}, {booking?.address?.city}, {booking?.address?.state}</p></div><strong>{booking?.service?.name}</strong></div>
      <Panel title="Customer instructions"><p>{booking?.specialInstructions || 'No special instructions.'}</p><div className="p5-record-list">{booking?.plants?.map(x => <div className="p5-list-row" key={x.plantId}><div><b>{x.plant?.name}</b><small>{x.plant?.type || 'Plant'} · {statusLabel(x.plant?.healthStatus)}</small>{x.plant?.careRecords?.[0] && <><small>Latest care update: {x.plant.careRecords[0].title} · {dateTime(x.plant.careRecords[0].recordedAt)}</small>{x.plant.careRecords[0].notes && <small>{x.plant.careRecords[0].notes}</small>}</>}</div>{canEditVisitPlants && <Button variant="danger" disabled={plantBusy} onClick={() => removeVisitPlant(x.plant)}>Remove from visit</Button>}</div>)}</div>{canEditVisitPlants && <><Field label="Add another plant from the customer's collection"><select value="" onChange={e => { if (e.target.value) addVisitPlant(e.target.value); }} disabled={plantBusy}><option value="">Select plant to add</option>{availablePlants.map(plant => <option key={plant.id} value={plant.id}>{plant.name} · {statusLabel(plant.healthStatus)}</option>)}</select></Field><small>Adding or removing changes this visit's plant list only. The customer's permanent plant collection remains untouched.</small></>}{!canEditVisitPlants && <small>The visit plant list is locked once service work begins.</small>}</Panel>
      <Panel title="Job actions" sub="Only valid server-side booking transitions are enabled."><div className="p5-actions">
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
  return <Shell title="Completed reports" sub="Completed Gardener assignments and their service outcomes."><State loading={loading} error={error} empty={!jobs.length && !loading && !error} onRetry={load}/>
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
  return <Shell title="Availability" sub="Control the days and hours when T-CARE operations can assign visits to you."><Notice error={error || (message && /failed|cannot|overlap|invalid|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|overlap|invalid|not found/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
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
  return <Shell title="Payouts" sub="A read-only record of payouts entered by T-CARE operations. No estimated commission or earnings formula is assumed.">
    <State loading={loading} error={error} onRetry={load}/>
    <div className="p5-metric-grid"><div className="p5-metric"><small>Total paid</small><b>{money(totals.paid)}</b></div><div className="p5-metric"><small>Pending payout</small><b>{money(totals.pending)}</b></div><div className="p5-metric"><small>Last payout</small><b>{last ? money(last.amount) : '—'}</b><small>{last ? dateTime(last.paidAt) : 'No paid payout recorded'}</small></div></div>
    <Panel title="Payout history" sub="Only actual Payout ledger rows appear here. Totals cover the full ledger; history is paginated 25 records at a time."><div className="p5-actions"><Button variant="ghost" onClick={load}>Refresh ledger</Button></div>{payouts.length ? <RecordTable headers={['Recorded','Period','Amount','Status','Paid on']}>
      {payouts.map(p => <tr key={p.id}><td>{dateTime(p.createdAt)}</td><td>{p.periodStart || p.periodEnd ? `${dateOnly(p.periodStart)} – ${dateOnly(p.periodEnd)}` : 'Not specified'}</td><td>{money(p.amount)}</td><td><Pill tone={p.status === 'PAID' ? 'success' : undefined}>{statusLabel(p.status)}</Pill></td><td>{p.paidAt ? dateTime(p.paidAt) : '—'}</td></tr>)}
    </RecordTable> : <Empty title="No payout records yet" text="Payout entries will appear here once T-CARE operations records them."/>}
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
  return <Shell title="Payments & refunds" sub="A read-only record of verified payments and refunds associated with your T-CARE account.">
    <div className="p5-metric-grid">
      <div className="p5-metric"><small>Recorded paid amount</small><b>{money(paidTotal)}</b></div>
      <div className="p5-metric"><small>Processed refunds</small><b>{money(refundedTotal)}</b></div>
      <div className="p5-metric"><small>Net after refunds</small><b>{money(netTotal)}</b></div>
      <div className="p5-metric"><small>Payment records</small><b>{payments.length}</b></div>
    </div>
    <Notice error={error}/>
    <Panel title="Payment history" sub="Payment status is updated from verified payment-provider events. This page does not initiate charges or refunds. Invoice PDF downloads are not currently available." action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
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
    {payments.some(item => item.refunds?.length) && <Panel title="Refund records" sub="Only refund entries returned for your own payment records are shown.">
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
  const { data, loading, error, load } = useLoad(path, null, 15000); const items = data?.notifications || [];
  const markRead = async id => { try { await request(`/notifications/${id}/read`, { method: 'POST', body: '{}' }); await load(); } catch {} };
  const markAll = async () => { try { await request('/notifications/read-all', { method: 'POST', body: '{}' }); await load(); } catch {} };
  return <Shell title="Notifications" sub="Your booking, service and account updates from T-CARE."><div className="p5-toolbar"><button className={`p5-filter ${!unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(false)}>All</button><button className={`p5-filter ${unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(true)}>Unread ({data?.unreadCount ?? '—'})</button><Button variant="ghost" onClick={markAll}>Mark all read</Button></div><State loading={loading} error={error} empty={!items.length && !loading && !error} onRetry={load}/>{items.map(n => <div className={`p5-notification ${n.readAt ? '' : 'unread'}`} key={n.id}><div><Pill>{statusLabel(n.type)}</Pill><h3>{n.title}</h3><p>{n.body}</p><small>{dateTime(n.createdAt)}</small></div>{!n.readAt && <Button variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}</div>)}</Shell>;
}

// ---------------- Admin: live operations, user management, KYC, service catalogue, issues, CMS, analytics ----------------
export function AdminNotificationsPage({ Shell }) {
  const [filter, setFilter] = React.useState('');
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const path = `/notifications/admin?limit=100${filter ? `&type=${filter}` : ''}${unreadOnly ? '&unreadOnly=true' : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 15000);
  const { data: usersData, loading: usersLoading, error: usersError } = useLoad('/admin/users?limit=100&status=ACTIVE', null, 60000);
  const [form, setForm] = React.useState({ userId: '', type: 'SYSTEM', channel: 'IN_APP', title: '', body: '' });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const users = usersData?.users || [];
  const notifications = data?.notifications || [];
  React.useEffect(() => { if (!form.userId && users.length) setForm(current => ({ ...current, userId: users[0].id })); }, [users, form.userId]);
  const send = async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await request('/notifications/admin/send', { method: 'POST', body: json(form) }); setMessage('Notification created and delivered to the in-app inbox.'); setForm(current => ({ ...current, title: '', body: '' })); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); } };
  return <Shell title="Notification centre" sub="Inspect saved notifications and send a targeted in-app update to an active account."><Notice error={error || usersError || (message && /failed|cannot|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid/i.test(message) ? message : ''}/>
    <Panel title="Send an in-app notification"><form onSubmit={send}><FormGrid><Field label="Recipient"><select required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} disabled={usersLoading || !users.length}><option value="">{usersLoading ? 'Loading accounts…' : 'Select active user'}</option>{users.map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.role} · {u.email}</option>)}</select></Field><Field label="Notification type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{['BOOKING','SERVICE','PLANT_CARE','SYSTEM'].map(x => <option key={x}>{x}</option>)}</select></Field></FormGrid><Field label="Title"><input required minLength="1" maxLength="160" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></Field><Field label="Message"><textarea required minLength="1" maxLength="4000" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}/></Field><Button type="submit" disabled={busy || usersLoading || !form.userId}>{busy ? 'Sending…' : 'Create notification'}</Button></form></Panel>
    <div className="p5-toolbar"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All types</option>{['BOOKING','SERVICE','PLANT_CARE','SYSTEM'].map(x => <option key={x}>{x}</option>)}</select><button className={`p5-filter ${!unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(false)}>All</button><button className={`p5-filter ${unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(true)}>Unread only</button><Button variant="ghost" onClick={load}>Refresh</Button></div>
    <State loading={loading} error={error} empty={!notifications.length && !loading && !error} onRetry={load}/>
    {notifications.map(n => <div className={`p5-notification ${n.readAt ? '' : 'unread'}`} key={n.id}><div><Pill>{statusLabel(n.type)}</Pill><h3>{n.title}</h3><p>{n.body}</p><small>{n.user?.fullName || n.user?.email || n.userId} · {n.user?.role || ''} · {dateTime(n.createdAt)} · {n.readAt ? 'Read' : 'Unread'}</small></div></div>)}
  </Shell>;
}

export function AdminDashboardPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/admin/overview', null, 15000);
  const activityState = useLoad('/admin/recent-activities?limit=10', null, 15000);
  const popularState = useLoad('/admin/popular-services?days=30', null, 30000);
  const o = data?.overview;
  const f = o?.finance || {};
  const metrics = [
    ['Total users', o?.users], ['Customers', o?.customers], ['Gardeners', o?.gardeners],
    ['Active bookings', o?.activeBookings], ['Pending KYC', o?.pendingKyc], ['Open issues', o?.openIssues],
    ['Pending reviews', o?.pendingReviews], ['Pending payments', o?.pendingPayments]
  ];
  return <Shell title="Operations pulse" sub="Live operational, financial and subscription metrics from the connected T-CARE database.">
    <State loading={loading} error={error} onRetry={load}/>
    {o && <>
      <div className="p5-metric-grid">{metrics.map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value ?? 0}</b></div>)}</div>
      <Panel title="Company collection snapshot" sub="Recorded payment events only. These figures are not accounting revenue or profit.">
        <div className="p5-metric-grid">
          {[["Gross collected",money(f.grossCollected)],['Refunded',money(f.refunded)],['Net collected',money(f.netCollected)],['Paid transactions',f.paidTransactionCount ?? 0],['Paid Gardener payouts',money(f.paidPayouts)],['Pending Gardener payouts',money(f.pendingPayouts)]].map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value}</b></div>)}
        </div>
      </Panel>
      <Panel title="Subscription pulse" sub="Current persisted subscription states."><div className="p5-metric-grid"><div className="p5-metric"><small>Active subscriptions</small><b>{o.subscriptions?.active ?? 0}</b></div><div className="p5-metric"><small>Pending subscriptions</small><b>{o.subscriptions?.pending ?? 0}</b></div></div><Link className="p5-button ghost" to="/hq/plans">Open subscription management</Link></Panel>
      <Panel title="Bookings by day" sub="Bookings created in the last 14 calendar days; grouped by UTC date.">
        {(o.dailyBookings || []).length ? <RecordTable headers={['Day','New bookings','Completed','Cancelled']}>{o.dailyBookings.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.total}</td><td>{row.completed}</td><td>{row.cancelled}</td></tr>)}</RecordTable> : <Empty title="No daily booking activity"/>}
      </Panel>
    </>}
    <div className="p5-columns">
      <Panel title="Popular services" sub="Top services by non-cancelled bookings in the last 30 days.">
        <State loading={popularState.loading} error={popularState.error} empty={!popularState.data?.services?.length && !popularState.loading && !popularState.error} onRetry={popularState.load}/>
        {(popularState.data?.services || []).map((service,index) => <div className="p5-list-row" key={service.id}><div><b>{index+1}. {service.name}</b><small>{service.category} · {statusLabel(service.status)}</small></div><Pill>{service.bookingCount} bookings</Pill></div>)}
      </Panel>
      <Panel title="Recent admin activity" sub="Latest actions recorded in the audit log.">
        <State loading={activityState.loading} error={activityState.error} empty={!activityState.data?.activities?.length && !activityState.loading && !activityState.error} onRetry={activityState.load}/>
        {(activityState.data?.activities || []).map(activity => <div className="p5-list-row" key={activity.id}><div><b>{statusLabel(activity.action)} · {activity.entityType}</b><small>{activity.actor?.fullName || activity.actor?.email || 'System'} · {activity.actor?.role || 'SYSTEM'} · {dateTime(activity.createdAt)}</small><small>{activity.entityId || 'No entity ID'}</small></div></div>)}
        <Link to="/hq/money" className="p5-button ghost">Open finance records</Link>
      </Panel>
    </div>
    <div className="p5-columns"><Panel title="Admin work queues"><Link className="p5-list-row" to="/hq/crew"><b>Gardener KYC review</b><span>Review documents and eligibility →</span></Link><Link className="p5-list-row" to="/hq/visits"><b>Booking operations</b><span>Assign verified Gardeners and manage permitted statuses →</span></Link><Link className="p5-list-row" to="/hq/reviews"><b>Reviews and customer issues</b><span>Moderate ratings and resolve reports →</span></Link><Link className="p5-list-row" to="/hq/notifications"><b>Notification centre</b><span>Inspect customer and Gardener updates →</span></Link></Panel><Panel title="Refresh data"><p>Dashboard data refreshes while this page is visible. Refresh individual sections when you need an immediate read.</p><div className="p5-actions"><Button variant="ghost" onClick={load}>Refresh overview</Button><Button variant="ghost" onClick={activityState.load}>Refresh activity</Button><Button variant="ghost" onClick={popularState.load}>Refresh popular services</Button></div></Panel></div>
  </Shell>;
}

export function AdminSubscriptionsPage({ Shell }) {
  const plansState = useLoad('/subscriptions/admin/plans', null, 30000);
  const subscriptionsState = useLoad('/subscriptions/admin', null, 20000);
  const plans = plansState.data?.plans || [];
  const subscriptions = subscriptionsState.data?.subscriptions || [];
  const initialForm = { name: '', description: '', billingCycle: '6 months', plantLimit: '', price: '', status: 'ACTIVE' };
  const [form, setForm] = React.useState(initialForm);
  const [editing, setEditing] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('');
  const visibleSubscriptions = subscriptions.filter(item => !statusFilter || item.status === statusFilter);
  const savePlan = async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { ...form, price: Number(form.price), plantLimit: form.plantLimit === '' ? null : Number(form.plantLimit), description: form.description.trim() || null };
      await request(editing ? `/subscriptions/admin/plans/${editing}` : '/subscriptions/admin/plans', { method: editing ? 'PATCH' : 'POST', body: json(payload) });
      setMessage(editing ? 'Subscription plan updated.' : 'Subscription plan created.'); setEditing(null); setForm(initialForm); await plansState.load();
    } catch (e2) { setMessage(errorText(e2)); }
    finally { setBusy(false); }
  };
  const deletePlan = async plan => {
    if (!window.confirm(`Delete or deactivate the ${plan.name} plan? Existing subscription history will be preserved.`)) return;
    try { const result = await request(`/subscriptions/admin/plans/${plan.id}`, { method: 'DELETE' }); setMessage(result?.deactivated ? 'Plan has existing subscriptions and was deactivated.' : 'Plan deleted.'); await plansState.load(); }
    catch (e) { setMessage(errorText(e)); }
  };
  const updateSubscription = async (subscription, status) => {
    if (!window.confirm(`Change ${subscription.customer?.user?.fullName || 'this customer'} subscription to ${status}?`)) return;
    try { await request(`/subscriptions/admin/${subscription.id}/status`, { method: 'PATCH', body: json({ status }) }); setMessage(`Subscription status updated to ${status}.`); await subscriptionsState.load(); }
    catch (e) { setMessage(errorText(e)); await subscriptionsState.load(); }
  };
  return <Shell title="Subscription management" sub="Create Admin-owned plans and track Customer subscription records. Payment-dependent activation remains guarded by verified payment records.">
    <Notice error={plansState.error || subscriptionsState.error || (message && /failed|cannot|not found|unsupported|required|payment/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|unsupported|required|payment/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit subscription plan' : 'Create subscription plan'} sub="Customer subscription plans are published from this Admin-managed catalogue.">
      <form onSubmit={savePlan}><FormGrid>
        <Field label="Plan name"><input required minLength="2" maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
        <Field label="Billing duration"><select value={form.billingCycle} onChange={e => setForm({ ...form, billingCycle: e.target.value })}>{['1 month','3 months','6 months','12 months','24 months'].map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Price (INR)"><input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></Field>
        <Field label="Plant limit (blank = unlimited)"><input type="number" min="1" value={form.plantLimit} onChange={e => setForm({ ...form, plantLimit: e.target.value })}/></Field>
        <Field label="Visibility"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Active / customer-visible</option><option value="INACTIVE">Inactive</option></select></Field>
      </FormGrid><Field label="Description"><textarea maxLength="2000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></Field>
      <div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save plan changes' : 'Create plan'}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(initialForm); }}>Cancel</Button>}</div></form>
    </Panel>
    <Panel title="Plan catalogue" sub={`${plans.length} Admin-managed plans`}>
      <State loading={plansState.loading} error={plansState.error} empty={!plans.length && !plansState.loading && !plansState.error} onRetry={plansState.load}/>
      {plans.map(plan => <div className="p5-list-row" key={plan.id}><div><b>{plan.name} · {money(plan.price)}</b><small>{plan.billingCycle} · {plan.plantLimit ? `${plan.plantLimit} plants` : 'No plant limit'} · {statusLabel(plan.status)} · {plan._count?.subscriptions ?? '—'} subscriptions</small><small>{plan.description || 'No description supplied.'}</small></div><div className="p5-actions"><Button variant="ghost" onClick={() => { setEditing(plan.id); setForm({ name: plan.name, description: plan.description || '', billingCycle: plan.billingCycle, plantLimit: plan.plantLimit ?? '', price: String(plan.price), status: plan.status }); }}>Edit</Button><Button variant="danger" onClick={() => deletePlan(plan)}>Delete / deactivate</Button></div></div>)}
    </Panel>
    <Panel title="Customer subscription records" sub="Admin can review and change lifecycle states. A PENDING subscription cannot become ACTIVE until a verified PAID payment record exists.">
      <div className="p5-toolbar"><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All subscription states</option>{['PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'].map(s => <option key={s}>{s}</option>)}</select><Button variant="ghost" onClick={subscriptionsState.load}>Refresh</Button></div>
      <State loading={subscriptionsState.loading} error={subscriptionsState.error} empty={!visibleSubscriptions.length && !subscriptionsState.loading && !subscriptionsState.error} onRetry={subscriptionsState.load}/>
      {visibleSubscriptions.map(item => <div className="p5-list-row" key={item.id}><div><b>{item.customer?.user?.fullName || 'Customer'} · {item.plan?.name}</b><small>{item.customer?.user?.email} · {item.plan?.billingCycle} · {money(item.plan?.price)}</small><small>{statusLabel(item.status)} · Created {dateTime(item.createdAt)} · Renews {dateOnly(item.renewsAt)}</small></div><div className="p5-actions"><select aria-label="New subscription status" value={item.status} onChange={e => updateSubscription(item, e.target.value)}>{['PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'].map(s => <option key={s}>{s}</option>)}</select></div></div>)}
    </Panel>
  </Shell>;
}

export function AdminFinancePage({ Shell }) {
  const overviewState = useLoad('/admin/overview', null, 20000);
  const paymentsState = useLoad('/admin/payments?limit=100', null, 30000);
  const payoutsState = useLoad('/admin/payouts?limit=100', null, 30000);
  const f = overviewState.data?.overview?.finance || {};
  const payments = paymentsState.data?.payments || [];
  const payouts = payoutsState.data?.payouts || [];
  return <Shell title="Finance visibility" sub="Read-only financial records from verified payment and payout rows. Payment collection, refund processing and manual payout marking are not performed here.">
    <Notice error={overviewState.error || paymentsState.error || payoutsState.error}/>
    <State loading={overviewState.loading} error={overviewState.error} onRetry={overviewState.load}/>
    {overviewState.data && <div className="p5-metric-grid">{[["Gross collected",money(f.grossCollected)],['Refunded',money(f.refunded)],['Net collected',money(f.netCollected)],['Paid transactions',f.paidTransactionCount ?? 0],['Payouts paid',money(f.paidPayouts)],['Payouts pending',money(f.pendingPayouts)]].map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value}</b></div>)}</div>}
    <Panel title="Payment ledger" sub="Payment status, customer, booking/subscription reference and amount.">
      <State loading={paymentsState.loading} error={paymentsState.error} empty={!payments.length && !paymentsState.loading && !paymentsState.error} onRetry={paymentsState.load}/>
      {payments.length > 0 && <RecordTable headers={['Created','Customer','Reference','Amount','Status','Paid at']}>
        {payments.map(p => <tr key={p.id}><td>{dateTime(p.createdAt)}</td><td>{p.booking?.customer?.user?.fullName || p.subscription?.customer?.user?.fullName || '—'}<small>{p.booking?.customer?.user?.email || p.subscription?.customer?.user?.email || ''}</small></td><td>{p.booking?.reference || p.providerOrderId || p.subscription?.plan?.name || '—'}</td><td>{money(p.amount)}</td><td><Pill tone={p.status === 'PAID' ? 'success' : 'warning'}>{statusLabel(p.status)}</Pill></td><td>{dateTime(p.paidAt)}</td></tr>)}
      </RecordTable>}
    </Panel>
    <Panel title="Gardener payout ledger" sub="Only existing payout records are displayed. Do not treat completed service value as a payout or earnings calculation.">
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
    </Panel>)}{!services.length && <Empty title="No services configured" text="Create the actual service names and price tiers agreed by T-CARE."/>}</div>}
  </Shell>;
}

export function AdminUsersPage({ Shell, role }) {
  const [search, setSearch] = React.useState(''); const [status, setStatus] = React.useState(''); const path = `/admin/users?limit=100${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 20000); const users = data?.users || []; const [message, setMessage] = React.useState('');
  const updateStatus = async (user, next) => { if (user.role === 'ADMIN') return; if (!window.confirm(`Set ${user.fullName} to ${next}?`)) return; try { await request(`/admin/users/${user.id}/status`, { method: 'PATCH', body: json({ status: next }) }); setMessage(`Account status changed to ${next}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title={role === 'GARDENER' ? 'Gardeners' : 'Customers'} sub="Live accounts from PostgreSQL, with role, status, verification and activity fields.">
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
  return <Shell title={user?.fullName || 'User details'} sub="Administrative view of a single account and its linked customer or gardener profile." action={<Link className="p5-button ghost" to={user?.role === 'GARDENER' ? '/hq/crew' : '/hq/people'}>Back to users</Link>}>
    <Notice error={error || (message && /failed|cannot|forbidden|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|forbidden|not found/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    {user && <><Panel title="Account information"><FormGrid><div><small>Email</small><b>{user.email}</b></div><div><small>Role</small><b>{user.role}</b></div><div><small>Status</small><Pill>{user.status}</Pill></div><div><small>Email verification</small><Pill tone={user.emailVerifiedAt ? 'success' : 'warning'}>{user.emailVerifiedAt ? 'Verified' : 'Unverified'}</Pill></div><div><small>Created</small><b>{dateTime(user.createdAt)}</b></div><div><small>Last login</small><b>{dateTime(user.lastLoginAt)}</b></div></FormGrid><div className="p5-actions">{user.role !== 'ADMIN' && user.status !== 'BLOCKED' && <Button variant="danger" disabled={busy} onClick={() => updateStatus('BLOCKED')}>Block account</Button>}{user.role !== 'ADMIN' && user.status === 'BLOCKED' && <Button disabled={busy} onClick={() => updateStatus('ACTIVE')}>Reactivate account</Button>}</div></Panel>
      {user.customerProfile && <><Panel title="Customer addresses">{user.customerProfile.addresses?.length ? user.customerProfile.addresses.map(a => <div className="p5-list-row" key={a.id}><b>{a.label}</b><small>{a.line1}, {a.city}, {a.state} {a.postalCode}</small></div>) : <Empty/>}</Panel><Panel title="Customer plants">{user.customerProfile.plants?.length ? user.customerProfile.plants.map(p => <div className="p5-list-row" key={p.id}><b>{p.name}</b><small>{p.type || 'Plant'} · {statusLabel(p.healthStatus)}</small></div>) : <Empty/>}</Panel></>}
      {user.gardenerProfile && <Panel title="Gardener profile"><FormGrid><div><small>KYC status</small><Pill>{user.gardenerProfile.kycStatus}</Pill></div><div><small>Service area</small><b>{user.gardenerProfile.serviceArea || 'Not provided'}</b></div><div><small>Rating</small><b>{user.gardenerProfile.rating == null ? '—' : Number(user.gardenerProfile.rating).toFixed(1)}</b></div></FormGrid><p>{user.gardenerProfile.bio || 'No professional bio provided.'}</p><Link to="/hq/crew">Open Gardener verification →</Link></Panel>}
    </>}
  </Shell>;
}

export function AdminGardenersKycPage({ Shell }) {
  const [status, setStatus] = React.useState(''); const [search, setSearch] = React.useState(''); const path = `/admin/gardeners?limit=100${status ? `&kycStatus=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 20000); const gardeners = data?.gardeners || []; const [message, setMessage] = React.useState(''); const [review, setReview] = React.useState({});
  const decide = async (g, kycStatus) => { if (kycStatus === 'VERIFIED' && !(g.kycDocuments || []).length) { setMessage(`Cannot verify ${g.user.fullName}: no KYC documents are on record.`); return; } if (!window.confirm(`${kycStatus} KYC for ${g.user.fullName}?`)) return; try { await request(`/admin/gardeners/${g.id}/kyc`, { method: 'PATCH', body: json({ kycStatus, note: review[g.id] || '' }) }); setMessage(`KYC status updated for ${g.user.fullName}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Gardener verification" sub="Review uploaded identity documents and approve or reject professional access."><Notice error={error || (message && /cannot|failed|not found|required/i.test(message) ? message : '')} success={message && !/cannot|failed|not found|required/i.test(message) ? message : ''}/>
    <div className="p5-toolbar"><input placeholder="Search gardeners" value={search} onChange={e => setSearch(e.target.value)}/><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All KYC states</option>{['NOT_STARTED','PENDING','VERIFIED','REJECTED'].map(s => <option key={s}>{s}</option>)}</select></div>
    <State loading={loading} error={error} empty={!gardeners.length && !loading && !error} onRetry={load}/>
    {gardeners.map(g => <Panel key={g.id} title={g.user.fullName} sub={`${g.user.email} · ${g.user.phone || 'No phone'} · ${g.serviceArea || 'No service area'}`} action={<div className="p5-actions"><Pill>{`KYC ${statusLabel(g.kycStatus)}`}</Pill><Pill tone={g.user.status === 'ACTIVE' ? 'success' : 'warning'}>{`Account ${statusLabel(g.user.status)}`}</Pill></div>}>
      <div className="p5-record-list">{(g.kycDocuments || []).map(d => <div key={d.id} className="p5-list-row"><div><b>{statusLabel(d.documentType)}</b><small>{d.originalFileName} · {d.contentType} · {dateOnly(d.createdAt)}</small></div><Pill>{statusLabel(d.status)}</Pill><Button variant="ghost" onClick={() => { const preview = window.open('about:blank', '_blank'); request(`/media/${d.mediaAssetId}`).then(result => { if (preview) preview.location.href = result.url; }).catch(e => { preview?.close(); setMessage(errorText(e)); }); }}>View document</Button></div>)}{!g.kycDocuments?.length && <Empty title="No KYC documents" text="Gardener has not submitted identity documents."/>}</div>
      <Field label="Review note"><textarea maxLength="1000" value={review[g.id] || ''} onChange={e => setReview(v => ({ ...v, [g.id]: e.target.value }))} placeholder="Reason for approval or rejection"/></Field>
      <div className="p5-actions"><Button onClick={() => decide(g, 'VERIFIED')}>Approve KYC</Button><Button variant="danger" onClick={() => decide(g, 'REJECTED')}>Reject KYC</Button><Button variant="ghost" onClick={() => decide(g, 'PENDING')}>Mark pending</Button></div>
    </Panel>)}
  </Shell>;
}

export function GardenerKycDocumentsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/gardener/kyc/documents'); const [type, setType] = React.useState('GOVERNMENT_ID'); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const documents = data?.documents || [];
  const submit = async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setMessage(''); try { const profile = await request('/gardener/profile'); const asset = await uploadToStorage(file, { kind: 'KYC_DOCUMENT', targetType: 'KYC_DOCUMENT', targetId: profile.profile.id }); await request('/gardener/kyc/documents', { method: 'POST', body: json({ documentType: type, mediaAssetId: asset.id, originalFileName: file.name }) }); setMessage('KYC document submitted. Your status is now awaiting Admin review.'); await load(); } catch (e2) { setMessage(errorText(e2)); } finally { setBusy(false); e.target.value = ''; } };
  const removeDocument = async d => { if (!window.confirm(`Remove ${d.originalFileName} from your KYC submission?`)) return; try { await request(`/gardener/kyc/documents/${d.id}`, { method: 'DELETE' }); setMessage('KYC document removed.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Identity verification" sub="Upload identity documents securely for T-CARE Admin review."><Notice error={error || (message && /failed|cannot|not supported|invalid|missing/i.test(message) ? message : '')} success={message && !/failed|cannot|not supported|invalid|missing/i.test(message) ? message : ''}/><State loading={loading} error={error} onRetry={load}/>
    <Panel title="Submit a document" sub="Images or PDF documents up to 10 MB. Keep the original document accessible and legible."><Field label="Document type"><select value={type} onChange={e => setType(e.target.value)}><option value="GOVERNMENT_ID">Government identity document</option><option value="ADDRESS_PROOF">Address proof</option><option value="PROFESSIONAL_CERTIFICATE">Professional certificate</option><option value="OTHER">Other supporting document</option></select></Field><label className="p5-button primary">{busy ? 'Uploading…' : 'Choose and upload file'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={submit} disabled={busy}/></label></Panel>
    <Panel title="Submitted documents">{documents.length ? documents.map(d => <div className="p5-list-row" key={d.id}><div><b>{statusLabel(d.documentType)}</b><small>{d.originalFileName} · {dateTime(d.createdAt)}</small>{d.reviewNote && <small>Review note: {d.reviewNote}</small>}</div><Pill>{statusLabel(d.status)}</Pill>{d.status !== 'VERIFIED' && <Button variant="danger" onClick={() => removeDocument(d)}>Remove</Button>}</div>) : <Empty title="No documents submitted" text="Upload your identity document to start KYC verification."/>}</Panel>
  </Shell>;
}

export function AdminBookingsPage({ Shell }) {
  const [filter, setFilter] = React.useState(''); const [search, setSearch] = React.useState(''); const path = `/admin/bookings?limit=100${filter ? `&status=${filter}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, loading, error, load } = useLoad(path, null, 15000); const bookings = data?.bookings || []; const [gardeners, setGardeners] = React.useState([]); const [message, setMessage] = React.useState('');
  React.useEffect(() => { request('/admin/gardeners?limit=100&kycStatus=VERIFIED').then(d => setGardeners(d.gardeners || [])).catch(() => setGardeners([])); }, []);
  const assign = async (bookingId, gardenerId) => { if (!gardenerId) return; try { await request(`/admin/bookings/${bookingId}/assign`, { method: 'POST', body: json({ gardenerId }) }); setMessage('Gardener assignment saved.'); await load(); } catch (e) { setMessage(errorText(e)); } };
  const transitions = { CONFIRMED: ['CANCELLED'], GARDENER_ASSIGNED: ['CONFIRMED','CANCELLED'], GARDENER_ACCEPTED: ['CANCELLED'], ON_THE_WAY: ['CANCELLED'], ARRIVED: ['CANCELLED'], SERVICE_STARTED: [], SERVICE_COMPLETED: [], CANCELLED: [] };
  const changeStatus = async (booking, status) => { try { await request(`/admin/bookings/${booking.id}/status`, { method: 'PATCH', body: json({ status, note: 'Administrative update from T-CARE operations.' }) }); setMessage(`Booking status changed to ${statusLabel(status)}.`); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Booking operations" sub="Inspect booking details, assign KYC-verified Gardeners and perform permitted status transitions."><Notice error={error || (message && /failed|cannot|invalid|not found|kyc/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|kyc/i.test(message) ? message : ''}/>
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
  return <Shell title={mode === 'reviews' ? 'Review moderation' : 'Customer issues'} sub={mode === 'reviews' ? 'Publish or hide customer reviews. Published reviews update the Gardener rating.' : 'Track and resolve customer support issues.'}><Notice error={error || (message && /failed|cannot|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|not found|invalid/i.test(message) ? message : ''}/>
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
  return <Shell title="Content management" sub="Create durable CMS records, publish public content and archive retired content."><Notice error={error || (message && /failed|cannot|exists|not found|invalid/i.test(message) ? message : '')} success={message && !/failed|cannot|exists|not found|invalid/i.test(message) ? message : ''}/>
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
  return <Shell title="Analytics" sub="Live database-backed metrics. Revenue metrics are read-only; payment processing remains out of scope."><Notice error={seriesError}/><div className="p5-toolbar"><select value={range} onChange={e => setRange(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option><option value={365}>Last 365 days</option></select></div><State loading={loading} error={error} onRetry={load}/>{o && <div className="p5-metric-grid">{labels.map(([label,value]) => <div className="p5-metric" key={label}><small>{label}</small><b>{value ?? 0}</b></div>)}</div>}
    <div className="p5-columns"><Panel title="Booking activity" sub={`${series.bookings.length} daily data points`}>{series.bookings.length ? <RecordTable headers={['Day','Bookings','Completed','Cancelled']}>{series.bookings.map(r => <tr key={String(r.day)}><td>{dateOnly(r.day)}</td><td>{r.total}</td><td>{r.completed}</td><td>{r.cancelled}</td></tr>)}</RecordTable> : <Empty title="No booking activity in this range"/>}</Panel><Panel title="Gardener performance" sub="Assignment counts, ratings and KYC state">{series.gardeners.length ? <RecordTable headers={['Gardener','Assignments','Rating','KYC']}>
      {series.gardeners.map(g => <tr key={g.id}><td>{g.user?.fullName}</td><td>{g._count?.assignments || 0}</td><td>{g.rating == null ? '—' : Number(g.rating).toFixed(1)}</td><td>{statusLabel(g.kycStatus)}</td></tr>)}</RecordTable> : <Empty/>}</Panel></div>
    <Panel title="Paid volume and refunds" sub="Read-only payment records; collection and refund execution are excluded from this Phase 5 scope.">{series.revenue.length ? <RecordTable headers={['Day','Paid volume','Refunded']}>{series.revenue.map(r => <tr key={String(r.day)}><td>{dateOnly(r.day)}</td><td>{money(r.paid)}</td><td>{money(r.refunded)}</td></tr>)}</RecordTable> : <Empty title="No recorded payment activity in this range"/>}</Panel>
  </Shell>;
}

export function AdminPlantKnowledgePage({ Shell }) {
  const { data, loading, error, load } = useLoad('/admin/plant-knowledge?limit=100', null, 60000); const items = data?.items || [];
  const trackedPlantsState = useLoad('/admin/plants?limit=100', null, 30000);
  const trackedPlants = trackedPlantsState.data?.plants || [];
  const [form, setForm] = React.useState({ commonName: '', scientificName: '', category: '', watering: '', light: '', feeding: '', notes: '' }); const [editing, setEditing] = React.useState(null); const [message, setMessage] = React.useState('');
  const save = async e => { e.preventDefault(); try { await request(editing ? `/admin/plant-knowledge/${editing}` : '/admin/plant-knowledge', { method: editing ? 'PATCH' : 'POST', body: json(form) }); setMessage('Plant knowledge saved.'); setEditing(null); setForm({ commonName: '', scientificName: '', category: '', watering: '', light: '', feeding: '', notes: '' }); await load(); } catch (e2) { setMessage(errorText(e2)); } };
  const del = async item => { if (!window.confirm(`Delete knowledge record for ${item.commonName}?`)) return; try { await request(`/admin/plant-knowledge/${item.id}`, { method: 'DELETE' }); await load(); } catch (e) { setMessage(errorText(e)); } };
  return <Shell title="Plant database" sub="Manage the shared care reference library and monitor Customer-owned plant health records."><Notice error={error || (message && /failed|cannot|exists|not found/i.test(message) ? message : '')} success={message && !/failed|cannot|exists|not found/i.test(message) ? message : ''}/><Panel title={editing ? 'Edit plant knowledge' : 'Add plant knowledge'}><form onSubmit={save}><FormGrid>{['commonName','scientificName','category','watering','light','feeding'].map(k => <Field label={statusLabel(k)} key={k}><input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}/></Field>)}</FormGrid><Field label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field><Button type="submit">Save record</Button></form></Panel><State loading={loading} error={error} empty={!items.length && !loading && !error} onRetry={load}/>{items.map(item => <div className="p5-list-row" key={item.id}><div><b>{item.commonName}</b><small>{item.scientificName} · {item.category}</small></div><div className="p5-actions"><Button variant="ghost" onClick={() => { setEditing(item.id); setForm(Object.fromEntries(Object.keys(form).map(k => [k, item[k] || '']))); }}>Edit</Button><Button variant="danger" onClick={() => del(item)}>Delete</Button></div></div>)}
    <Panel title="Customer plant tracker" sub="Live view of customer-owned plants. Health updates are written by Customers and assigned Gardeners; Admin view is read-only."><State loading={trackedPlantsState.loading} error={trackedPlantsState.error} empty={!trackedPlants.length && !trackedPlantsState.loading && !trackedPlantsState.error} onRetry={trackedPlantsState.load}/>{trackedPlants.length > 0 && <RecordTable headers={['Plant','Customer','Health','Next care','Last updated']}>{trackedPlants.map(plant => <tr key={plant.id}><td><b>{plant.name}</b><small>{plant.type || 'Plant'}</small></td><td>{plant.customer?.user?.fullName || 'Customer'}<small>{plant.customer?.user?.email || ''}</small></td><td><Pill>{statusLabel(plant.healthStatus)}</Pill></td><td>{dateOnly(plant.nextCareAt)}</td><td>{dateTime(plant.updatedAt)}</td></tr>)}</RecordTable>}</Panel>
  </Shell>;
}



export function AdminProductsPage({ Shell }) {
  const { data, loading, error, load } = useLoad('/products/admin', null, 30000);
  const products = data?.products || [];
  const initialForm = { sku: '', name: '', description: '', category: '', kind: '', imageUrl: '', potColor: '', price: '', compareAtPrice: '', stockQuantity: '0', status: 'ACTIVE' };
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
      kind: form.kind.trim() || null, imageUrl: form.imageUrl.trim() || null, potColor: form.potColor.trim() || null,
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
    setForm({ sku: product.sku, name: product.name, description: product.description || '', category: product.category, kind: product.kind || '', imageUrl: product.imageUrl || '', potColor: product.potColor || '', price: String(product.price), compareAtPrice: product.compareAtPrice == null ? '' : String(product.compareAtPrice), stockQuantity: String(product.stockQuantity), status: product.status });
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
  return <Shell title="Plant Store catalogue" sub="Create products, maintain published details and record every stock movement. Product checkout is not enabled in this release.">
    <Notice error={error || (message && /failed|cannot|invalid|not found|insufficient|must/i.test(message) ? message : '')} success={message && !/failed|cannot|invalid|not found|insufficient|must/i.test(message) ? message : ''}/>
    <Panel title={editing ? 'Edit product details' : 'Add a product'} sub="Only approved product names, images, prices and stock should be published. Stock is not changed through the edit form.">
      <form onSubmit={save}>
        <FormGrid>
          <Field label="SKU"><input required minLength="2" maxLength="80" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}/></Field>
          <Field label="Product name"><input required minLength="2" maxLength="160" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
          <Field label="Category"><input required minLength="2" maxLength="80" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}/></Field>
          <Field label="Illustration type (optional)"><input maxLength="40" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} placeholder="e.g. monstera"/></Field>
          <Field label="Image URL (optional)"><input type="url" maxLength="2000" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}/></Field>
          <Field label="Pot colour (optional)"><input maxLength="40" value={form.potColor} onChange={e => setForm({ ...form, potColor: e.target.value })}/></Field>
          <Field label="Selling price (INR)"><input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></Field>
          <Field label="Compare-at price (optional)"><input type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={e => setForm({ ...form, compareAtPrice: e.target.value })}/></Field>
          {!editing && <Field label="Opening stock"><input required type="number" min="0" max="100000" step="1" value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: e.target.value })}/></Field>}
          <Field label="Publication status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></Field>
        </FormGrid>
        <Field label="Description"><textarea maxLength="5000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></Field>
        <div className="p5-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save product details' : 'Create product'}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(initialForm); }}>Cancel</Button>}</div>
      </form>
    </Panel>
    <Panel title="Live inventory" sub={`${products.length} product records · stock movements are audit-logged`} action={<Button variant="ghost" onClick={load}>Refresh</Button>}>
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
    {movementProduct && <Panel title={`Stock history · ${movementProduct.name}`} sub={`Latest ${movements.length} recorded stock changes`} action={<Button variant="ghost" onClick={() => setMovementProduct(null)}>Close</Button>}>
      {movementLoading ? <State loading/> : movements.length ? <RecordTable headers={['Date','Change','Reason','Admin user ID']}>{movements.map(item => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td><b>{item.quantityChange > 0 ? '+' : ''}{item.quantityChange}</b></td><td>{item.reason}</td><td>{item.actorUserId || 'System'}</td></tr>)}</RecordTable> : <Empty title="No stock movements" text="No stock changes have been recorded for this product yet."/>}
    </Panel>}
    <Panel title="Store release status"><p>Customer checkout, payment collection, delivery scheduling and order fulfilment are not enabled in this release. The public store is a live catalogue and cart preview only.</p></Panel>
  </Shell>;
}

export function OutOfScopePage({ Shell, title = 'Not in this completion scope', sub = 'This module is intentionally deferred.' }) {
  return <Shell title={title} sub={sub}><Panel title="Deferred by project scope"><p>T-CARE payment processing, refunds, payouts and payment-dependent subscription billing are intentionally excluded from this Phase 5 build. No mock transaction controls are presented as live functionality.</p></Panel></Shell>;
}
