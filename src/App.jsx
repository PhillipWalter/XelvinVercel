import React, { useEffect, useMemo, useState } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, serverTimestamp,
  onSnapshot, query, orderBy
} from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'

const PINCODE = '8448'
const CONSULTANTS = ['Marcus','Lisanna','Nick','Gea','Dion','Sander','Yde']

// may have to introduce a database call to update all of the cosultant scores the moment the project initializes
// if the consultant is not present (new consultant) the lookup process should not execute.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const [firebaseError, setFirebaseError] = useState(null)
let db = null
try {
  db = getFirestore(initializeApp(firebaseConfig))
} catch(e){
  console.warn('Firebase init failed', e)
  setFirebaseError(e.message || 'Firebase initialization failed')
}

function isoWeek(d){
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp - yearStart)/86400000 + 1)/7)
}
function todayStr(){ return new Date().toISOString().slice(0,10) }

export default function App(){
  const [authorized, setAuthorized] = useState(false)
  const [pin, setPin] = useState('')
  const [activePerson, setActivePerson] = useState(CONSULTANTS[0])
  const [filterRange, setFilterRange] = useState('week')
  const [date, setDate] = useState(todayStr())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ intakes: 0, interviews: 0, placements: 0, prospects: 0 })

  useEffect(() => {
    if(!db){ setLoading(false); return }
    const q = query(collection(db,'entries'), orderBy('createdAt','desc'))
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d=>({id:d.id, ...d.data()})))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const period = useMemo(() => {
    const d = new Date(date)
    return { week: isoWeek(d), month: d.getMonth()+1, year: d.getFullYear() }
  }, [date])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if(filterRange==='week') return e.week===period.week && e.year===period.year
      if(filterRange==='month') return e.month===period.month && e.year===period.year
      if(filterRange==='year') return e.year===period.year
      return true
    })
  }, [entries, filterRange, period])

  const aggregated = useMemo(() => {
    const base = Object.fromEntries(CONSULTANTS.map(n=>[n,{ name:n, intakes:0, interviews:0, placements:0, prospects:0 }]))
    for(const e of filtered){
      if(!base[e.name]) continue
      base[e.name].intakes += e.intakes||0
      base[e.name].interviews += e.interviews||0
      base[e.name].placements += e.placements||0
      base[e.name].prospects += e.prospects||0
    }
    return Object.values(base)
  }, [filtered])

  const total = useMemo(() => aggregated.reduce((acc,cur)=> ({
    intakes: acc.intakes + cur.intakes,
    interviews: acc.interviews + cur.interviews,
    placements: acc.placements + cur.placements,
    prospects: acc.prospects + cur.prospects,
  }), {intakes:0,interviews:0,placements:0,prospects:0}), [aggregated])

  const ranking = useMemo(() => [...aggregated].sort((a,b)=>(b.placements-a.placements)|| (b.intakes-a.intakes) || (b.interviews-a.interviews)), [aggregated])

  const submit = async (e) => {
    e.preventDefault()
    if(!authorized){ alert('Enter access code first'); return }
    if(!db){ alert('Firestore not configured (set VITE_FIREBASE_* env vars)'); return }
    const d = new Date(date)
    const payload = {
      name: activePerson,
      date: d.toISOString(),
      week: isoWeek(d),
      month: d.getMonth()+1,
      year: d.getFullYear(),
      intakes: Number(form.intakes)||0,
      interviews: Number(form.interviews)||0,
      placements: Number(form.placements)||0,
      prospects: Number(form.prospects)||0,
      createdAt: serverTimestamp(),
    }
    try {
      await addDoc(collection(db,'entries'), payload)
      if(payload.placements>0){
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.8 } })
      }
      setForm({ intakes:0, interviews:0, placements:0, prospects:0 })
    } catch (error) {
      alert('Failed to submit entry: ' + (error.message || error))
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {firebaseError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-300">
            <strong>Firebase Error:</strong> {firebaseError}
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold" style={{color:'var(--xelvin-blue)'}}>Xelvin Performance Dashboard</h1>
            <p className="text-sm text-slate-500">Live results — week / month / year</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-[var(--panel)] px-3 py-2 rounded-md">
              <label className="text-xs text-slate-600">Filter</label>
              <div className="flex gap-2 mt-1">
                <select className="bg-white border rounded px-2 py-1 text-sm" value={filterRange} onChange={(e)=>setFilterRange(e.target.value)}>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
                <input type="date" className="bg-white border px-2 py-1 rounded text-sm" value={date} onChange={(e)=>setDate(e.target.value)} />
              </div>
            </div>
            <div className="text-sm text-slate-500">Status: {loading?'Loading...':'Live'}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {CONSULTANTS.map(n => (
            <button key={n}
              onClick={()=>setActivePerson(n)}
              className={`px-3 py-2 rounded-lg border ${activePerson===n ? 'bg-[var(--xelvin-blue)] text-white border-[var(--xelvin-blue)]' : 'bg-white text-slate-700 border-slate-200 hover:border-[var(--xelvin-blue)]'}`}>
              {n}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-5 bg-white border rounded-lg p-4 shadow-sm">
            {!authorized ? (
              <div>
                <h2 className="font-bold mb-2">Enter access code</h2>
                <div className="flex gap-2">
                  <input className="border rounded px-3 py-2" placeholder="Access code" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} />
                  <button className="bg-[var(--xelvin-blue)] text-white px-4 py-2 rounded" onClick={()=> setAuthorized(pin===PINCODE)}>
                    Unlock
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Required to submit entries.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="mb-2 text-sm text-slate-600">Active consultant: <span className="font-semibold">{activePerson}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Candidate intakes" value={form.intakes} onChange={v=>setForm(s=>({...s,intakes:v}))}/>
                  <Field label="Client interviews" value={form.interviews} onChange={v=>setForm(s=>({...s,interviews:v}))}/>
                  <Field label="Placements" value={form.placements} onChange={v=>setForm(s=>({...s,placements:v}))}/>
                  <Field label="New business meetings" value={form.prospects} onChange={v=>setForm(s=>({...s,prospects:v}))}/>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="bg-[var(--xelvin-blue)] text-white px-4 py-2 rounded">Save</button>
                  <button type="button" className="border px-4 py-2 rounded" onClick={()=>setForm({intakes:0,interviews:0,placements:0,prospects:0})}>Reset</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <Card title="Placements" value={total.placements} accent="var(--xelvin-orange)"/>
              <Card title="Candidate intakes" value={total.intakes} accent="var(--xelvin-blue)"/>
              <Card title="Client interviews" value={total.interviews} accent="#3B82F6"/>
              <Card title="New business meetings" value={total.prospects} accent="#10B981"/>
            </div>
          </section>

          <section className="col-span-4 bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-bold mb-3">Charts</h2>
            <div className="space-y-6">
              <div className="h-48">
                <h3 className="text-sm font-semibold mb-2">Placements</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aggregated.map(a=>({name:a.name, value:a.placements}))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" name="Placements" fill="var(--xelvin-orange)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-48">
                <h3 className="text-sm font-semibold mb-2">Candidate intakes</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aggregated.map(a=>({name:a.name, value:a.intakes}))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" name="Intakes" fill="var(--xelvin-blue)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="col-span-3 bg-[var(--xelvin-blue)] text-white rounded-lg p-4 shadow-sm">
            <h2 className="font-bold mb-3">Ranking (placements)</h2>
            <div className="space-y-2">
              {ranking.map((r, idx) => (
                <motion.div key={r.name}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx*0.04 }}
                  className="flex items-center justify-between bg-white/10 p-2 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'🏁'}</span>
                    <div>
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="text-xs text-white/80">P: {r.placements} • I: {r.intakes} • CI: {r.interviews}</div>
                    </div>
                  </div>
                  <div className="text-lg font-bold">{r.placements}</div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-6 text-xs text-slate-500">
          Tip: open on TV in full screen (F11). Configure Firebase env vars in your host for realtime.
        </footer>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }){
  return (
    <div>
      <label className="block text-sm text-slate-600">{label}</label>
      <input type="number" min="0" className="w-full border rounded px-2 py-1" value={value} onChange={e=>onChange(e.target.value)} />
    </div>
  )
}
function Card({ title, value, accent }){
  return (
    <div className="rounded-xl p-4 border shadow-sm" style={{background:'#fff'}}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-extrabold mt-1" style={{color:accent}}>{value}</div>
    </div>
  )
}
