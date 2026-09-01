'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Tab = 'home' | 'customers' | 'inventory' | 'orders' | 'new-order'
type Equipment = { id:string; name:string; category:string|null; available_qty:number; daily_rate:number|null; weekly_rate:number|null; four_week_rate:number|null }
type Order = { id:string; order_number:number; job_name:string|null; ordered_by_name:string|null; delivery_address:string|null; delivery_date:string|null; status:string; quantity:number; equipment_types?:{name:string}|null }
type Pickup = { id:string; status:string; scheduled_pickup_date:string|null }
type Visit = { id:string; planned_for:string; completed_at:string|null }
type Customer = { id:string; name:string; phone:string|null; email:string|null; billing_address:string|null; notes:string|null; last_visit_at:string|null; created_at:string }
type Engagement = { id:string; customer_id:string; user_id:string|null; engagement_type:string; notes:string; occurred_at:string; follow_up_at:string|null; created_at:string }

const adminEmail = 'tomt@ltcrentals.net'
const logo = '/ltc-logo.svg'

export default function HomePage() {
  const [user,setUser] = useState<User|null>(null)
  const [loading,setLoading] = useState(true)
  const [email,setEmail] = useState(adminEmail)
  const [message,setMessage] = useState('')
  const [authorized,setAuthorized] = useState(false)
  const [tab,setTab] = useState<Tab>('home')
  const [equipment,setEquipment] = useState<Equipment[]>([])
  const [orders,setOrders] = useState<Order[]>([])
  const [pickups,setPickups] = useState<Pickup[]>([])
  const [visits,setVisits] = useState<Visit[]>([])
  const [customers,setCustomers] = useState<Customer[]>([])
  const [engagements,setEngagements] = useState<Engagement[]>([])
  const [selectedCustomerId,setSelectedCustomerId] = useState<string|null>(null)
  const [showAddCustomer,setShowAddCustomer] = useState(false)
  const [customerSearch,setCustomerSearch] = useState('')
  const [saving,setSaving] = useState(false)

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{ setUser(data.user); if(data.user) initialize(data.user); else setLoading(false) })
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{ setUser(session?.user ?? null); if(session?.user) initialize(session.user); else { setAuthorized(false); setLoading(false) } })
    return ()=>listener.subscription.unsubscribe()
  },[])

  async function initialize(currentUser:User){
    setLoading(true)
    let {data:profile}=await supabase.from('app_users').select('id,active,role').eq('id',currentUser.id).maybeSingle()
    if(!profile && currentUser.email?.toLowerCase()===adminEmail){
      await supabase.from('app_users').insert({id:currentUser.id,full_name:'Tom T',role:'admin',active:true})
      const result=await supabase.from('app_users').select('id,active,role').eq('id',currentUser.id).maybeSingle(); profile=result.data
    }
    const ok=Boolean(profile?.active); setAuthorized(ok); if(ok) await loadData(); setLoading(false)
  }

  async function loadData(){
    const [eq,ord,pick,visit,cust,eng]=await Promise.all([
      supabase.from('equipment_types').select('id,name,category,available_qty,daily_rate,weekly_rate,four_week_rate').eq('active',true).order('category').order('name'),
      supabase.from('orders').select('id,order_number,job_name,ordered_by_name,delivery_address,delivery_date,status,quantity,equipment_types(name)').order('created_at',{ascending:false}).limit(50),
      supabase.from('pickups').select('id,status,scheduled_pickup_date').in('status',['called_off','scheduled']),
      supabase.from('visits').select('id,planned_for,completed_at').is('completed_at',null),
      supabase.from('customers').select('id,name,phone,email,billing_address,notes,last_visit_at,created_at').order('name'),
      supabase.from('customer_engagements').select('id,customer_id,user_id,engagement_type,notes,occurred_at,follow_up_at,created_at').order('occurred_at',{ascending:false}).limit(500)
    ])
    setEquipment((eq.data ?? []) as Equipment[]); setOrders((ord.data ?? []) as unknown as Order[]); setPickups((pick.data ?? []) as Pickup[]); setVisits((visit.data ?? []) as Visit[]); setCustomers((cust.data ?? []) as Customer[]); setEngagements((eng.data ?? []) as Engagement[])
  }

  async function sendMagicLink(e:FormEvent){ e.preventDefault(); setMessage('Sending sign-in link...'); const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}}); setMessage(error ? error.message : 'Check your email for the LTC Rentals sign-in link.') }
  async function signOut(){ await supabase.auth.signOut(); setUser(null); setAuthorized(false) }
  async function updateQty(item:Equipment,newQty:number){ const qty=Math.max(0,Number.isFinite(newQty)?newQty:0); setEquipment(prev=>prev.map(x=>x.id===item.id?{...x,available_qty:qty}:x)); await supabase.from('equipment_types').update({available_qty:qty,updated_at:new Date().toISOString()}).eq('id',item.id); await supabase.from('inventory_snapshots').upsert({equipment_type_id:item.id,available_qty:qty,snapshot_date:new Date().toISOString().slice(0,10),source:'crm'}, {onConflict:'equipment_type_id,snapshot_date'}) }

  async function addCustomer(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setSaving(true)
    const f=new FormData(e.currentTarget)
    const payload={name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||'').trim()||null,email:String(f.get('email')||'').trim()||null,billing_address:String(f.get('billing_address')||'').trim()||null,notes:String(f.get('notes')||'').trim()||null}
    const {data,error}=await supabase.from('customers').insert(payload).select('id').single()
    setSaving(false)
    if(error){alert(error.message);return}
    await loadData(); setShowAddCustomer(false); setSelectedCustomerId(data.id); setTab('customers')
  }

  async function addEngagement(e:FormEvent<HTMLFormElement>,customerId:string){
    e.preventDefault(); if(!user)return; setSaving(true)
    const f=new FormData(e.currentTarget)
    const occurredRaw=String(f.get('occurred_at')||'')
    const followRaw=String(f.get('follow_up_at')||'')
    const payload={customer_id:customerId,user_id:user.id,engagement_type:String(f.get('engagement_type')||'note'),notes:String(f.get('notes')||'').trim(),occurred_at:occurredRaw?new Date(occurredRaw).toISOString():new Date().toISOString(),follow_up_at:followRaw?new Date(followRaw).toISOString():null}
    const {error}=await supabase.from('customer_engagements').insert(payload)
    if(!error && payload.engagement_type==='visit') await supabase.from('customers').update({last_visit_at:payload.occurred_at}).eq('id',customerId)
    setSaving(false)
    if(error){alert(error.message);return}
    e.currentTarget.reset(); await loadData()
  }

  const availableUnits=useMemo(()=>equipment.reduce((s,x)=>s+x.available_qty,0),[equipment])
  const scheduledDeliveries=orders.filter(x=>x.status==='scheduled').length
  const latestByCustomer=useMemo(()=>{const m=new Map<string,Engagement>(); for(const x of engagements){if(!m.has(x.customer_id))m.set(x.customer_id,x)} return m},[engagements])
  const followUps=engagements.filter(x=>x.follow_up_at && new Date(x.follow_up_at)<=new Date()).length
  const staleCustomers=customers.filter(c=>{const x=latestByCustomer.get(c.id); if(!x)return true; return Date.now()-new Date(x.occurred_at).getTime()>30*86400000}).length
  const selectedCustomer=customers.find(c=>c.id===selectedCustomerId) || null
  const filteredCustomers=customers.filter(c=>[c.name,c.phone||'',c.email||''].join(' ').toLowerCase().includes(customerSearch.toLowerCase()))
  const Logo=({className}:{className:string})=><img src={logo} alt="LTC Rentals" className={className}/>

  if(loading) return <div className="login-wrap"><div className="login-card"><Logo className="login-logo"/><p>Loading CRM & Rental Operations…</p></div></div>
  if(!user) return <div className="login-wrap"><form className="login-card" onSubmit={sendMagicLink}><Logo className="login-logo"/><p>CRM & Rental Operations</p><div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div><button className="btn btn-primary" style={{width:'100%',marginTop:14}} type="submit">Email me a sign-in link</button>{message && <div className="notice">{message}</div>}</form></div>
  if(!authorized) return <div className="login-wrap"><div className="login-card"><Logo className="login-logo"/><h1>Access pending</h1><p>Your login worked, but this account has not been activated for the CRM.</p><button className="btn btn-dark" style={{width:'100%'}} onClick={signOut}>Sign out</button></div></div>

  function goCustomers(){setSelectedCustomerId(null);setTab('customers')}
  const title=tab==='home'?'Customer Relationships':tab==='customers'?(selectedCustomer?.name||'Customers'):tab==='inventory'?'Inventory':tab==='orders'?'Orders':'New Rental Order'

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><Logo className="brand-logo"/></div><div className="top-actions"><button className="btn btn-primary" onClick={()=>{setShowAddCustomer(true);setTab('customers')}}>+ Customer</button><button className="btn btn-light desktop" onClick={()=>setTab('new-order')}>+ Order</button><button className="btn btn-dark desktop" onClick={signOut}>Sign Out</button></div></header>
    <main className="container">
      <div className="hero"><div><h2>{title}</h2><p>{tab==='home'?'Track relationships, conversations and follow-ups':new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p></div></div>
      <nav className="nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}>CRM Home</button><button className={tab==='customers'?'active':''} onClick={goCustomers}>Customers</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Orders</button><button className={tab==='inventory'?'active':''} onClick={()=>setTab('inventory')}>Inventory</button></nav>
      {tab==='home' && <CrmDashboard customers={customers.length} followUps={followUps} stale={staleCustomers} visits={visits.length} deliveries={scheduledDeliveries} engagements={engagements.slice(0,8)} customerMap={new Map(customers.map(c=>[c.id,c]))} goCustomers={goCustomers} addCustomer={()=>{setShowAddCustomer(true);setTab('customers')}}/>}
      {tab==='customers' && !selectedCustomer && <CustomersScreen customers={filteredCustomers} search={customerSearch} setSearch={setCustomerSearch} open={id=>setSelectedCustomerId(id)} add={()=>setShowAddCustomer(true)}/>} 
      {tab==='customers' && selectedCustomer && <CustomerDetail customer={selectedCustomer} engagements={engagements.filter(x=>x.customer_id===selectedCustomer.id)} back={()=>setSelectedCustomerId(null)} addEngagement={addEngagement} saving={saving} newOrder={()=>setTab('new-order')}/>} 
      {tab==='inventory' && <Inventory equipment={equipment} onQty={updateQty}/>} 
      {tab==='orders' && <Orders orders={orders}/>} 
      {tab==='new-order' && <NewOrder equipment={equipment} user={user} onSaved={async()=>{await loadData();setTab('orders')}} saving={saving} setSaving={setSaving}/>} 
    </main>
    {showAddCustomer && <AddCustomerModal close={()=>setShowAddCustomer(false)} submit={addCustomer} saving={saving}/>} 
    <div className="bottom-nav"><button onClick={()=>setTab('home')}>CRM</button><button onClick={goCustomers}>Customers</button><button onClick={()=>setTab('orders')}>Orders</button><button onClick={()=>setTab('inventory')}>Inventory</button></div>
  </div>
}

