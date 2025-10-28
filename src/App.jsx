import React, { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const PINCODE = '8448'
const CONSULTANTS = ['Marcus','Lisanna','Nick','Gea','Dion','Sander','Yde']


let db = null
try { db = getFirestore(initializeApp(firebaseConfig)) } catch(e){ console.warn('Firebase init failed', e) }

function isoWeek(d){
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp - yearStart)/86400000 + 1)/7)
}
function todayStr(){ return new Date().toISOString().slice(0,10) }

function triggerConfetti() {
  const colors = ['#FF6B35', '#0066CC', '#FFD700', '#00C851']
  const duration = 1000
  const animationEnd = Date.now() + duration
  
  const randomInRange = (min, max) => Math.random() * (max - min) + min
  
  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now()
    if (timeLeft <= 0) return clearInterval(interval)
    
    const particleCount = 3
    for(let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div')
      particle.style.position = 'fixed'
      particle.style.left = randomInRange(20, 80) + '%'
      particle.style.top = '80%'
      particle.style.width = '10px'
      particle.style.height = '10px'
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
      particle.style.borderRadius = '50%'
      particle.style.pointerEvents = 'none'
      particle.style.zIndex = '9999'
      document.body.appendChild(particle)
      
      const angle = randomInRange(-80, -100) * Math.PI / 180
      const velocity = randomInRange(15, 25)
      let x = 0, y = 0, vx = Math.cos(angle) * velocity, vy = Math.sin(angle) * velocity
      const gravity = 0.8
      
      const animate = () => {
        vy += gravity
        x += vx
        y += vy
        particle.style.transform = `translate(${x}px, ${y}px)`
        if(y < 600) requestAnimationFrame(animate)
        else particle.remove()
      }
      animate()
    }
  }, 50)
}

