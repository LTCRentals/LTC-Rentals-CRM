'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Tab = 'home' | 'inventory' | 'orders' | 'new-order'
type Equipment = { id:string; name:string; category:string|null; available_qty:number; daily_rate:number|null; weekly_rate:number|null; four_week_rate:number|null }
type Order = { id:string; order_number:number; job_name:string|null; ordered_by_name:string|null; delivery_address:string|null; delivery_date:string|null; status:string; quantity:number; equipment_types?:{name:string}|null }
type Pickup = { id:string; status:string; scheduled_pickup_date:string|null }
type Visit = { id:string; planned_for:string; completed_at:string|null }

const adminEmail = 'tomt@ltcrentals.net'

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
  const [saving,setSaving] = useState(false)

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{ setUser(data.user); if(data.user) initialize(data.user); else setLoading(false) })
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
      setUser(session?.user ?? null)
      if(session?.user) initialize(session.user); else { setAuthorized(false); setLoading(false) }
    })
    return ()=>listener.subscription.unsubscribe()
  },[])

  async function initialize(currentUser:User){
    setLoading(true)
    let {data:profile}=await supabase.from('app_users').select('id,active,role').eq('id',currentUser.id).maybeSingle()
    if(!profile && currentUser.email?.toLowerCase()===adminEmail){
      await supabase.from('app_users').insert({id:currentUser.id,full_name:'Tom T',role:'admin',active:true})
      const result=await supabase.from('app_users').select('id,active,role').eq('id',currentUser.id).maybeSingle()
      profile=result.data
    }
    const ok=Boolean(profile?.active)
    setAuthorized(ok)
    if(ok) await loadData()
    setLoading(false)
  }

  async function loadData(){
    const [eq,ord,pick,visit]=await Promise.all([
      supabase.from('equipment_types').select('id,name,category,available_qty,daily_rate,weekly_rate,four_week_rate').eq('active',true).order('category').order('name'),
      supabase.from('orders').select('id,order_number,job_name,ordered_by_name,delivery_address,delivery_date,status,quantity,equipment_types(name)').order('created_at',{ascending:false}).limit(50),
      supabase.from('pickups').select('id,status,scheduled_pickup_date').in('status',['called_off','scheduled']),
      supabase.from('visits').select('id,planned_for,completed_at').is('completed_at',null)
    ])
    setEquipment((eq.data ?? []) as Equipment[])
    setOrders((ord.data ?? []) as unknown as Order[])
    setPickups((pick.data ?? []) as Pickup[])
    setVisits((visit.data ?? []) as Visit[])
  }

  async function sendMagicLink(e:FormEvent){
    e.preventDefault(); setMessage('Sending sign-in link...')
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}})
    setMessage(error ? error.message : 'Check your email for the LTC Rentals sign-in link.')
  }

  async function signOut(){ await supabase.auth.signOut(); setUser(null); setAuthorized(false) }

  async function updateQty(item:Equipment,newQty:number){
    const qty=Math.max(0,Number.isFinite(newQty)?newQty:0)
    setEquipment(prev=>prev.map(x=>x.id===item.id?{...x,available_qty:qty}:x))
    await supabase.from('equipment_types').update({available_qty:qty,updated_at:new Date().toISOString()}).eq('id',item.id)
    await supabase.from('inventory_snapshots').upsert({equipment_type_id:item.id,available_qty:qty,snapshot_date:new Date().toISOString().slice(0,10),source:'crm'}, {onConflict:'equipment_type_id,snapshot_date'})
  }

  const availableUnits=useMemo(()=>equipment.reduce((s,x)=>s+x.available_qty,0),[equipment])
  const scheduledDeliveries=orders.filter(x=>x.status==='scheduled').length
  const newOrders=orders.filter(x=>x.status==='new').length

  if(loading) return <div className="login-wrap"><div className="login-card"><div className="logo-lg">LTC</div><p>Loading LTC Rentals CRM…</p></div></div>

  if(!user) return <div className="login-wrap"><form className="login-card" onSubmit={sendMagicLink}><div className="logo-lg">LTC</div><h1>LTC Rentals</h1><p>CRM & Rental Operations</p><div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div><button className="btn btn-primary" style={{width:'100%',marginTop:14}} type="submit">Email me a sign-in link</button>{message && <div className="notice">{message}</div>}</form></div>

  if(!authorized) return <div className="login-wrap"><div className="login-card"><div className="logo-lg">LTC</div><h1>Access pending</h1><p>Your login worked, but this account has not been activated for the CRM.</p><button className="btn btn-dark" style={{width:'100%'}} onClick={signOut}>Sign out</button></div></div>

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">LTC</div><div><h1>LTC Rentals</h1><small>CRM & Rental Operations</small></div></div><div className="top-actions"><button className="btn btn-primary" onClick={()=>setTab('new-order')}>+ New Order</button><button className="btn btn-dark desktop" onClick={signOut}>Sign Out</button></div></header>
    <main className="container">
      <div className="hero"><div><h2>{tab==='home'?'Today':tab==='inventory'?'Inventory':tab==='orders'?'Orders':'New Rental Order'}</h2><p>{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p></div></div>
      <nav className="nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}>Home</button><button className={tab==='inventory'?'active':''} onClick={()=>setTab('inventory')}>Inventory</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Orders</button><button className={tab==='new-order'?'active':''} onClick={()=>setTab('new-order')}>Place Order</button></nav>
      {tab==='home' && <Dashboard deliveries={scheduledDeliveries} pickups={pickups.length} visits={visits.length} available={availableUnits} newOrders={newOrders} recentOrders={orders.slice(0,6)} go={setTab}/>} 
      {tab==='inventory' && <Inventory equipment={equipment} onQty={updateQty}/>} 
      {tab==='orders' && <Orders orders={orders}/>} 
      {tab==='new-order' && <NewOrder equipment={equipment} user={user} onSaved={async()=>{await loadData();setTab('orders')}} saving={saving} setSaving={setSaving}/>} 
    </main>
    <div className="bottom-nav"><button onClick={()=>setTab('home')}>Home</button><button onClick={()=>setTab('inventory')}>Inventory</button><button onClick={()=>setTab('orders')}>Orders</button><button onClick={()=>setTab('new-order')}>New Order</button></div>
  </div>
}

