import React, { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const VoiceChat = ({ roomId }) => {
  const { user } = useAuth();
  const roomRef = useRef(null);
  const audioElementsRef = useRef(new Map());
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [volumes, setVolumes] = useState({});
  const speakerOnRef = useRef(true);
  const volumesRef = useRef({});
  const [error, setError] = useState('');

  const syncParticipants = (room) => {
    const list = [...room.remoteParticipants.values()].map((p) => ({
      id: p.identity,
      name: p.name || 'Player'
    }));
    setParticipants(list);
  };

  useEffect(() => {
    let cancelled = false;
    let room;
    const start = async () => {
      if (!roomId || !user || user.isAnonymous === undefined) return;
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/voice-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
          body: JSON.stringify({ roomId, participantName: user.displayName || 'Player' })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Voice chat is unavailable');
        if (cancelled) return;
        room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        const refresh = () => syncParticipants(room);
        room.on(RoomEvent.ParticipantConnected, refresh);
        room.on(RoomEvent.ParticipantDisconnected, refresh);
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const audio = track.attach();
          audio.autoplay = true;
          audio.dataset.voiceParticipant = participant.identity;
          audio.volume = speakerOnRef.current ? (volumesRef.current[participant.identity] ?? 1) : 0;
          document.body.appendChild(audio);
          audioElementsRef.current.set(participant.identity + ':' + track.sid, audio);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          track.detach().forEach((element) => element.remove());
          for (const [key, element] of audioElementsRef.current) {
            if (key === participant.identity + ':' + track.sid) audioElementsRef.current.delete(key);
          }
        });
        room.on(RoomEvent.Disconnected, () => { setConnected(false); setMicOn(false); });
        await room.connect(data.url, data.token);
        if (cancelled) { await room.disconnect(); return; }
        setConnected(true);
        syncParticipants(room);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Voice chat could not connect');
      }
    };
    start();
    return () => {
      cancelled = true;
      room?.disconnect();
      roomRef.current = null;
      audioElementsRef.current.forEach((audio) => audio.remove());
      audioElementsRef.current.clear();
    };
  }, [roomId, user]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
    volumesRef.current = volumes;
    for (const [key, audio] of audioElementsRef.current) {
      const participantId = key.split(':')[0];
      audio.volume = speakerOn ? (volumes[participantId] ?? 1) : 0;
    }
  }, [speakerOn, volumes]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || participants.length < 1) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
      setError('');
    } catch {
      setError('Allow microphone access in your browser to speak.');
    }
  };

  // Automated auction bot identities must never join voice rooms or request microphone access.\n  const isBotUser = Boolean(user?.uid && /^(bot[_-]|auctionbot[_-])/i.test(user.uid));\n  if (!user || !roomId || isBotUser) return null;
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
