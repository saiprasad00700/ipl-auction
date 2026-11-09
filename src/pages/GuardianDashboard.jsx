import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value || 0));

export default function GuardianDashboard() {
  const { user, loginWithGoogle } = useAuth();
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/guardian/errors', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Guardian errors');
      setErrors(Array.isArray(data.errors) ? data.errors : []);
    } catch (error) {
      setMessage(error?.message || 'Could not load Guardian errors');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (!user) return <main className="min-h-screen bg-[#050914] text-white flex items-center justify-center p-5"><section className="max-w-md rounded-2xl border border-white/10 bg-[#0b1525] p-7 text-center"><h1 className="text-2xl font-black">SS AUCTION GUARDIAN</h1><p className="mt-2 text-sm text-slate-400">Sign in with the authorized administrator Google account.</p><button onClick={loginWithGoogle} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950">Sign in with Google</button></section></main>;

  return <main className="min-h-screen bg-[#050914] p-4 text-white sm:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><Link to="/admin" className="text-xs text-slate-400">← Admin panel</Link><h1 className="mt-2 text-2xl font-black">SS AUCTION GUARDIAN</h1><p className="text-sm text-slate-400">Latest platform errors and alerts</p></div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      {message && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{message}</div>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#0b1525] p-4"><p className="text-xs text-slate-400">Total shown</p><p className="mt-2 text-2xl font-black">{number(errors.length)}</p></div>
        <div className="rounded-xl border border-white/10 bg-[#0b1525] p-4"><p className="text-xs text-slate-400">Critical</p><p className="mt-2 text-2xl font-black text-rose-300">{number(errors.filter(e => e.severity === 'critical').length)}</p></div>
        <div className="rounded-xl border border-white/10 bg-[#0b1525] p-4"><p className="text-xs text-slate-400">High</p><p className="mt-2 text-2xl font-black text-amber-300">{number(errors.filter(e => e.severity === 'high').length)}</p></div>
        <div className="rounded-xl border border-white/10 bg-[#0b1525] p-4"><p className="text-xs text-slate-400">Open</p><p className="mt-2 text-2xl font-black">{number(errors.filter(e => e.status === 'open').length)}</p></div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1525]">
        <div className="border-b border-white/10 p-4 font-bold">Recent errors (latest 100)</div>
        {errors.length ? <div className="divide-y divide-white/5">{errors.map(error => <article key={error.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${error.severity === 'critical' ? 'bg-rose-400/15 text-rose-300' : error.severity === 'high' ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-400/15 text-slate-300'}`}>{error.severity}</span><strong className="text-sm">{error.operation}</strong><span className="ml-auto text-xs text-slate-500">{error.created_at ? new Date(error.created_at).toLocaleString('en-IN') : ''}</span></div>
          <p className="break-words text-sm text-slate-200">{error.message}</p>
          <div className="text-[11px] text-slate-500">ID {error.id} · Room {error.room_id || '—'} · {error.source} · {error.status}</div>
        </article>)}</div> : <p className="p-6 text-sm text-slate-400">No Guardian errors have been recorded yet.</p>}
      </section>
      <p className="text-xs text-slate-600">This dashboard displays recorded errors only. A failure is detectable only when the relevant operation reports it to Guardian.</p>
    </div>
  </main>;
}