function Dashboard({deliveries,pickups,visits,available,newOrders,recentOrders,go}:{deliveries:number;pickups:number;visits:number;available:number;newOrders:number;recentOrders:Order[];go:(t:Tab)=>void}){
  return <><div className="grid"><button className="card" onClick={()=>go('orders')} style={{textAlign:'left'}}><div className="muted">Scheduled Deliveries</div><div className="metric">{deliveries}</div></button><div className="card"><div className="muted">Scheduled Pickups</div><div className="metric">{pickups}</div></div><div className="card"><div className="muted">Planned Visits</div><div className="metric">{visits}</div></div><button className="card" onClick={()=>go('inventory')} style={{textAlign:'left'}}><div className="muted">Available Equipment</div><div className="metric">{available}</div></button><button className="card" onClick={()=>go('orders')} style={{textAlign:'left'}}><div className="muted">New Orders</div><div className="metric">{newOrders}</div></button><button className="card" onClick={()=>go('new-order')} style={{textAlign:'left'}}><div className="muted">Quick Action</div><div className="metric" style={{fontSize:22}}>Place Rental Order</div></button></div><div className="section-title"><h3>Recent Orders</h3></div><Orders orders={recentOrders}/></>
}

function Inventory({equipment,onQty}:{equipment:Equipment[];onQty:(i:Equipment,q:number)=>void}){
  return <><div className="section-title"><h3>{equipment.length} Equipment Types</h3><span className="muted">Edit quantity to update availability</span></div><div className="table-wrap"><table className="table"><thead><tr><th>Equipment</th><th>Category</th><th>Available</th><th>Daily</th><th>Weekly</th><th>4 Week</th></tr></thead><tbody>{equipment.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.category || '—'}</td><td><input aria-label={`Available ${item.name}`} style={{width:72,padding:8,border:'1px solid #ccc',borderRadius:8}} type="number" min="0" value={item.available_qty} onChange={e=>onQty(item,Number(e.target.value))}/></td><td>{money(item.daily_rate)}</td><td>{money(item.weekly_rate)}</td><td>{money(item.four_week_rate)}</td></tr>)}</tbody></table></div></>
}