function CrmDashboard({customers,followUps,stale,visits,deliveries,engagements,customerMap,goCustomers,addCustomer}:{customers:number;followUps:number;stale:number;visits:number;deliveries:number;engagements:Engagement[];customerMap:Map<string,Customer>;goCustomers:()=>void;addCustomer:()=>void}){
  return <><div className="grid crm-grid"><button className="card" onClick={goCustomers}><div className="muted">Customers</div><div className="metric">{customers}</div></button><button className="card attention" onClick={goCustomers}><div className="muted">Follow-ups Due</div><div className="metric">{followUps}</div></button><button className="card attention" onClick={goCustomers}><div className="muted">No Contact in 30+ Days</div><div className="metric">{stale}</div></button><div className="card"><div className="muted">Planned Visits</div><div className="metric">{visits}</div></div><div className="card"><div className="muted">Scheduled Deliveries</div><div className="metric">{deliveries}</div></div><button className="card" onClick={addCustomer}><div className="muted">Quick Action</div><div className="metric small-metric">+ Add Customer</div></button></div><div className="section-title"><h3>Recent Customer Activity</h3><button className="btn btn-primary" onClick={addCustomer}>+ New Customer</button></div><div className="activity-list">{engagements.length?engagements.map(e=><div className="activity-item" key={e.id}><div><strong>{customerMap.get(e.customer_id)?.name||'Customer'}</strong><span className="activity-type">{e.engagement_type}</span><p>{e.notes}</p></div><time>{formatWhen(e.occurred_at)}</time></div>):<div className="card empty">No customer activity yet. Add a customer and record your first conversation.</div>}</div></>
}

