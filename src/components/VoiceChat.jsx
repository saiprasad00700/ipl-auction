import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ref, update, onValue } from 'firebase/database';
import { rtdb, ensureServer2Auth, ensureServer3Auth } from '../lib/firebase';
import { trackAnalyticsEvent } from '../lib/insights';

const TOKEN_REFRESH_MS = 4 * 60 * 1000;

const VoiceChat = ({ roomId }) => {
  const { user } = useAuth();
  const clientRef = useRef(null);
  const localTrackRef = useRef(null);
  const roomDatabaseRef = useRef(null);
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
          serverId = savedServer === '3' || (!savedServer && String(roomId).startsWith('3')) ? '3'
            : savedServer === '2' || (!savedServer && String(roomId).startsWith('2')) ? '2' : '1';
        } catch {}
        roomDatabase = serverId === '3' ? await ensureServer3Auth() : serverId === '2' ? await ensureServer2Auth() : rtdb;
        roomDatabaseRef.current = roomDatabase;
        const initial = await requestVoiceToken();
        if (cancelled) return;

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
        client.enableAudioVolumeIndicator();
        client.on('volume-indicator', (levels) => {
          if (!levels.some((entry) => Number(entry.level) > 5)) return;
          const now = Date.now();
          if (now - lastVoiceActivityPingRef.current < 10000) return;
          lastVoiceActivityPingRef.current = now;
          void update(ref(roomDatabase, `auctions/${roomId}/room`), { lastActivityAt: now }).catch((activityError) => {
            console.warn('[Agora Voice] Could not update room activity:', activityError?.message || activityError);
          });
        });
        client.on('connection-state-change', (currentState) => {
          if (currentState === 'DISCONNECTED') {
            setConnected(false);
            setMicOn(false);
          }
        });

        await client.join(initial.appId, initial.channelName, initial.token, rtcAccount);
        if (cancelled) { await client.leave(); return; }

        // Join receive-only. Do not request a microphone until the user
        // explicitly enables it; a missing input device must not break listening.
        didConnect = true;
        setConnected(true);
        syncParticipants(client);
        void trackAnalyticsEvent('voice_join', roomId);

        refreshTimerRef.current = window.setInterval(async () => {
          try {
            const renewed = await requestVoiceToken();
            if (!cancelled && clientRef.current === client) await client.renewToken(renewed.token);
          } catch (renewError) {
            console.warn('[Agora Voice] Token renewal stopped:', renewError?.message || renewError);
            if (!cancelled && clientRef.current === client) {
              setError(renewError?.message || 'The monthly free voice allowance has been reached.');
              setMicOn(false);
              try { localTrackRef.current?.close(); } catch {}
              localTrackRef.current = null;
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
      roomDatabaseRef.current = null;
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
    if (participants.length < 1 || !clientRef.current) return;
    try {
      if (micOn) {
        if (localTrackRef.current) await localTrackRef.current.setMuted(true);
        setMicOn(false);
        return;
      }

      // Device access occurs only after an explicit Mic ON click.
      let track = localTrackRef.current;
      if (!track) {
        track = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
        localTrackRef.current = track;
        try {
          await clientRef.current.publish([track]);
        } catch (publishError) {
          track.close();
          localTrackRef.current = null;
          throw publishError;
        }
      } else {
        await track.setMuted(false);
      }

      if (roomDatabaseRef.current) {
        void update(ref(roomDatabaseRef.current, `auctions/${roomId}/room`), { lastActivityAt: Date.now() }).catch((activityError) => {
          console.warn('[Agora Voice] Could not record microphone activity:', activityError?.message || activityError);
        });
      }
      setMicOn(true);
      setError('');
    } catch (micError) {
      const name = micError?.name || '';
      const code = micError?.code || '';
      if (name === 'NotFoundError' || code === 'DEVICE_NOT_FOUND') {
        setError('No microphone was found. Connect or enable a microphone, then try again. You can still hear other players.');
      } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || code === 'PERMISSION_DENIED') {
        setError('Microphone access is blocked. Allow microphone permission in your browser settings, then try again.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Your microphone is being used by another app. Close that app and try again.');
      } else {
        console.warn('[Agora Voice] Microphone could not start:', micError?.message || micError);
        setError('Could not start your microphone. Check your device and browser permissions, then try again.');
      }
      setMicOn(false);
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