function Orders({orders}:{orders:Order[]}){
  if(!orders.length) return <div className="card empty">No orders yet.</div>
  return <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Job</th><th>Equipment</th><th>Qty</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>#{o.order_number}</td><td><strong>{o.job_name || '—'}</strong><br/><span className="muted">{o.delivery_address || ''}</span></td><td>{o.equipment_types?.name || '—'}</td><td>{o.quantity}</td><td>{o.delivery_date || '—'}</td><td><span className="pill">{o.status}</span></td></tr>)}</tbody></table></div>
}

function NewOrder({equipment,user,onSaved,saving,setSaving}:{equipment:Equipment[];user:User;onSaved:()=>void;saving:boolean;setSaving:(v:boolean)=>void}){
  const [status,setStatus]=useState('')
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setStatus('Saving order…')
    const form=new FormData(e.currentTarget)
    const equipmentId=String(form.get('equipment_type_id'))
    const chosen=equipment.find(x=>x.id===equipmentId)
    const payload={equipment_type_id:equipmentId,quantity:Number(form.get('quantity')||1),job_name:String(form.get('job_name')||''),job_contact_name:String(form.get('job_contact_name')||''),job_contact_phone:String(form.get('job_contact_phone')||''),ordered_by_name:String(form.get('ordered_by_name')||''),ordered_by_phone:String(form.get('ordered_by_phone')||''),daily_rate:chosen?.daily_rate,weekly_rate:chosen?.weekly_rate,four_week_rate:chosen?.four_week_rate,delivery_address:String(form.get('delivery_address')||''),delivery_instructions:String(form.get('delivery_instructions')||''),delivery_date:String(form.get('delivery_date')||''),order_date:new Date().toISOString().slice(0,10),salesperson_user_id:user.id,status:'new'}
    const {error}=await supabase.from('orders').insert(payload)
    setSaving(false)
    if(error){setStatus(error.message);return}
    setStatus('Order submitted successfully.');onSaved()
  }
  return <form className="card" onSubmit={submit}><div className="form-grid"><div className="field"><label>Job name</label><input name="job_name" required/></div><div className="field"><label>Equipment</label><select name="equipment_type_id" required defaultValue=""><option value="" disabled>Select equipment</option>{equipment.map(x=><option key={x.id} value={x.id}>{x.name} — {x.available_qty} available</option>)}</select></div><div className="field"><label>Quantity</label><input name="quantity" type="number" min="1" defaultValue="1" required/></div><div className="field"><label>Delivery date</label><input name="delivery_date" type="date" required/></div><div className="field"><label>Job contact name</label><input name="job_contact_name"/></div><div className="field"><label>Job contact phone</label><input name="job_contact_phone" type="tel"/></div><div className="field"><label>Person placing order</label><input name="ordered_by_name" defaultValue="Tom T" required/></div><div className="field"><label>Order contact phone</label><input name="ordered_by_phone" type="tel"/></div><div className="field wide"><label>Delivery address</label><input name="delivery_address" required/></div><div className="field wide"><label>Special delivery instructions</label><textarea name="delivery_instructions"/></div></div><button className="btn btn-primary" style={{marginTop:16}} disabled={saving}>{saving?'Submitting…':'Submit Order'}</button>{status&&<div className="notice">{status}</div>}</form>
}

function money(v:number|null){return v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v)}