function CustomersScreen({customers,search,setSearch,open,add}:{customers:Customer[];search:string;setSearch:(v:string)=>void;open:(id:string)=>void;add:()=>void}){
  return <><div className="customer-toolbar"><input className="search-box" placeholder="Search company, phone or email" value={search} onChange={e=>setSearch(e.target.value)}/><button className="btn btn-primary" onClick={add}>+ Add Customer</button></div><div className="customer-list">{customers.map(c=><button className="customer-row" key={c.id} onClick={()=>open(c.id)}><div><strong>{c.name}</strong><span>{c.phone||c.email||'No contact information yet'}</span></div><span className="chevron">›</span></button>)}{!customers.length&&<div className="card empty">No customers found.</div>}</div></>
}

function CustomerDetail({customer,engagements,back,addEngagement,saving,newOrder}:{customer:Customer;engagements:Engagement[];back:()=>void;addEngagement:(e:FormEvent<HTMLFormElement>,id:string)=>void;saving:boolean;newOrder:()=>void}){
  return <><div className="detail-actions"><button className="btn btn-light" onClick={back}>← Customers</button>{customer.phone&&<a className="btn btn-light link-btn" href={`tel:${customer.phone}`}>Call</a>}{customer.email&&<a className="btn btn-light link-btn" href={`mailto:${customer.email}`}>Email</a>}<button className="btn btn-primary" onClick={newOrder}>Place Order</button></div><div className="customer-layout"><section><div className="card customer-profile"><h3>{customer.name}</h3><div>{customer.phone||'No phone'}</div><div>{customer.email||'No email'}</div><div>{customer.billing_address||'No address'}</div>{customer.notes&&<p className="profile-notes">{customer.notes}</p>}</div><form className="card engagement-form" onSubmit={e=>addEngagement(e,customer.id)}><h3>Record Customer Engagement</h3><div className="form-grid"><div className="field"><label>Type</label><select name="engagement_type" defaultValue="note"><option value="note">Note</option><option value="call">Phone Call</option><option value="email">Email</option><option value="visit">Jobsite / Office Visit</option><option value="meeting">Meeting</option><option value="follow_up">Follow-up</option></select></div><div className="field"><label>Date & Time</label><input name="occurred_at" type="datetime-local" defaultValue={localDateTime()}/></div><div className="field wide"><label>What happened?</label><textarea name="notes" placeholder="Who did you speak with? What did you discuss? What do they need?" required/></div><div className="field"><label>Follow-up date (optional)</label><input name="follow_up_at" type="datetime-local"/></div></div><button className="btn btn-primary" style={{marginTop:14}} disabled={saving}>{saving?'Saving…':'Save Engagement'}</button></form></section><section><div className="section-title first"><h3>Engagement History</h3></div><div className="timeline">{engagements.map(e=><div className="timeline-item" key={e.id}><div className="timeline-dot"/><div><div className="timeline-head"><strong>{labelType(e.engagement_type)}</strong><time>{formatWhen(e.occurred_at)}</time></div><p>{e.notes}</p>{e.follow_up_at&&<div className="follow-up">Follow up: {new Date(e.follow_up_at).toLocaleString()}</div>}</div></div>)}{!engagements.length&&<div className="card empty">No engagement notes yet.</div>}</div></section></div></>
}