export default function App(){
  const [authorized, setAuthorized] = useState(false)
  const [pin, setPin] = useState('')
  const [activePerson, setActivePerson] = useState(CONSULTANTS[0])
  const [filterRange, setFilterRange] = useState('week')
  const [viewMode, setViewMode] = useState('all')
  const [date, setDate] = useState(todayStr())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ intakes: 0, interviews: 0, placements: 0, prospects: 0 })
  const [storageError, setStorageError] = useState(null)

  useEffect(() => {
    loadEntries()
  }, [])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const result = await window.storage.list('entry:', true)
      if(result && result.keys) {
        const loadedEntries = []
        for(const key of result.keys) {
          try {
            const data = await window.storage.get(key, true)
            if(data && data.value) {
              loadedEntries.push(JSON.parse(data.value))
            }
          } 
          catch(e) {
            console.warn('Failed to load entry:', key, e)
          }
        }
        loadedEntries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        setEntries(loadedEntries)
      }
    } catch(e) {
      console.error('Failed to load entries:', e)
      setStorageError('Failed to load data')
    }
    setLoading(false)
  }

  const period = useMemo(() => {
    const d = new Date(date)
    return { week: isoWeek(d), month: d.getMonth()+1, year: d.getFullYear() }
  }, [date])

  const filtered = useMemo(() => {
    let result = entries.filter(e => {
      if(filterRange==='week') return e.week===period.week && e.year===period.year
      if(filterRange==='month') return e.month===period.month && e.year===period.year
      if(filterRange==='year') return e.year===period.year
      return true
    })
    
    if(viewMode === 'individual') {
      result = result.filter(e => e.name === activePerson)
    }
    
    return result
  }, [entries, filterRange, period, viewMode, activePerson])

  const consultantData = useMemo(() => {
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

  const total = useMemo(() => consultantData.reduce((acc,cur)=> ({
    intakes: acc.intakes + cur.intakes,
    interviews: acc.interviews + cur.interviews,
    placements: acc.placements + cur.placements,
    prospects: acc.prospects + cur.prospects,
  }), {intakes:0,interviews:0,placements:0,prospects:0}), [consultantData])

  const ranking = useMemo(() => [...consultantData].sort((a,b)=>(b.placements-a.placements)|| (b.intakes-a.intakes) || (b.interviews-a.interviews)), [consultantData])

const submit = async () => {
    if(!authorized){ alert('Enter access code first'); return }
    //if(!db){ alert('Firestore not configured (set VITE_FIREBASE_* env vars)'); return }
    
    const dateNow = new Date(date)
    const timestamp = Date.now()
    const entryId = `entry-${timestamp}-${activePerson.replace(/\s+/g, '')}`
    const payload = {
      id: entryId,
      name: activePerson,
      date: dateNow.toISOString(),
      week: isoWeek(dateNow),
      month: dateNow.getMonth()+1,
      year: dateNow.getFullYear(),
      intakes: Number(form.intakes)||0,
      interviews: Number(form.interviews)||0,
      placements: Number(form.placements)||0,
      prospects: Number(form.prospects)||0,
      createdAt: new Date().toISOString(),
    }
    
    try {
      
      const result = await addDoc(collection(db,'entries'), payload)
      
      if(result) {
        setEntries(prev => [payload, ...prev])
        
        if(payload.placements > 0) {
          triggerConfetti()
        }
        
        setForm({ intakes:0, interviews:0, placements:0, prospects:0 })
      } else {
        throw new Error('Storage operation returned null')
      }
    } catch (error) {
      console.error('Storage error:', error)
      alert('Failed to submit entry: ' + (error.message || 'Unknown error'))
    }
  }

  const handleKeyPress = (e) => {
    if(e.key === 'Enter') {
      if(!authorized && pin) {
        setAuthorized(pin === PINCODE)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 p-6">
      <style>{`
        :root {
          --xelvin-blue: #0066CC;
          --xelvin-orange: #FF6B35;
          --panel: #F8FAFC;
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="max-w-7xl mx-auto">
        {storageError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-300">
            <strong>Storage Error:</strong> {storageError}
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold" style={{color:'var(--xelvin-blue)'}}>Xelvin Performance Dashboard</h1>
            <p className="text-sm text-slate-500">Live results — week / month / year</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Filter Period</label>
              <div className="flex gap-2">
                <select className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" value={filterRange} onChange={(e)=>setFilterRange(e.target.value)}>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
                <input type="date" className="bg-white border border-slate-300 px-3 py-1.5 rounded text-sm focus:outline-none focus:border-blue-500" value={date} onChange={(e)=>setDate(e.target.value)} />
              </div>
            </div>
            <div className="text-sm font-medium text-slate-600 bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
              Status: <span className={loading ? 'text-amber-600' : 'text-green-600'}>{loading?'Loading...':'● Live'}</span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <div className="flex gap-2">
            <button 
              onClick={()=>setViewMode('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode==='all' ? 'bg-[var(--xelvin-blue)] text-white shadow-md' : 'bg-white text-slate-700 border border-slate-200 hover:border-[var(--xelvin-blue)]'}`}>
              All Consultants
            </button>
            <button 
              onClick={()=>setViewMode('individual')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode==='individual' ? 'bg-[var(--xelvin-blue)] text-white shadow-md' : 'bg-white text-slate-700 border border-slate-200 hover:border-[var(--xelvin-blue)]'}`}>
              Individual View
            </button>
          </div>
          
          <div className="flex-1 flex flex-wrap gap-2">
            {CONSULTANTS.map(n => (
              <button key={n}
                onClick={()=>{setActivePerson(n); if(viewMode!=='individual') setViewMode('individual')}}
                className={`px-4 py-2 rounded-lg border font-medium transition-all ${activePerson===n ? 'bg-[var(--xelvin-blue)] text-white border-[var(--xelvin-blue)] shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-[var(--xelvin-blue)] hover:shadow-sm'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-md">
            {!authorized ? (
              <div>
                <h2 className="font-bold text-lg mb-3">🔒 Enter Access Code</h2>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" 
                    placeholder="Access code" 
                    type="password" 
                    value={pin} 
                    onChange={(e)=>setPin(e.target.value)} 
                    onKeyUp={handleKeyPress}
                  />
                  <button className="bg-[var(--xelvin-blue)] text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors" onClick={()=> setAuthorized(pin===PINCODE)}>
                    Unlock
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Required to submit entries.</p>
              </div>
            ) : (
              <div>
                <div className="mb-3 text-sm text-slate-600">
                  Submitting for: <span className="font-bold text-lg" style={{color:'var(--xelvin-blue)'}}>{activePerson}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Candidate intakes" value={form.intakes} onChange={v=>setForm(s=>({...s,intakes:v}))}/>
                  <Field label="Client interviews" value={form.interviews} onChange={v=>setForm(s=>({...s,interviews:v}))}/>
                  <Field label="Placements" value={form.placements} onChange={v=>setForm(s=>({...s,placements:v}))}/>
                  <Field label="New business meetings" value={form.prospects} onChange={v=>setForm(s=>({...s,prospects:v}))}/>
                </div>
                <div className="flex gap-2 mt-4">
                  <button className="bg-[var(--xelvin-blue)] text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md" onClick={submit}>💾 Save Entry</button>
                  <button type="button" className="border border-slate-300 px-6 py-2 rounded-lg hover:bg-slate-50 transition-colors" onClick={()=>setForm({intakes:0,interviews:0,placements:0,prospects:0})}>Reset</button>
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200">
              <h3 className="font-bold text-sm text-slate-600 mb-3">
                {viewMode === 'individual' ? `${activePerson}'s Performance` : 'Team Performance'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Card title="Placements" value={total.placements} accent="var(--xelvin-orange)"/>
                <Card title="Candidate intakes" value={total.intakes} accent="var(--xelvin-blue)"/>
                <Card title="Client interviews" value={total.interviews} accent="#3B82F6"/>
                <Card title="New business meetings" value={total.prospects} accent="#10B981"/>
              </div>
            </div>
          </section>

          <section className="col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-md">
            <h2 className="font-bold text-lg mb-4">📊 Performance Charts</h2>
            <div className="space-y-6">
              <div className="h-48">
                <h3 className="text-sm font-semibold mb-2 text-slate-700">Placements by Consultant</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={consultantData.map(a=>({name:a.name, value:a.placements}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fontSize: 11}} />
                    <YAxis tick={{fontSize: 11}} />
                    <Tooltip />
                    <Bar dataKey="value" name="Placements" fill="var(--xelvin-orange)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-48">
                <h3 className="text-sm font-semibold mb-2 text-slate-700">Candidate Intakes by Consultant</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={consultantData.map(a=>({name:a.name, value:a.intakes}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fontSize: 11}} />
                    <YAxis tick={{fontSize: 11}} />
                    <Tooltip />
                    <Bar dataKey="value" name="Intakes" fill="var(--xelvin-blue)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="col-span-3 bg-gradient-to-br from-[var(--xelvin-blue)] to-blue-700 text-white rounded-xl p-5 shadow-lg">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              🏆 Leaderboard
              <span className="text-xs font-normal opacity-80">(by placements)</span>
            </h2>
            <div className="space-y-2">
              {ranking.map((r, idx) => (
                <div key={r.name}
                  className="flex items-center justify-between bg-white/15 backdrop-blur-sm p-3 rounded-lg hover:bg-white/20 transition-colors animate-fade-in"
                  style={{animationDelay: `${idx * 50}ms`}}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'🏁'}</span>
                    <div>
                      <div className="text-sm font-bold">{r.name}</div>
                      <div className="text-xs text-white/90">P: {r.placements} • I: {r.intakes} • CI: {r.interviews}</div>
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold">{r.placements}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-6 text-xs text-slate-500 text-center bg-white rounded-lg p-3 border border-slate-200">
          💡 Tip: Open on TV in full screen (F11). Data is shared across all users in real-time.
        </footer>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }){
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input type="number" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" value={value} onChange={e=>onChange(e.target.value)} />
    </div>
  )
}

function Card({ title, value, accent }){
  return (
    <div className="rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow" style={{background:'#fff'}}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-extrabold mt-2" style={{color:accent}}>{value}</div>
    </div>
  )
}