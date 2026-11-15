import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ref, update, onValue } from 'firebase/database';
import { rtdb, ensureServer2Auth } from '../lib/firebase';
import { trackAnalyticsEvent } from '../lib/insights';

const TOKEN_REFRESH_MS = 4 * 60 * 1000;

const VoiceChat = ({ roomId }) => {
  const { user } = useAuth();
  const clientRef = useRef(null);
  const localTrackRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const rosterUnsubscribeRef = useRef(null);
  const lastVoiceActivityPingRef = useRef(0);
  const speakerOnRef = useRef(true);
  const volumesRef = useRef({});
  const participantNamesRef = useRef({});
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [volumes, setVolumes] = useState({});
  const [error, setError] = useState('');

  const syncParticipants = (client) => {
    const list = (client?.remoteUsers || []).map((remote) => {
      const id = String(remote.uid);
      return { id, name: participantNamesRef.current[id] || 'Player' };
    });
    setParticipants(list);
    for (const remote of client?.remoteUsers || []) {
      const volume = speakerOnRef.current ? (volumesRef.current[String(remote.uid)] ?? 1) : 0;
      remote.audioTrack?.setVolume?.(Math.round(volume * 100));
    }
  };

  useEffect(() => {
    let cancelled = false;
    let client;
    let roomDatabase;
    let channelName;
    let rtcAccount = user?.uid;
    let didConnect = false;

    const requestVoiceToken = async () => {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/agora-voice-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ roomId, serverId, rtcAccount })
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.error || 'Voice chat is unavailable');
        err.code = data.code;
        throw err;
      }
      return data;
    };

    let serverId = '1';
    const start = async () => {
      if (!roomId || !user || user.isAnonymous === undefined) return;
      if (!rtcAccount || rtcAccount.length > 255) {
        setError('Your account cannot be used for voice chat.');
        return;
      }
      try {
        try {
          const savedServer = window.localStorage.getItem('ssauction:room-server:' + roomId);
          serverId = savedServer === '2' || (!savedServer && String(roomId).startsWith('2')) ? '2' : '1';
        } catch {}
        roomDatabase = serverId === '2' ? await ensureServer2Auth() : rtdb;
        const initial = await requestVoiceToken();
        if (cancelled) return;
        channelName = initial.channelName;

        const rosterRef = ref(roomDatabase, `auctions/${roomId}/room`);
        rosterUnsubscribeRef.current = onValue(rosterRef, (snapshot) => {
          const room = snapshot.val() || {};
          const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
          const names = {};
          for (const player of roster) {
            const id = String(player?.id || player?.userId || '');
            if (id) names[id] = String(player?.name || 'Player');
          }
          if (room.hostId && room.hostName) names[String(room.hostId)] = String(room.hostName);
          participantNamesRef.current = names;
          syncParticipants(client);
        });

        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        client.on('user-published', async (remoteUser, mediaType) => {
          try {
            await client.subscribe(remoteUser, mediaType);
            if (mediaType === 'audio') remoteUser.audioTrack?.play();
            syncParticipants(client);
          } catch (joinError) {
            console.warn('[Agora Voice] Could not subscribe to participant:', joinError?.message || joinError);
          }
        });
        client.on('user-unpublished', () => syncParticipants(client));
        client.on('user-left', () => syncParticipants(client));
        client.on('connection-state-change', (currentState) => {
          if (currentState === 'DISCONNECTED') {
            setConnected(false);
            setMicOn(false);
          }
        });

        await client.join(initial.appId, channelName, initial.token, rtcAccount);
        if (cancelled) { await client.leave(); return; }
        const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = localTrack;
        await localTrack.setEnabled(false);
        await client.publish([localTrack]);
        if (cancelled) { localTrack.close(); await client.leave(); return; }

        didConnect = true;
        setConnected(true);
        syncParticipants(client);
        void trackAnalyticsEvent('voice_join', roomId);

        // Short-lived five-minute tokens are renewed every four minutes. Each
        // renewal reserves another five participant-minutes from the shared
        // monthly cap in Firebase. If the cap is reached, this client leaves.
        refreshTimerRef.current = window.setInterval(async () => {
          try {
            const renewed = await requestVoiceToken();
            if (!cancelled && clientRef.current === client) await client.renewToken(renewed.token);
          } catch (renewError) {
            console.warn('[Agora Voice] Token renewal stopped:', renewError?.message || renewError);
            if (!cancelled && clientRef.current === client) {
              setError(renewError?.message || 'The monthly free voice allowance has been reached.');
              setMicOn(false);
              try { await localTrackRef.current?.setEnabled(false); } catch {}
              try { await client.leave(); } catch {}
              setConnected(false);
            }
          }
        }, TOKEN_REFRESH_MS);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Voice chat could not connect');
      }
    };

    start();
    return () => {
      cancelled = true;
      if (refreshTimerRef.current) window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
      rosterUnsubscribeRef.current?.();
      rosterUnsubscribeRef.current = null;
      if (didConnect) void trackAnalyticsEvent('voice_leave', roomId);
      try { localTrackRef.current?.close(); } catch {}
      localTrackRef.current = null;
      if (client) void client.leave().catch(() => {});
      clientRef.current = null;
      setConnected(false);
      setMicOn(false);
    };
  }, [roomId, user]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
    volumesRef.current = volumes;
    const client = clientRef.current;
    for (const remote of client?.remoteUsers || []) {
      const volume = speakerOn ? (volumes[String(remote.uid)] ?? 1) : 0;
      remote.audioTrack?.setVolume?.(Math.round(volume * 100));
    }
  }, [speakerOn, volumes]);

  const toggleMic = async () => {
    const track = localTrackRef.current;
    if (!track || participants.length < 1) return;
    try {
      await track.setEnabled(!micOn);
      setMicOn(!micOn);
      setError('');
    } catch {
      setError('Allow microphone access in your browser to speak.');
    }
  };

  const isBotUser = Boolean(user?.uid && /^(bot[_-]|auctionbot[_-])/i.test(user.uid));
  if (!user || !roomId || isBotUser) return null;
  const canUseVoice = connected && participants.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <button type="button" onClick={toggleMic} disabled={!canUseVoice}
        title={micOn ? 'Turn microphone off' : 'Turn microphone on'}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${micOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white hover:bg-white/15'}`}>
        {micOn ? <Mic size={15} /> : <MicOff size={15} />}{micOn ? 'Mic on' : 'Mic off'}
      </button>
      <button type="button" onClick={() => setSpeakerOn((value) => !value)}
        disabled={!canUseVoice} title={speakerOn ? 'Mute everyone' : 'Unmute everyone'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
        {speakerOn ? <Volume2 size={15} /> : <VolumeX size={15} />}{speakerOn ? 'Speaker on' : 'Speaker off'}
      </button>
      {participants.map((participant) => (
        <label key={participant.id} className="flex min-w-[110px] items-center gap-2 text-[11px] text-gray-300">
          <span className="max-w-[90px] truncate">{participant.name}</span>
          <input aria-label={`Volume for ${participant.name}`} type="range" min="0" max="1" step="0.05"
            value={volumes[participant.id] ?? 1}
            onChange={(event) => setVolumes((current) => ({ ...current, [participant.id]: Number(event.target.value) }))}
            className="w-16 accent-sky-400" />
        </label>
      ))}
      {error && <span role="status" className="w-full text-xs text-amber-300">{error}</span>}
      {!connected && !error && <span className="text-xs text-gray-400">Connecting voice…</span>}
      {connected && participants.length === 0 && <span className="text-xs text-gray-400">Voice controls activate when another real player joins.</span>}
    </div>
  );
};

export default VoiceChat;