function AddCustomerModal({close,submit,saving}:{close:()=>void;submit:(e:FormEvent<HTMLFormElement>)=>void;saving:boolean}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)close()}}><form className="modal-card" onSubmit={submit}><div className="modal-head"><h2>Add Customer</h2><button type="button" className="close-btn" onClick={close}>×</button></div><div className="form-grid"><div className="field wide"><label>Company / Customer Name</label><input name="name" required autoFocus/></div><div className="field"><label>Phone</label><input name="phone" type="tel"/></div><div className="field"><label>Email</label><input name="email" type="email"/></div><div className="field wide"><label>Address</label><input name="billing_address"/></div><div className="field wide"><label>Initial notes</label><textarea name="notes" placeholder="How did you meet them? What type of work do they do? Anything useful to remember?"/></div></div><button className="btn btn-primary" style={{marginTop:16,width:'100%'}} disabled={saving}>{saving?'Saving…':'Create Customer'}</button></form></div>}

function Inventory({equipment,onQty}:{equipment:Equipment[];onQty:(i:Equipment,q:number)=>void}){return <><div className="section-title"><h3>{equipment.length} Equipment Types</h3><span className="muted">Edit quantity to update availability</span></div><div className="table-wrap"><table className="table"><thead><tr><th>Equipment</th><th>Category</th><th>Available</th><th>Daily</th><th>Weekly</th><th>4 Week</th></tr></thead><tbody>{equipment.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.category || '—'}</td><td><input aria-label={`Available ${item.name}`} style={{width:72,padding:8,border:'1px solid #ccc',borderRadius:8}} type="number" min="0" value={item.available_qty} onChange={e=>onQty(item,Number(e.target.value))}/></td><td>{money(item.daily_rate)}</td><td>{money(item.weekly_rate)}</td><td>{money(item.four_week_rate)}</td></tr>)}</tbody></table></div></>}
function Orders({orders}:{orders:Order[]}){if(!orders.length) return <div className="card empty">No orders yet.</div>; return <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Job</th><th>Equipment</th><th>Qty</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>#{o.order_number}</td><td><strong>{o.job_name || '—'}</strong><br/><span className="muted">{o.delivery_address || ''}</span></td><td>{o.equipment_types?.name || '—'}</td><td>{o.quantity}</td><td>{o.delivery_date || '—'}</td><td><span className="pill">{o.status}</span></td></tr>)}</tbody></table></div>}
function NewOrder({equipment,user,onSaved,saving,setSaving}:{equipment:Equipment[];user:User;onSaved:()=>void;saving:boolean;setSaving:(v:boolean)=>void}){const [status,setStatus]=useState(''); async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setStatus('Saving order…');const form=new FormData(e.currentTarget);const equipmentId=String(form.get('equipment_type_id'));const chosen=equipment.find(x=>x.id===equipmentId);const payload={equipment_type_id:equipmentId,quantity:Number(form.get('quantity')||1),job_name:String(form.get('job_name')||''),job_contact_name:String(form.get('job_contact_name')||''),job_contact_phone:String(form.get('job_contact_phone')||''),ordered_by_name:String(form.get('ordered_by_name')||''),ordered_by_phone:String(form.get('ordered_by_phone')||''),daily_rate:chosen?.daily_rate,weekly_rate:chosen?.weekly_rate,four_week_rate:chosen?.four_week_rate,delivery_address:String(form.get('delivery_address')||''),delivery_instructions:String(form.get('delivery_instructions')||''),delivery_date:String(form.get('delivery_date')||''),order_date:new Date().toISOString().slice(0,10),salesperson_user_id:user.id,status:'new'};const {error}=await supabase.from('orders').insert(payload);setSaving(false);if(error){setStatus(error.message);return}setStatus('Order submitted successfully.');onSaved()}return <form className="card" onSubmit={submit}><div className="form-grid"><div className="field"><label>Job name</label><input name="job_name" required/></div><div className="field"><label>Equipment</label><select name="equipment_type_id" required defaultValue=""><option value="" disabled>Select equipment</option>{equipment.map(x=><option key={x.id} value={x.id}>{x.name} — {x.available_qty} available</option>)}</select></div><div className="field"><label>Quantity</label><input name="quantity" type="number" min="1" defaultValue="1" required/></div><div className="field"><label>Delivery date</label><input name="delivery_date" type="date" required/></div><div className="field"><label>Job contact name</label><input name="job_contact_name"/></div><div className="field"><label>Job contact phone</label><input name="job_contact_phone" type="tel"/></div><div className="field"><label>Person placing order</label><input name="ordered_by_name" defaultValue="Tom T" required/></div><div className="field"><label>Order contact phone</label><input name="ordered_by_phone" type="tel"/></div><div className="field wide"><label>Delivery address</label><input name="delivery_address" required/></div><div className="field wide"><label>Special delivery instructions</label><textarea name="delivery_instructions"/></div></div><button className="btn btn-primary" style={{marginTop:16}} disabled={saving}>{saving?'Submitting…':'Submit Order'}</button>{status&&<div className="notice">{status}</div>}</form>}
function money(v:number|null){return v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v)}
function formatWhen(v:string){return new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function labelType(v:string){return ({note:'Note',call:'Phone Call',email:'Email',visit:'Visit',meeting:'Meeting',follow_up:'Follow-up'} as Record<string,string>)[v]||v}
function localDateTime(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
