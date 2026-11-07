import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Activity, ArrowLeft, CheckCircle2, BarChart3, Clock3, RefreshCw, Users, UserRoundCheck, Gavel, MessageCircle, Mic, CalendarDays, TrendingUp } from 'lucide-react';

const ADMIN_EMAIL = String(import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value || 0));
const cardClass = 'rounded-2xl border border-white/10 bg-[#0b1525] p-4 sm:p-5';
const chartLabel = (value) => value > 999 ? (value / 1000).toFixed(1) + 'k' : String(value);

function MetricCard({ icon: Icon, label, value, detail }) {
  return <div className={cardClass}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <Icon className="h-4 w-4 text-emerald-300" />
    </div>
    <div className="mt-3 text-3xl font-black tracking-tight text-white">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{detail}</div>
  </div>;
}

export default function InsightsDashboard() {
  const { user, loginWithGoogle } = useAuth();
  const [days, setDays] = useState(30);
  const [live, setLive] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const isAdmin = Boolean(user?.email && user.email.trim().toLowerCase() === ADMIN_EMAIL);

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: 'Bearer ' + token };
      const [liveResponse, reportResponse] = await Promise.all([
        fetch('/api/insights/live', { headers, cache: 'no-store' }),
        fetch('/api/insights/report?days=' + days, { headers, cache: 'no-store' })
      ]);
      const [liveData, reportData] = await Promise.all([liveResponse.json(), reportResponse.json()]);
      if (!liveResponse.ok) throw new Error(liveData.error || 'Could not load live statistics');
      if (!reportResponse.ok) throw new Error(reportData.error || 'Could not load historical statistics');
      setLive(liveData);
      setReport(reportData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || 'Unable to load insights');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, days]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user || !isAdmin) return undefined;
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [user, isAdmin, load]);

  const maxDaily = useMemo(() => Math.max(1, ...(report?.daily || []).map((item) => item.users)), [report]);
  const maxHourly = useMemo(() => Math.max(1, ...(report?.hourly || []).map((item) => item.users)), [report]);
  const maxEvents = useMemo(() => Math.max(1, ...Object.values(report?.eventCounts || {})), [report]);

  if (!user) return <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center p-5">
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1525] p-8 text-center">
      <Activity className="mx-auto mb-4 h-9 w-9 text-emerald-300" />
      <h1 className="text-xl font-black">SS AUCTION INSIGHTS</h1>
      <p className="mt-2 text-sm text-slate-400">Sign in with the authorized Google administrator account to view private statistics.</p>
      <button onClick={loginWithGoogle} className="mt-6 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950">Sign in with Google</button>
    </div>
  </div>;

  if (!isAdmin) return <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center p-5">
    <div className="max-w-md rounded-3xl border border-rose-400/20 bg-[#0b1525] p-8 text-center">
      <h1 className="text-xl font-black">Access restricted</h1>
      <p className="mt-2 text-sm text-slate-400">This dashboard is available only to the authorized SS AUCTION administrator.</p>
      <Link to="/admin" className="mt-5 inline-flex text-sm font-bold text-emerald-300">Back to admin panel</Link>
    </div>
  </div>;

  return <main className="min-h-screen bg-[#050914] px-3 py-5 text-white sm:px-6 sm:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Admin panel</Link>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2.5"><Activity className="h-6 w-6 text-emerald-300" /></div>
            <div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">SS AUCTION INSIGHTS</h1><p className="mt-1 text-xs text-slate-400">Real-player activity and platform usage</p></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Reporting period" value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-white/10 bg-[#0b1525] px-3 py-2.5 text-sm text-white">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div>}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-300">Live right now</h2><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Live presence</span></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={Users} label="Online players" value={number(live?.onlinePlayers)} detail="Unique real users online now" />
          <MetricCard icon={Gavel} label="Playing now" value={number(live?.activePlayers)} detail="Online in an active auction" />
          <MetricCard icon={Activity} label="Active rooms" value={number(live?.activeRooms)} detail={number(live?.waitingRooms) + ' waiting rooms'} />
          <MetricCard icon={UserRoundCheck} label="Room memberships" value={number(live?.onlineRoomMemberships)} detail="Online room connections" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-300">Player activity · {days} days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard icon={Users} label="Unique players" value={number(report?.totals.uniquePlayers)} detail="Distinct real accounts with activity" />
          <MetricCard icon={CalendarDays} label="Played today" value={number(report?.totals.playersToday)} detail="Unique players today · India time" />
          <MetricCard icon={TrendingUp} label="Returning players" value={number(report?.totals.returningPlayers)} detail="Active on multiple days" />
          <MetricCard icon={Clock3} label="Avg session" value={number(report?.totals.averageSessionMinutes) + ' min'} detail={number(report?.totals.sessions) + ' recorded sessions'} />
          <MetricCard icon={UserRoundCheck} label="Registered players" value={number(report?.totals.registeredPlayers)} detail="Distinct non-anonymous accounts" />
          <MetricCard icon={Users} label="Guest players" value={number(report?.totals.guestPlayers)} detail="Distinct anonymous accounts" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-300">Platform growth · phase 2</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={Users} label="Peak simultaneous" value={number(report?.phaseTwo?.concurrency?.peakOnlinePlayers)} detail="Highest sampled online players · 1-minute samples" />
          <MetricCard icon={Gavel} label="Peak active players" value={number(report?.phaseTwo?.concurrency?.peakActivePlayers)} detail="Highest sampled players in active auctions" />
          <MetricCard icon={Activity} label="Rooms created" value={number(report?.phaseTwo?.rooms?.created)} detail="Tracked room creation events" />
          <MetricCard icon={CheckCircle2} label="Auctions completed" value={number(report?.phaseTwo?.rooms?.completed)} detail="Tracked completed auction events" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className={cardClass}>
            <h3 className="mb-3 font-black">Player retention</h3>
            <p className="mb-4 text-xs text-slate-500">Percentage of players returning on the specified day after their first recorded session. Only mature cohorts are included.</p>
            <div className="grid grid-cols-3 gap-3">
              {(report?.phaseTwo?.retention || []).map((item) => <div key={item.days} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <div className="text-xs text-slate-400">{item.days}-day</div>
                <div className="mt-1 text-2xl font-black">{item.rate}%</div>
                <div className="mt-1 text-[10px] text-slate-500">{number(item.returnedPlayers)} / {number(item.eligiblePlayers)} players</div>
              </div>)}
            </div>
          </div>
          <div className={cardClass}>
            <h3 className="mb-3 font-black">Players by estimated country</h3>
            <p className="mb-3 text-xs text-slate-500">Approximate browser language/region only · not GPS or IP location.</p>
            {(report?.phaseTwo?.countries || []).length ? <div className="space-y-2">{report.phaseTwo.countries.slice(0, 8).map((item) => <div key={item.country} className="flex items-center justify-between text-sm"><span className="text-slate-300">{item.country}</span><strong>{number(item.players)}</strong></div>)}</div> : <p className="text-sm text-slate-500">Country estimates will appear as visitors generate new page-view events.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <div className="mb-5 flex items-center justify-between"><h3 className="font-black">Daily players</h3><span className="text-[10px] text-slate-500">Unique users · IST</span></div>
          <div className="flex h-44 items-end gap-1.5">
            {(report?.daily || []).map((item) => <div key={item.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={item.label + ': ' + item.users + ' players'}>
              <div className="mb-1 text-center text-[9px] text-slate-400 opacity-0 group-hover:opacity-100">{item.users}</div>
              <div className="w-full rounded-t-md bg-emerald-400/80 transition-all" style={{ height: Math.max(item.users ? 5 : 1, item.users / maxDaily * 125) + 'px' }} />
            </div>)}
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-500"><span>{report?.daily?.[0]?.label || '—'}</span><span>{report?.daily?.at(-1)?.label || '—'}</span></div>
        </div>
        <div className={cardClass}>
          <div className="mb-5 flex items-center justify-between"><h3 className="font-black">Peak active hours</h3><span className="text-[10px] text-slate-500">IST · unique users per hour</span></div>
          <div className="flex h-44 items-end gap-1">
            {(report?.hourly || []).map((item) => <div key={item.hour} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={item.label + ': ' + item.users + ' players'}>
              <div className="mb-1 text-center text-[8px] text-slate-400 opacity-0 group-hover:opacity-100">{item.users}</div>
              <div className="w-full rounded-t-sm bg-sky-400/80" style={{ height: Math.max(item.users ? 5 : 1, item.users / maxHourly * 125) + 'px' }} />
            </div>)}
          </div>
          <p className="mt-3 text-xs text-slate-400">Peak: <strong className="text-white">{report?.peakHour?.label || '—'}</strong> · {number(report?.peakHour?.players)} unique players across the selected days. This is not a simultaneous live-player count.</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <h3 className="mb-4 font-black">Activity breakdown</h3>
          <div className="space-y-3">
            {[
              ['Page views', 'page_view', Activity],
              ['Room joins', 'room_join', Users],
              ['Auction starts', 'auction_start', Gavel],
              ['Bids placed', 'bid', BarChart3],
              ['Chat messages', 'chat_message', MessageCircle],
              ['Voice joins', 'voice_join', Mic]
            ].map(([label, key, Icon]) => {
              const value = report?.eventCounts?.[key] || 0;
              return <div key={key}><div className="mb-1 flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-300"><Icon className="h-3.5 w-3.5 text-slate-500" />{label}</span><strong>{number(value)}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-300" style={{ width: (value / maxEvents * 100) + '%' }} /></div></div>;
            })}
          </div>
        </div>
        <div className={cardClass}>
          <h3 className="mb-4 font-black">Most active auction rooms</h3>
          {(report?.topRooms || []).length ? <div className="space-y-3">{report.topRooms.map((room, index) => <div key={room.roomId} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm"><span className="text-slate-300"><span className="mr-3 text-xs text-slate-600">{index + 1}.</span>{room.roomId}</span><strong>{number(room.events)} events</strong></div>)}</div> : <p className="text-sm text-slate-500">No room activity recorded in this period yet.</p>}
        </div>
      </section>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-4 text-[10px] text-slate-500"><span>Timezone: India Standard Time (IST)</span><span>{lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString() : loading ? 'Loading insights…' : 'Waiting for data'}</span><span>Auto-refresh: 60 seconds</span></footer>
      <p className="text-[11px] leading-relaxed text-slate-600">Historical statistics start from the date analytics tracking was deployed. Players who visited before tracking began cannot be counted retrospectively. Current online numbers use Firebase room presence; historical metrics use recorded sessions and events.</p>
    </div>
  </main>;
}
