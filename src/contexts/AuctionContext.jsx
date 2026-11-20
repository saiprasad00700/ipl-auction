// Modified from the upstream project by saiprasad00700.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { db, getServerTime, isServerTimeSynced, rtdb, server2Rtdb, ensureServer2Auth, server3Rtdb, ensureServer3Auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { trackAnalyticsEvent } from '../lib/insights';
import { reportGuardianError } from '../lib/guardian';
import { IPL_PLAYERS } from '../data/players';
import { evaluateBotBid } from '../lib/botEngine';
import { 
  ref, 
  set, 
  get, 
  remove,
  update as updateRtdb, 
  onValue, 
  onDisconnect,
  runTransaction as runTransactionRtdb,
  push,
  serverTimestamp as serverTimestampRtdb,
  query as queryRtdb,
  limitToLast,
  goOnline,
  goOffline
} from 'firebase/database';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  arrayUnion,
  arrayRemove,
  collection,
  runTransaction,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  writeBatch
} from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useQuota } from './QuotaContext';
import { useConnectionAlert } from './ConnectionAlertContext';
import { shouldReportConnectionTrouble } from '../lib/connectionAlerts';
import { DEFAULT_BID_TIMER_SECONDS, MEGA_OVERSEAS_LIMIT, getNextBidAmount } from '../lib/auctionRules';
import { autoSelectBestXI, PLAYING_XI_DEADLINE_MS, validatePlayingXIOptions } from '../lib/auctionWinnerRules';


const TEAMS = [
  { id: 'MI', name: 'Mumbai Indians', color: 'bg-blue-600' },
  { id: 'CSK', name: 'Chennai Super Kings', color: 'bg-yellow-400 text-black' },
  { id: 'RCB', name: 'Royal Challengers Bengaluru', color: 'bg-red-600' },
  { id: 'KKR', name: 'Kolkata Knight Riders', color: 'bg-purple-800' },
  { id: 'DC', name: 'Delhi Capitals', color: 'bg-blue-500' },
  { id: 'PBKS', name: 'Punjab Kings', color: 'bg-red-500' },
  { id: 'RR', name: 'Rajasthan Royals', color: 'bg-pink-600' },
  { id: 'SRH', name: 'Sunrisers Hyderabad', color: 'bg-orange-500' },
  { id: 'GT', name: 'Gujarat Titans', color: 'bg-slate-700' },
  { id: 'LSG', name: 'Lucknow Super Giants', color: 'bg-pink-800' },
];

// Room-to-database routing. New room codes beginning with 2 are allocated to Server 2.
const ROOM_SERVER_KEY_PREFIX = 'ssauction:room-server:';
const roomServerMap = new Map();
const rememberRoomServer = (roomId, serverId) => {
  roomServerMap.set(String(roomId), String(serverId));
  try { if (typeof window !== 'undefined') window.localStorage.setItem(ROOM_SERVER_KEY_PREFIX + roomId, String(serverId)); } catch (e) {}
};
const getRoomServerId = (roomId) => {
  const key = String(roomId || '');
  if (roomServerMap.has(key)) return roomServerMap.get(key);
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(ROOM_SERVER_KEY_PREFIX + key) : null;
    if (saved === '1' || saved === '2' || saved === '3') { roomServerMap.set(key, saved); return saved; }
  } catch (e) {}
  return key.startsWith('3') ? '3' : key.startsWith('2') ? '2' : '1';
};
const getRoomDatabase = (roomId) => {
  const serverId = getRoomServerId(roomId);
  return serverId === '3' ? server3Rtdb : serverId === '2' ? server2Rtdb : rtdb;
};

const AuctionContext = createContext();

export const useAuction = () => useContext(AuctionContext);

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const AuctionProvider = ({ children }) => {
  const { user } = useAuth();
  const { handleFirebaseError } = useQuota();
  const { reportConnectionTrouble, clearConnectionAlert } = useConnectionAlert();
  const [currentAuction, setCurrentAuction] = useState(null);
  const [team, setTeam] = useState(null);
  const [roomTeams, setRoomTeams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const endingPlayerRef = React.useRef(false);


  // Server-authoritative time using Firebase RTDB offset.
  // getServerTime() returns Date.now() + serverOffset, synced across all clients.
  const getSyncedTime = useCallback(() => {
    const database = currentAuction?.id ? getRoomDatabase(currentAuction.id) : rtdb;
    return getServerTime(database);
  }, [currentAuction?.id]);

  // RTM actions can be clicked immediately after a room reconnects. Wait briefly
  // for Firebase's server-time metadata instead of rejecting the user's click
  // during the short connection/sync window.
  const ensureServerTimeSync = useCallback(async () => {
    const database = currentAuction?.id ? getRoomDatabase(currentAuction.id) : rtdb;
    if (isServerTimeSynced(database)) return;
    try { goOnline(database); } catch (e) {}
    await new Promise((resolve) => {
      let attempts = 0;
      const retry = setInterval(() => {
        attempts += 1;
        if (isServerTimeSynced(database) || attempts >= 50) {
          clearInterval(retry);
          resolve();
        }
      }, 100);
    });
    if (!isServerTimeSynced(database)) {
      throw new Error('Auction server time is still connecting. Please try again in a moment.');
    }
  }, [currentAuction?.id]);

  // Create a new room in DB (RTDB + Supabase index, zero Firestore load)
  const createRoom = useCallback(async (roomId, userId, playerDetails, auctionType = 'mega', isPublic = true) => {
    const roomServerId = String(roomId).startsWith('3') ? '3' : String(roomId).startsWith('2') ? '2' : '1';
    if (roomServerId === '3') await ensureServer3Auth();
    else if (roomServerId === '2') await ensureServer2Auth();
    rememberRoomServer(roomId, roomServerId);
    const roomDatabase = getRoomDatabase(roomId);
    // Explicitly connect RTDB WebSocket for room creation
    try { goOnline(roomDatabase); } catch (e) {}

    const teamDetails = TEAMS.find(t => t.id === playerDetails.team);
    
    // Mode-specific configurations
    const isSprint5 = auctionType === 'sprint5';
    const isSprint11 = auctionType === 'sprint11';
    
    const budget = isSprint5 ? 60.0 : isSprint11 ? 90.0 : 120.0;
    const squadLimit = isSprint5 ? 5 : isSprint11 ? 11 : 25;
    const overseasLimit = isSprint5 ? 2 : isSprint11 ? 4 : MEGA_OVERSEAS_LIMIT;

    if (!user || user.uid !== userId) throw new Error('Authenticated user does not match room host.');
    const idToken = await user.getIdToken();
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId: roomServerId, teamId: playerDetails.team, name: playerDetails.name, auctionType, isPublic: !!isPublic })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.room) throw new Error(result.error || 'Could not create room securely.');
        if (user && user.uid === userId) void trackAnalyticsEvent('room_created', roomId);


    // Publish only minimal metadata for public rooms; never expose auction state.
    const publicRoomRef = ref(roomDatabase, `publicRooms/${roomId}`);
    if (isPublic) {
      await set(publicRoomRef, {
        roomId,
        hostId: userId,
        hostName: playerDetails.name || 'Auction host',
        status: 'waiting',
        auctionType,
        createdAt: Date.now()
      });
    }

    if (playerDetails.team) {
      const rtdbTeamRef = ref(roomDatabase, `auctions/${roomId}/teams/${roomId}_${userId}`);
      await set(rtdbTeamRef, {
        auctionId: roomId,
        userId: userId,
        teamId: playerDetails.team,
        teamName: teamDetails?.name || 'Unknown',
        budgetRemaining: budget,
        spent: 0,
        squad: [],
        retentionCardsRemaining: 2
      });
    }

    // Record history without blocking room creation if rules are not deployed yet.
    try {
      await set(ref(rtdb, `userAuctionHistory/${userId}/${roomId}`), {
        roomId, userId, serverId: roomServerId, hostId: userId,
        hostName: playerDetails.name || 'Manager',
        teamId: playerDetails.team || '',
        teamName: teamDetails?.name || 'Unknown',
        mode: auctionType, status: 'waiting', createdAt: Date.now(),
        spent: 0, budgetRemaining: budget, squad: []
      });
    } catch (historyError) {
      console.warn('Could not save room history entry:', historyError?.message || historyError);
    }
    // Keep a compact participant index so completed history can expire without
    // scanning every user's entire history tree.
    try { await set(ref(rtdb, `completedRoomHistory/${roomId}/users/${userId}`), true); }
    catch (indexError) { console.warn('Could not index room history participant:', indexError?.message || indexError); }

    // Write to Supabase (primary database index, 0 Firestore cost)
    try {
      if (supabase) {
        await supabase.from('auctions').upsert({
          id: roomId,
          host_id: userId,
          host_name: playerDetails.name,
          host_online: true,
          is_public: !!isPublic,
          status: 'waiting',
          auction_type: auctionType,
          squad_limit: squadLimit,
          overseas_limit: overseasLimit,
          players: [{
            id: userId,
            name: playerDetails.name,
            team: playerDetails.team,
            teamName: teamDetails?.name || 'Unknown',
            isHost: true
          }],
          settings: { bidTimer: DEFAULT_BID_TIMER_SECONDS, budget }
        });

        if (playerDetails.team) {
          await supabase.from('teams').upsert({
            id: `${roomId}_${userId}`,
            auction_id: roomId,
            user_id: userId,
            team_id: playerDetails.team,
            team_name: teamDetails?.name || 'Unknown',
            budget_remaining: budget,
            spent: 0,
            squad: []
          });
        }
      }
    } catch (sErr) {
      // Non-blocking Supabase fallback
    }
  }, []);
  
  // Helper to flush complete room & teams data from RTDB to Supabase in single batch call
  const flushAuctionToFirestore = useCallback(async (roomId) => {
    try {
      const roomSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/room`));
      const teamsSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams`));

      if (!roomSnap.exists()) return;

      const roomData = roomSnap.val();
      const teamsData = teamsSnap.exists() ? teamsSnap.val() : {};

      // Flush to Supabase (0 Firestore cost)
      if (supabase) {
        await supabase.from('auctions').upsert({
          id: roomId,
          host_id: roomData.hostId || '',
          host_name: roomData.hostName || 'Manager',
          is_public: roomData.isPublic !== false,
          status: roomData.status || 'waiting',
          auction_type: roomData.auctionType || 'mega',
          players: roomData.players || [],
          settings: {
            ...(roomData.settings || {}),
            ...(roomData.winnerRankings ? {
              winnerRankings: roomData.winnerRankings,
              winnerAnalysisStatus: roomData.winnerAnalysisStatus || 'completed',
              winnerAnalysisModel: roomData.winnerAnalysisModel || 'AI',
              winnerAnalysisCompletedAt: roomData.winnerAnalysisCompletedAt || null
            } : {})
          },
          banned_players: roomData.bannedPlayers || [],
          ...(roomData.playerOrder ? { player_order: roomData.playerOrder } : {})
        });

        const supabaseTeams = Object.entries(teamsData).map(([docId, teamVal]) => ({
          id: docId,
          auction_id: roomId,
          user_id: teamVal.userId,
          team_id: teamVal.teamId || '',
          team_name: teamVal.teamName || 'Unknown',
          budget_remaining: teamVal.budgetRemaining ?? 120.0,
          spent: teamVal.spent ?? 0,
          squad: teamVal.squad || []
        }));

        if (supabaseTeams.length > 0) {
          await supabase.from('teams').upsert(supabaseTeams);
        }
      }
    } catch (err) {
      // Graceful error handling
    }
  }, []);

  const startAuction = useCallback(async (roomId) => {
    if (!user) throw new Error('Sign in to start the auction.');
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/start-auction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || 'Could not start auction.');
      if (result.reason === 'minimum_members') error.code = 'MINIMUM_MEMBERS_REQUIRED';
      throw error;
    }
    if (supabase) {
      try { await supabase.from('auctions').update({ status: 'active' }).eq('id', roomId); } catch {}
    }
    await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
      userId: 'system', userName: 'System', text: 'Auction has started!', type: 'log', timestamp: serverTimestampRtdb()
    });
    void trackAnalyticsEvent('auction_start', roomId);
    return result;
  }, [user]);

  const endPlayerAuction = useCallback(async (roomId) => {
    // A single missed sync check must not permanently stall the lot at 0 seconds.
    // Reconnect RTDB and briefly wait for its server-time offset before giving up.
    if (!isServerTimeSynced(getRoomDatabase(roomId))) {
      try { goOnline(getRoomDatabase(roomId)); } catch (e) {}
      await new Promise((resolve) => {
        let attempts = 0;
        const retry = setInterval(() => {
          attempts += 1;
          if (isServerTimeSynced(currentAuction?.id ? getRoomDatabase(currentAuction.id) : rtdb) || attempts >= 50) {
            clearInterval(retry);
            resolve();
          }
        }, 100);
      });
      if (!isServerTimeSynced(currentAuction?.id ? getRoomDatabase(currentAuction.id) : rtdb)) return;
    }
    // Prevent duplicate calls from the timer interval
    if (endingPlayerRef.current) return;
    endingPlayerRef.current = true;

    try {
      const liveRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/live`);

      // Avoid treating an active RTM decision window as a failed settlement.
      // The timer can call this handler repeatedly while RTM is waiting; aborting
      // a transaction on every tick produced a flood of false errors and retries.
      const initialLiveSnap = await get(liveRef);
      const initialLive = initialLiveSnap.exists() ? initialLiveSnap.val() : null;
      if (!initialLive) return;
      // A host pause freezes both bidding and any in-progress RTM stage.
      // Do not let timer-driven clients attempt settlement while paused.
      if (initialLive.isPaused || initialLive.status === 'paused') return;
      if (initialLive.status === 'sold' || initialLive.status === 'unsold') return;
      if (initialLive.status === 'processing_sale') {
        const offer = initialLive.retentionOffer;
        if (offer?.status === 'pending' && getSyncedTime() < Number(offer.expiresAt) + 1500) {
          return;
        }
      }

            if (!user) throw new Error('Sign in required to finalize bidding.');
      const serverId = getRoomServerId(roomId);
      if (serverId === '3') await ensureServer3Auth();
      else if (serverId === '2') await ensureServer2Auth();
      const idToken = await user.getIdToken();
      const endpoint = initialLive.status === 'processing_sale' ? '/api/retention-finalize' : '/api/finalize-bidding';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ roomId, serverId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.live) {
        if (result.reason === 'bid_timer_open' || result.reason === 'window_open') {
          endingPlayerRef.current = false;
          setTimeout(() => { void endPlayerAuction(roomId); }, 500);
          return;
        }
        throw new Error(result.error || 'Auction finalization failed.');
      }
      const txResult = { committed: true, snapshot: { val: () => result.live } };
      let auctionState = txResult.snapshot.val();
      if (auctionState.status === 'processing_sale' && auctionState.retentionOffer?.status === 'pending') {
        // Follow all three RTM stages. Each stage has its own expiry, so refresh
        // the timeout whenever the offer advances instead of settling on the first YES.
        await new Promise((resolve) => {
          let finished = false;
          let unsubscribe = () => {};
          let pollId;
          const finish = () => {
            if (finished) return;
            finished = true;
            unsubscribe();
            if (pollId) clearInterval(pollId);
            resolve();
          };
          const check = (latest) => {
            // Keep the coordinator waiting while the host has frozen this RTM stage.
            if (latest?.isPaused || latest?.status === 'paused') return;
            const offer = latest?.retentionOffer;
            if (latest?.status !== 'processing_sale' || !offer || offer.status !== 'pending') {
              finish();
              return;
            }
            if ((offer.phase === 'initial_decision' && offer.decision === 'decline')
              || (offer.phase === 'match_decision' && offer.decision)) {
              finish();
              return;
            }
            if (getSyncedTime() >= Number(offer.expiresAt) + 1500) finish();
          };
          pollId = setInterval(async () => {
            try {
              const snap = await get(liveRef);
              check(snap.val());
            } catch (error) {
              console.error('Retention stage check failed.', error);
            }
          }, 250);
          unsubscribe = onValue(liveRef, (snapshot) => check(snapshot.val()), (error) => {
            console.error('Retention decision listener failed.', error);
          });
        });

        // Final RTM outcome is resolved by the trusted server transaction.
        if (!user) throw new Error('Sign in required to finalize RTM.');
        const serverId = getRoomServerId(roomId);
        if (serverId === '3') await ensureServer3Auth();
        else if (serverId === '2') await ensureServer2Auth();
        const idToken = await user.getIdToken();
        const finalizeResponse = await fetch('/api/retention-finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ roomId, serverId })
        });
        const finalizeResult = await finalizeResponse.json().catch(() => ({}));
        if (!finalizeResponse.ok || !finalizeResult.live) {
          const latestSnap = await get(liveRef);
          const failedState = latestSnap.val() || null;
          const failedOffer = failedState?.retentionOffer || null;
          if (finalizeResult.reason === 'window_open' || (failedState?.status === 'processing_sale' && failedOffer?.status === 'pending')) {
            endingPlayerRef.current = false;
            setTimeout(() => { void endPlayerAuction(roomId); }, 500);
            return;
          }
          throw new Error(finalizeResult.error || 'RTM finalization failed.');
        }
        auctionState = finalizeResult.live;
        if (auctionState.retentionOffer?.status === 'accepted') {
          await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
            userId: 'system', userName: 'System',
            text: `${IPL_PLAYERS.find(p => p.id === auctionState.playerId)?.name || 'Player'} goes to ${auctionState.highBidderName} through RTM for ₹${Number(auctionState.currentBid).toFixed(2)} Cr.`,
            type: 'retention_accepted',
            metadata: { playerId: auctionState.playerId, teamId: auctionState.highBidderTeamId, bid: auctionState.currentBid },
            timestamp: serverTimestampRtdb()
          });
        } else if (auctionState.retentionOffer?.status === 'declined' || auctionState.retentionOffer?.status === 'expired') {
          await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
            userId: 'system', userName: 'System',
            text: `RTM not matched. ${IPL_PLAYERS.find(p => p.id === auctionState.playerId)?.name || 'Player'} goes to ${auctionState.highBidderName} for ₹${Number(auctionState.currentBid).toFixed(2)} Cr.`,
            type: 'log', timestamp: serverTimestampRtdb()
          });
        }
      }
      // Deduct a card only when the original franchise actually retained the player:
      // either it matched the counter-price, or the counter-bidder timed out after RTM.
      // Explicitly exclude a declined counter-price even if stale settlement state says accepted.
      const settledOffer = auctionState.retentionOffer;
      const successfullyRetainedPlayer = settledOffer?.status === 'accepted'
        && auctionState.highBidderTeamId === settledOffer.originalFranchiseId
        && (settledOffer.decision === 'match'
          || (settledOffer.phase === 'counter_bid' && settledOffer.decision === 'accept'));
      // Retention-card deduction is applied inside the same team transaction as
      // the squad entry below, so duplicate settlement cannot consume a second card.

      const isSold = auctionState.status === 'sold';
      const player = IPL_PLAYERS.find(p => p.id === auctionState.playerId);
      const teamDetails = TEAMS.find(t => t.id === auctionState.highBidderTeamId);

      const playerNameStr = player?.name || 'Player';
      const logText = `${playerNameStr} ${isSold ? `SOLD to ${teamDetails?.name || auctionState.highBidderName} for \u20b9${auctionState.currentBid} Cr` : 'UNSOLD'}`;

      let teamDocId = null;
      let newTeamData = null;
      let teamSaleApplied = false;

      // Fetch room data once for budget defaults and player ordering.
      const rtdbRoomSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/room`));
      const roomData = rtdbRoomSnap.exists() ? rtdbRoomSnap.val() : {};

      if (isSold) {
        teamDocId = `${roomId}_${auctionState.highBidderId}`;
        if (!user) throw new Error('Sign in required to settle sale.');
        const serverId = getRoomServerId(roomId);
        if (serverId === '3') await ensureServer3Auth();
        else if (serverId === '2') await ensureServer2Auth();
        const idToken = await user.getIdToken();
        const response = await fetch('/api/settle-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ roomId, serverId, teamName: teamDetails?.name || auctionState.highBidderName || 'Unknown' })
        });
        const settlement = await response.json().catch(() => ({}));
        if (!response.ok || !settlement.team) throw new Error(settlement.error || 'Sale settlement failed.');
        const finalTeamData = settlement.team;
        teamSaleApplied = settlement.applied === true;
        newTeamData = finalTeamData;

        // Reconcile room-level counters from the trusted team settlement.
        const playersRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/room/players`);
        const playersTx = await runTransactionRtdb(playersRef, (currentPlayers) => {
          if (!Array.isArray(currentPlayers)) return;
          return currentPlayers.map((p) => p.id === auctionState.highBidderId
            ? { ...p, spent: Number(finalTeamData.spent || 0), squadCount: Array.isArray(finalTeamData.squad) ? finalTeamData.squad.length : 0 }
            : p);
        });
        if (!playersTx.committed) throw new Error('Could not synchronize team totals to the room roster.');
      }

      // Do not advance the lot until required state writes have completed. A failed
      // write throws into the recovery path instead of being silently swallowed.
      const syncPromises = [];
      // A concurrent/recovery client that finds the player already in the squad
      // must not emit a second sale message.
      if (!isSold || teamSaleApplied) syncPromises.push(push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
        userId: 'system',
        userName: 'System',
        text: logText,
        type: isSold ? 'sold_card' : 'log',
        metadata: isSold ? {
          playerId: auctionState.playerId,
          teamId: auctionState.highBidderTeamId,
          bid: auctionState.currentBid,
          buyerId: auctionState.highBidderId,
          buyerName: auctionState.highBidderName
        } : null,
        timestamp: serverTimestampRtdb()
      }));
      await Promise.all(syncPromises);

      const waitTime = isSold ? 5000 : 2000;

      // Player order from the single room snapshot already fetched above
        const advanceToNextPlayer = async () => {
        try {
          if (roomData.status !== 'active' || !user) return;
          const serverId = getRoomServerId(roomId);
          if (serverId === '3') await ensureServer3Auth();
          else if (serverId === '2') await ensureServer2Auth();
          const idToken = await user.getIdToken();
          const response = await fetch('/api/advance-auction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ roomId, serverId })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.live) {
            if (result.reason === 'transition_waiting') {
              endingPlayerRef.current = false;
              setTimeout(() => { void endPlayerAuction(roomId); }, 500);
              return;
            }
            throw new Error(result.error || 'Auction progression failed.');
          }
          if (result.finished) {
            const now = getSyncedTime();
            const roomSnapshot = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/room`));
            const auctionType = roomSnapshot.val()?.auctionType || 'mega';
            const usesSquadBalanceAnalysis = auctionType !== 'mega';
            await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
              userId: 'system', userName: 'System',
              text: usesSquadBalanceAnalysis
                ? 'Bidding has ended. AI is now analyzing every franchise squad for overall team balance.'
                : 'Bidding has ended. Submit your Playing XI (11 ordered starters + chasing and defending Impact Player choices) within 5 minutes.',
              type: 'log', timestamp: serverTimestampRtdb()
            });
          }
        } finally {
          endingPlayerRef.current = false;
        }
      };
      setTimeout(advanceToNextPlayer, waitTime);

    } catch (err) {
      // Log the real failure instead of silently swallowing the auction settlement error.
      console.error('[Auction] endPlayerAuction failed:', err);
      endingPlayerRef.current = false;
    }
  }, [getSyncedTime, flushAuctionToFirestore, user, currentAuction]);

  // Recover an overdue sold/unsold transition from shared RTDB state. The
  // transaction checks the player, status and deadline again, so only one client
  // can advance a given settled lot.
  const recoverPlayerTransition = useCallback(async (roomId) => {
    if (!isServerTimeSynced(currentAuction?.id ? getRoomDatabase(currentAuction.id) : rtdb)) return;
    const liveRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/live`);
    const liveSnap = await get(liveRef);
    const live = liveSnap.exists() ? liveSnap.val() : null;
    if (!live || !['sold', 'unsold'].includes(live.status)) return;
    if (!Number.isFinite(Number(live.transitionDeadline)) || getSyncedTime() < Number(live.transitionDeadline)) return;

    const roomSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/room`));
    if (!roomSnap.exists()) return;
    const roomData = roomSnap.val();
    if (roomData.status !== 'active') return;

    // Repair the sale's durable side effects before advancing the live lot.
    // This covers a coordinator disconnect after live.status became "sold" but
    // before the team squad/budget or room roster counters finished syncing.
    if (live.status === 'sold' && live.highBidderId && live.playerId) {
      if (!user) throw new Error('Sign in required to recover sale settlement.');
      const serverId = getRoomServerId(roomId);
      if (serverId === '3') await ensureServer3Auth();
      else if (serverId === '2') await ensureServer2Auth();
      const idToken = await user.getIdToken();
      const teamDetails = TEAMS.find((t) => t.id === live.highBidderTeamId);
      const response = await fetch('/api/settle-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ roomId, serverId, teamName: teamDetails?.name || live.highBidderName || 'Unknown' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.team) throw new Error(result.error || 'Sale settlement recovery failed.');
      const finalTeam = result.team;
      const playersRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/room/players`);
      const playersTx = await runTransactionRtdb(playersRef, (currentPlayers) => {
        if (!Array.isArray(currentPlayers)) return;
        return currentPlayers.map((p) => p.id === live.highBidderId
          ? { ...p, spent: Number(finalTeam.spent || 0), squadCount: Array.isArray(finalTeam.squad) ? finalTeam.squad.length : 0 }
          : p);
      });
      if (!playersTx.committed) throw new Error('Sale recovery could not synchronize the room roster totals.');
    }

    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/advance-auction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.live) {
      if (result.reason === 'transition_waiting') return;
      throw new Error(result.error || 'Auction transition recovery failed.');
    }
    if (result.finished) {
      const now = getSyncedTime();
      const auctionType = roomData.auctionType || 'mega';
      const usesSquadBalanceAnalysis = auctionType !== 'mega';
      await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
        userId: 'system', userName: 'System',
        text: usesSquadBalanceAnalysis
          ? 'Bidding has ended. AI is now analyzing every franchise squad for overall team balance.'
          : 'Bidding has ended. Submit your ordered Playing XI and choose Impact Players for chasing and defending within 5 minutes.',
        type: 'log', timestamp: serverTimestampRtdb()
      });
    }

  }, [getSyncedTime, user, currentAuction]);

  const joinRoomDb = useCallback(async (roomId, userId, playerDetails) => {
    // Room codes are allocated with their first digit identifying the Firebase server.
    // Route directly to the assigned server; only probe the other server as a fallback.
    const preferredServerId = String(roomId || '').startsWith('3') ? '3' : String(roomId || '').startsWith('2') ? '2' : '1';
    const getDatabaseById = async (serverId) => serverId === '3' ? await ensureServer3Auth() : serverId === '2' ? await ensureServer2Auth() : rtdb;
    let roomDatabase = await getDatabaseById(preferredServerId);
    rememberRoomServer(roomId, preferredServerId);
    try { goOnline(roomDatabase); } catch (e) {}
    const teamDetails = TEAMS.find(t => t.id === playerDetails.team);
    let rtdbRoomSnap = await get(ref(roomDatabase, `auctions/${roomId}/room`));
    let data = null;
    if (!rtdbRoomSnap.exists()) {
      for (const alternateServerId of ['1', '2', '3'].filter((id) => id !== preferredServerId)) {
        const alternateDatabase = await getDatabaseById(alternateServerId);
        try { goOnline(alternateDatabase); } catch (e) {}
        const alternateSnap = await get(ref(alternateDatabase, `auctions/${roomId}/room`));
        if (alternateSnap.exists()) {
          roomDatabase = alternateDatabase;
          rtdbRoomSnap = alternateSnap;
          rememberRoomServer(roomId, alternateServerId);
          break;
        }
      }
    }
    if (rtdbRoomSnap.exists()) {
      data = rtdbRoomSnap.val();
    } else {
      let supabaseFound = false;
      if (supabase) {
        try {
          const { data: sData } = await supabase.from('auctions').select('*').eq('id', roomId).maybeSingle();
          if (sData) {
            data = {
              id: sData.id, hostId: sData.host_id, hostName: sData.host_name,
              status: sData.status, auctionType: sData.auction_type || 'mega',
              isPublic: sData.is_public !== false, squadLimit: sData.squad_limit || 25,
              overseasLimit: sData.overseas_limit || MEGA_OVERSEAS_LIMIT,
              players: sData.players || [], bannedPlayers: sData.banned_players || [],
              settings: sData.settings || { bidTimer: DEFAULT_BID_TIMER_SECONDS, budget: 120 }
            };
            supabaseFound = true;
          }
        } catch (sErr) {}
      }
      if (!supabaseFound) {
        const roomSnap = await getDoc(doc(db, 'auctions', roomId));
        if (!roomSnap.exists()) throw new Error("Room not found!");
        data = roomSnap.data();
      }
    }

    if (data.bannedPlayers && data.bannedPlayers.includes(userId)) {
      throw new Error("You have been kicked from this room and cannot rejoin.");
    }

    if (data.status === 'completed' || data.winnerAnalysisStatus === 'completed' || Array.isArray(data.winnerRankings)) {
      throw new Error(`ROOM_COMPLETED:${roomId}`);
    }

    const existingPlayers = data.players || [];
    const playerExists = existingPlayers.find(p => p.id === userId);
    
    const updatedPlayer = {
      id: userId,
      name: playerDetails.name || (playerExists ? playerExists.name : 'Manager'),
      team: playerDetails.team || (playerExists ? playerExists.team : ''),
      teamName: teamDetails?.name || (playerExists ? playerExists.teamName : 'Unknown'),
      isHost: playerExists ? playerExists.isHost : false
    };

    const updatedPlayers = existingPlayers.filter(p => p && p.id !== userId && p.userId !== userId);
    updatedPlayers.push(updatedPlayer);

    // RTDB rooms use the server-authoritative transactional join endpoint.
    // Legacy Supabase/Firestore rooms retain their existing compatibility path.
    let serverAuthoritativeJoin = false;
    if (rtdbRoomSnap.exists() && user && user.uid === userId) {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/room-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ roomId, serverId: getRoomServerId(roomId), teamId: playerDetails.team, name: updatedPlayer.name })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not join room securely');
      serverAuthoritativeJoin = true;
    } else {
      // Compatibility path for legacy rooms not hosted in RTDB.
      await set(ref(roomDatabase, `auctions/${roomId}/room/players`), updatedPlayers);
    }

    // Save history independently of the activity heartbeat. A heartbeat/rules
    // failure must never prevent a successfully joined room from being recorded.
    try {
      const historyRef = ref(rtdb, `userAuctionHistory/${userId}/${roomId}`);
      const previousHistory = await get(historyRef);
      const previousEntry = previousHistory.exists() ? previousHistory.val() : {};
      await set(historyRef, {
        roomId, userId, serverId: getRoomServerId(roomId), hostId: data.hostId || '',
        hostName: data.hostName || 'Auction host',
        teamId: playerDetails.team || playerExists?.team || '',
        teamName: teamDetails?.name || playerExists?.teamName || 'Unknown',
        mode: data.auctionType || 'mega', status: data.status || 'waiting',
        createdAt: Number(previousEntry.createdAt || previousEntry.joinedAt || Date.now()),
        spent: Number(previousEntry.spent || 0),
        budgetRemaining: previousEntry.budgetRemaining ?? data.settings?.budget ?? 120,
        squad: Array.isArray(previousEntry.squad) ? previousEntry.squad : []
      });
    } catch (historyError) {
      console.error('Could not save room history entry:', historyError?.message || historyError);
    }
    try { await set(ref(rtdb, `completedRoomHistory/${roomId}/users/${userId}`), true); }
    catch (indexError) { console.warn('Could not index room history participant:', indexError?.message || indexError); }

    // Refresh the inactivity heartbeat separately; do not let it block history.
    try {
      await set(ref(roomDatabase, `auctions/${roomId}/room/lastActivityAt`), Date.now());
    } catch (activityError) {
      console.warn('Could not refresh room activity after joining:', activityError?.message || activityError);
    }

    // Sync updated player count/list to Supabase so Public Lobbies show live player counts
    /*
    try {
      if (supabase) {
        await supabase.from('auctions').update({ players: updatedPlayers }).eq('id', roomId);
      }
    } catch (sErr) {
      // Non-blocking sync error
    }
    */

    // The secure endpoint initializes the team transactionally/idempotently.
    // Legacy room paths continue to use the compatibility team initialization.
    if (playerDetails.team && !serverAuthoritativeJoin) {
      const rtdbTeamSnap = await get(ref(roomDatabase, `auctions/${roomId}/teams/${roomId}_${userId}`));
      if (!rtdbTeamSnap.exists()) {
        const teamDataToSet = {
          auctionId: roomId,
          userId: userId,
          teamId: playerDetails.team,
          teamName: teamDetails?.name || 'Unknown',
          budgetRemaining: data.settings?.budget || 120.0,
          spent: 0,
          squad: [],
          retentionCardsRemaining: 2
        };
        await updateRtdb(ref(roomDatabase, `auctions/${roomId}/teams/${roomId}_${userId}`), teamDataToSet);
      } else {
        const tData = rtdbTeamSnap.val();
        if (tData.teamId !== playerDetails.team) {
          await updateRtdb(ref(roomDatabase, `auctions/${roomId}/teams/${roomId}_${userId}`), {
            teamId: playerDetails.team,
            teamName: teamDetails?.name || 'Unknown'
          });
        }
      }
    }
    if (user && user.uid === userId) void trackAnalyticsEvent('room_join', roomId);
  }, [user]);

  // Kick a player from the room through a trusted host-authorized endpoint.
  const kickPlayer = useCallback(async (roomId, playerObj) => {
    try {
      if (!user) throw new Error('Sign in to remove a participant.');
      const serverId = getRoomServerId(roomId);
      if (serverId === '3') await ensureServer3Auth();
      else if (serverId === '2') await ensureServer2Auth();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/room-kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ roomId, serverId, targetUid: String(playerObj?.id || playerObj?.userId || '') })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not remove participant securely.');
      return result;
    } catch (err) {
      reportGuardianError({ operation: 'room-kick', severity: 'warning', message: err?.message || String(err), roomId });
      throw err;
    }
  }, [user]);

  // Listen to current auction state live
  const joinAuction = useCallback((auctionId, userId) => {
    if (!userId) return () => {};
    
    // Connect to the Firebase project assigned to this room.
    const roomDatabase = getRoomDatabase(auctionId);
    try { goOnline(roomDatabase); } catch (e) {}

    setLoading(true);
    let auctionLoaded = false;
    let teamsLoaded = false;
    let messagesLoaded = false;
    // Flips when the RTDB socket is genuinely usable. A database that refused
    // the connection (most often the free plan's 100-session ceiling) never
    // gets here, which is what makes it the discriminator the watchdog needs.
    let socketConnected = false;

    const checkLoaded = () => {
      if (auctionLoaded && teamsLoaded && messagesLoaded) {
        setLoading(false);
      }
    };

    // ─── Connection watchdog ───
    // When a connection is refused the listeners below never fire at all: no
    // snapshot, no error callback, no kill reason. That is why this screen used
    // to load forever, and why the old 5s "timeout" here never helped — it read
    // `loading` from the render in which this callback was created, so it always
    // saw the initial `false`. Reporting "we cannot reach the database" is safe
    // here because a healthy socket connects in well under one tick.
    const watchdog = setInterval(() => {
      if (!shouldReportConnectionTrouble({ socketConnected, auctionLoaded })) return;
      reportConnectionTrouble();
    }, 5000);

    // ─── Real Presence Logic ───
    // Track online status in RTDB
    const myPresenceRef = ref(roomDatabase, `auctions/${auctionId}/presence/${userId}`);
    const connectedRef = ref(roomDatabase, '.info/connected');
    
    // ── Bug Fix: Declare shared state vars BEFORE any onValue subscriptions that reference them ──
    // Previously currentRoomData was declared at line 658 but referenced inside the onValue(connectedRef)
    // callback above at line 648. JavaScript 'let' is in the TDZ until its declaration line runs,
    // so if the callback fired before that point it threw: "Cannot access before initialization".
    let currentRoomData = null;
    let currentRtdbData = null;
    let currentPresences = {};
    let unsubConnected = null;
    let unsubPresence = null;
    let unsubAuction = null;
    let unsubLive = null;
    let unsubTeams = null;
    let unsubMessages = null;
    let completedCleanupStarted = false;

    // Once final rankings are saved, keep the already-loaded results on screen
    // but stop room subscriptions so idle completed rooms do not keep streaming.
    const stopCompletedRoomListeners = () => {
      if (completedCleanupStarted) return;
      completedCleanupStarted = true;
      Promise.resolve().then(async () => {
        unsubConnected?.();
        unsubPresence?.();
        unsubLive?.();
        unsubTeams?.();
        unsubMessages?.();
        unsubAuction?.();
        clearInterval(watchdog);
        try {
          await set(myPresenceRef, { online: false, lastSeen: serverTimestampRtdb() });
        } catch (presenceError) {
          console.warn('Could not clear completed-room presence:', presenceError?.message || presenceError);
        }
        try { goOffline(roomDatabase); } catch (e) {}
      });
    };

    // Set presence status on connect/disconnect
    unsubConnected = onValue(connectedRef, async (snap) => {
      socketConnected = snap.val() === true;
      if (snap.val() === true) {
        // Reaching the server means any "cannot connect" notice is stale now.
        clearConnectionAlert();

        // We're connected (or reconnected)! Do something and set onDisconnect
        set(myPresenceRef, { 
          online: true, 
          lastSeen: serverTimestampRtdb() 
        });
        
        // When I disconnect, update this to offline
        onDisconnect(myPresenceRef).set({ 
          online: false, 
          lastSeen: serverTimestampRtdb() 
        });

      }
    });

    // ─── host_online (Supabase directory) ← RTDB presence mirror ───
    // The public directory reads a plain `host_online` boolean from Supabase, but
    // the RTDB is the source of truth for presence (its server-side onDisconnect
    // flips a member to offline even on a hard crash / closed tab). To keep
    // Supabase in sync WITHOUT a heartbeat, we mirror the derived value to
    // Supabase only when it actually changes, and only from a single elected
    // client (the online member with the lowest uid) so N members never cause
    // N writes per transition.
    let lastHostOnlineSynced = null; // last value we pushed (null = unknown)
    const syncHostOnline = (next) => {
      if (!supabase || next === lastHostOnlineSynced) return;
      lastHostOnlineSynced = next; // optimistic: parallel presence ticks won't double-write
      supabase
        .from('auctions')
        .update({ host_online: next })
        .eq('id', auctionId)
        .then(() => {})
        .catch(() => { lastHostOnlineSynced = null; }); // allow a later retry
    };


    const checkAndSet = () => {
      if (currentRoomData) {
        // Map presence data to players array
        const playersWithPresence = (currentRoomData.players || []).map(p => ({
          ...p,
          isOnline: !!currentPresences[p.id]?.online,
          lastSeen: currentPresences[p.id]?.lastSeen || null
        }));

        // Mirror the host's real presence to Supabase on transitions only.
        // Elect one reporter = the online member with the lowest uid, so exactly
        // one client writes per transition. Peers/spectators can be the reporter
        // too, which is what lets an abrupt host disconnect be reflected (the
        // RTDB onDisconnect flips presence server-side even if the host crashes).
        if (Object.keys(currentPresences).length > 0) {
          const reporterId = Object.keys(currentPresences)
            .filter((uid) => currentPresences[uid]?.online)
            .sort()[0];
          if (reporterId === userId) {
            syncHostOnline(!!currentPresences[currentRoomData.hostId]?.online);
          }
        }

        const roomAuctionType = currentRoomData.auctionType || 'mega';
        const effectiveOverseasLimit = roomAuctionType === 'sprint5' ? 2
          : roomAuctionType === 'sprint11' ? 4 : MEGA_OVERSEAS_LIMIT;
        setCurrentAuction({ 
          id: auctionId, 
          ...currentRoomData,
          // Apply the current mode quota to existing rooms as well as newly created rooms.
          overseasLimit: effectiveOverseasLimit,
          players: playersWithPresence,
          currentAuction: currentRtdbData || currentRoomData.currentAuction
        });
      }
    };

    // Presence listener (all users' presence)
    const presenceRef = ref(roomDatabase, `auctions/${auctionId}/presence`);
    unsubPresence = onValue(presenceRef, (snap) => {
      currentPresences = snap.val() || {};
      checkAndSet();
    });

    let didFallbackFetch = false;
    let didTeamsFallback = false;

    unsubAuction = onValue(ref(roomDatabase, `auctions/${auctionId}/room`), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // PROACTIVE BAN CHECK: Kick user if they are banned
        if (data.bannedPlayers && data.bannedPlayers.includes(userId)) {
           window.location.href = '/?error=kicked';
           return;
        }

        auctionLoaded = true;
        if (!data.playerOrder) {
          get(ref(roomDatabase, `auctions/${auctionId}/playerOrder`)).then(oSnap => {
            if (oSnap.exists()) data.playerOrder = oSnap.val();
            currentRoomData = data;
            checkAndSet();
          }).catch(() => {});
        }
        currentRoomData = data;
        checkAndSet();
        checkLoaded();
        if (data.status === 'completed') stopCompletedRoomListeners();
      } else if (!didFallbackFetch) {
        didFallbackFetch = true;
        // Wait 500ms grace period before hitting persistent store fallback
        setTimeout(async () => {
          if (auctionLoaded) return;
          try {
            let data = null;
            if (supabase) {
              const { data: sData } = await supabase.from('auctions').select('*').eq('id', auctionId).maybeSingle();
              if (sData) {
                data = {
                  id: sData.id,
                  hostId: sData.host_id,
                  hostName: sData.host_name,
                  status: sData.status,
                  auctionType: sData.auction_type || 'mega',
                  squadLimit: sData.squad_limit || 25,
                  overseasLimit: sData.overseas_limit || MEGA_OVERSEAS_LIMIT,
                  players: sData.players || [],
                  bannedPlayers: sData.banned_players || [],
                  settings: sData.settings || { bidTimer: DEFAULT_BID_TIMER_SECONDS, budget: 120 }
                };
              }
            }

            if (!data) {
              const fsDoc = await getDoc(doc(db, 'auctions', auctionId));
              if (fsDoc.exists()) data = fsDoc.data();
            }

            if (data) {
              if (data.bannedPlayers && data.bannedPlayers.includes(userId)) {
                 window.location.href = '/?error=kicked';
                 return;
              }
              auctionLoaded = true;
              currentRoomData = data;
              checkAndSet();
              checkLoaded();
              await updateRtdb(ref(roomDatabase, `auctions/${auctionId}/room`), data);
            } else {
              // Room not found in any store
              setLoading(false);
            }
          } catch(e) { handleFirebaseError(e); }
        }, 500);
      }
    }, (error) => {
      setLoading(false);
      handleFirebaseError(error);
    });

    unsubLive = onValue(ref(roomDatabase, `auctions/${auctionId}/live`), (snapshot) => {
      currentRtdbData = snapshot.val();
      checkAndSet();
    }, (error) => {
      handleFirebaseError(error);
    });


    unsubTeams = onValue(ref(roomDatabase, `auctions/${auctionId}/teams`), async (snapshot) => {
      if (snapshot.exists()) {
        teamsLoaded = true;
        const teamsObj = snapshot.val();
        const teamsArr = Object.values(teamsObj).map(t => ({ id: `${auctionId}_${t.userId}`, ...t }));
        setRoomTeams(teamsArr);
        
        if (userId) {
          const myTeam = teamsArr.find(t => t.id === `${auctionId}_${userId}`);
          if (myTeam) setTeam(myTeam);
          else setTeam(null);
        }
        checkLoaded();
      } else if (!didTeamsFallback) {
        didTeamsFallback = true;
        setTimeout(async () => {
          if (teamsLoaded) return;
          try {
            let teamsArr = [];
            if (supabase) {
              const { data: sTeams } = await supabase.from('teams').select('*').eq('auction_id', auctionId);
              if (sTeams && sTeams.length > 0) {
                teamsArr = sTeams.map(t => ({
                  id: t.id,
                  auctionId: t.auction_id,
                  userId: t.user_id,
                  teamId: t.team_id,
                  teamName: t.team_name,
                  budgetRemaining: t.budget_remaining ?? 120,
                  spent: t.spent || 0,
                  squad: t.squad || []
                }));
              }
            }

            if (teamsArr.length === 0) {
              const tq = query(collection(db, 'teams'), where('auctionId', '==', auctionId));
              const tSnap = await getDocs(tq);
              if (!tSnap.empty) {
                teamsArr = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              }
            }

            teamsLoaded = true;
            setRoomTeams(teamsArr);

            if (userId) {
              const myTeam = teamsArr.find(t => t.id === `${auctionId}_${userId}` || t.userId === userId);
              if (myTeam) setTeam(myTeam);
              else setTeam(null);
            }
            checkLoaded();

            if (teamsArr.length > 0) {
              const teamsToSync = {};
              teamsArr.forEach(t => {
                teamsToSync[t.id] = t;
              });
              await updateRtdb(ref(roomDatabase, `auctions/${auctionId}/teams`), teamsToSync);
            }
          } catch(e) { handleFirebaseError(e); }
        }, 500);
      }
    }, (error) => {
      setLoading(false);
      handleFirebaseError(error);
    });

    // Keep the complete room chat history available while this room exists.
    // Do not cap this subscription with limitToLast(), which hides older messages
    // as new messages arrive.
    const msgQuery = ref(roomDatabase, `auctions/${auctionId}/messages`);
    unsubMessages = onValue(msgQuery, (snapshot) => {
      messagesLoaded = true;
      if (snapshot.exists()) {
        const msgs = [];
        snapshot.forEach(child => {
          msgs.push({ id: child.key, ...child.val() });
        });
        setMessages(msgs);
      } else {
        setMessages([]);
      }
      checkLoaded();
    }, (error) => {
      setLoading(false);
      handleFirebaseError(error);
    });

    return () => {
      clearInterval(watchdog);
      unsubConnected();
      unsubPresence();
      unsubAuction();
      unsubLive();
      unsubTeams();
      unsubMessages();
      // Set offline on component unmount
      set(myPresenceRef, { online: false, lastSeen: serverTimestampRtdb() });

      // Mark the room offline in the directory when the HOST leaves. This is the
      // only writer for the "lone host leaves / no peers left to mirror" case;
      // otherwise the peer-elected presence mirror handles offline transitions.
      if (currentRoomData && currentRoomData.hostId === userId) {
        syncHostOnline(false);
      }

      setCurrentAuction(null);
      setTeam(null);
      setRoomTeams([]);
      setMessages([]);

      // Immediately close RTDB connection when leaving auction room/lobby to free up connection quota
      try { goOffline(roomDatabase); } catch (e) {}
    };
  }, [user]);

  const sendMessage = useCallback(async (roomId, text, type = 'text') => {
    if (!user || !roomId) return;
    // Bot identities are auction placeholders, never real chat participants.
    if (/^(bot[_-]|auctionbot[_-])/i.test(user.uid)) {
      throw new Error('Bots are not allowed to send chat messages.');
    }
    const roomPlayer = currentAuction?.id === roomId
      ? (currentAuction.players || []).find((player) => player.id === user.uid)
      : null;
    if (roomPlayer?.isBot) {
      throw new Error('Bots are not allowed to send chat messages.');
    }
    const msgRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`);
    await push(msgRef, {
      userId: user.uid,
      userName: user.displayName || 'Manager',
      teamId: roomPlayer?.team || null,
      isSpectator: !roomPlayer?.team,
      text,
      type,
      timestamp: serverTimestampRtdb()
    });
    // Members may write the dedicated heartbeat child, not the host-only /room parent.
    await set(ref(getRoomDatabase(roomId), `auctions/${roomId}/room/lastActivityAt`), Date.now());
    if (type === 'text') void trackAnalyticsEvent('chat_message', roomId);
  }, [user, currentAuction]);

  const placeBid = useCallback(async (amount) => {
    if (!currentAuction?.id) throw new Error('Auction not found!');
    if (!user) throw new Error('Please log in to bid!');
    if (!team) throw new Error('You must select a team in the lobby to participate!');
    const roomServerId = getRoomServerId(currentAuction.id);
    if (roomServerId === '3') await ensureServer3Auth();
    else if (roomServerId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/place-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        roomId: currentAuction.id,
        serverId: roomServerId,
        name: user.displayName || 'Manager'
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Bid failed.');
    void trackAnalyticsEvent('bid', currentAuction.id);
    return result;
  }, [currentAuction, user, team]);

  const decideRetention = useCallback(async (roomId, decision) => {
    if (!user?.uid || !['accept', 'decline', 'match', 'decline_counter'].includes(decision)) {
      throw new Error('Invalid RTM decision.');
    }
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/retention-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, decision })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Your RTM decision was not saved.');
    return result;
  }, [user]);

  const submitRetentionCounterBid = useCallback(async (roomId, amount) => {
    if (!user?.uid || !Number.isFinite(Number(amount))) throw new Error('Enter a valid counter-bid amount.');
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/retention-counter-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, amount: Number(amount) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Counter-bid was not saved.');
    return result;
  }, [user]);

  const updatePlayerTeam = useCallback(async (roomId, userId, newTeamId) => {
    const rtdbRoomSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/room`));
    if (!rtdbRoomSnap.exists()) return;
    
    const data = rtdbRoomSnap.val();
    const teamDetails = TEAMS.find(t => t.id === newTeamId);
    
    const existingPlayers = Array.isArray(data.players) ? data.players : [];
    const playerIndex = existingPlayers.findIndex(p => p && (p.id === userId || p.userId === userId));
    // Human players may take over a franchise currently occupied by a bot.
    // Remove the bot roster entry before assigning the franchise to the human.
    const botUserId = `bot_${newTeamId}`;
    const rosterWithoutTeamBot = existingPlayers.filter(p =>
      !(p && p.isBot && (p.team === newTeamId || p.id === botUserId))
    );
    const updatedPlayers = rosterWithoutTeamBot.map(p =>
      p && (p.id === userId || p.userId === userId)
        ? { ...p, id: userId, team: newTeamId, teamName: teamDetails?.name || 'Unknown' }
        : p
    );
    // Repair older/malformed room rosters where the signed-in member is not
    // present under either identifier instead of silently updating zero rows.
    if (playerIndex === -1) {
      updatedPlayers.push({
        id: userId,
        name: user?.displayName || user?.email || 'Manager',
        team: newTeamId,
        teamName: teamDetails?.name || 'Unknown',
        isHost: false
      });
    }
    // Write only to the child paths explicitly permitted for room members.
    // A parent-level update at /room is host-only under database.rules.json.
    await Promise.all([
      set(ref(getRoomDatabase(roomId), `auctions/${roomId}/room/players`), updatedPlayers),
      set(ref(getRoomDatabase(roomId), `auctions/${roomId}/room/lastActivityAt`), Date.now())
    ]);

    /*
    try {
      if (supabase) {
        await supabase.from('auctions').update({ players: updatedPlayers }).eq('id', roomId);
      }
    } catch (sErr) {}
    */

    // Remove the replaced bot's franchise data, then update/create the human team.
    await set(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${roomId}_${botUserId}`), null);
    // Update RTDB team node (0 Firestore cost in lobby!)
    const rtdbTeamSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${roomId}_${userId}`));
    if (rtdbTeamSnap.exists()) {
      await updateRtdb(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${roomId}_${userId}`), {
        teamId: newTeamId,
        teamName: teamDetails?.name || 'Unknown'
      });
    } else {
      const teamDataToSet = {
        auctionId: roomId,
        userId: userId,
        teamId: newTeamId,
        teamName: teamDetails?.name || 'Unknown',
        budgetRemaining: data.settings?.budget || 120.0,
        spent: 0,
        squad: [],
        retentionCardsRemaining: 2
      };
      await updateRtdb(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${roomId}_${userId}`), teamDataToSet);
    }
  }, [user]);
  
  const updateRoomSettings = useCallback(async (roomId, settings) => {
    if (!user) throw new Error('Sign in to update room settings.');
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/room-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, settings })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not update room settings.');
    return result;
  }, [user]);

  const pauseAuction = useCallback(async (roomId) => {
    if (!user || !currentAuction || currentAuction.hostId !== user.uid) return;
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/auction-pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, action: 'pause' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not pause auction.');
    return result;
  }, [user, currentAuction]);

  const resumeAuction = useCallback(async (roomId) => {
    if (!user || !currentAuction || currentAuction.hostId !== user.uid) return;
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/auction-pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, action: 'resume' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not resume auction.');
    return result;
  }, [user, currentAuction]);

  const endAuction = useCallback(async (roomId) => {
    if (!user || !currentAuction || currentAuction.hostId !== user.uid) return;
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/end-auction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.room) throw new Error(result.error || 'Could not end auction.');
    const roomData = result.room;
    const isMegaAuction = (roomData.auctionType || 'mega') === 'mega';
    const usesSquadBalanceAnalysis = !isMegaAuction;
    const disqualifiedNames = Array.isArray(result.disqualified) ? result.disqualified : [];
    const ruleMessage = isMegaAuction
      ? ` Minimum squad size is 18; franchises below 18 are disqualified. ${disqualifiedNames.length ? `Disqualified: ${disqualifiedNames.join(', ')}.` : 'All franchises met the minimum squad size.'}`
      : '';
    await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
      userId: 'system', userName: 'System',
      text: usesSquadBalanceAnalysis
        ? 'Auction ended. AI is now analyzing every franchise squad for overall team balance.'
        : `Auction ended. Submit your ordered Playing XI and choose Impact Players for chasing and defending within 5 minutes.${ruleMessage}`,
      type: 'log', timestamp: serverTimestampRtdb()
    });
    return result;
  }, [user, currentAuction]);

  const submitPlayingXI = useCallback(async (roomId, startingXI, impactPlayerChasing, impactPlayerDefending = impactPlayerChasing) => {
    if (!user) throw new Error('Sign in to submit your Playing XI');
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/submit-playing-xi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, startingXI, impactPlayerChasing, impactPlayerDefending })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not submit Playing XI.');
    return result;
  }, [user]);

  const finalizeWinnerAnalysis = useCallback(async (roomId) => {
    const roomRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/room`);
    const roomSnap = await get(roomRef);
    if (!roomSnap.exists()) return;
    const roomData = roomSnap.val();

    // Winner analysis updates the complete room document. Firebase rules reserve
    // writes to that node for the host, so guests must observe the result rather
    // than attempting the room-level transaction themselves.
    if (!user || roomData.hostId !== user.uid) return;
    if (roomData.status !== 'awaiting_xi') return;

    // Classic and Sprint analyze the full squad immediately; only MEGA uses Playing XI.
    const usesSquadBalanceAnalysis = (roomData.auctionType || 'mega') !== 'mega';
    const readinessRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/teams`);
    const readinessSnap = await get(readinessRef);
    const readinessData = readinessSnap.val() || {};
    const allParticipatingTeams = Object.entries(readinessData)
      .filter(([, t]) => t?.teamId && t.teamId !== 'NONE');
    // Enforce the 18-player minimum only in MEGA, including auctions that
    // reach this phase through the natural end-of-bidding path.
    if (!usesSquadBalanceAnalysis) {
      const disqualificationUpdates = {};
      for (const [teamKey, team] of allParticipatingTeams) {
        const squadCount = Array.isArray(team.squad) ? team.squad.length : 0;
        const disqualified = squadCount < 18;
        team.disqualified = disqualified;
        team.disqualificationReason = disqualified
          ? `You need to buy minimum 18 players, but you bought only ${squadCount} players. So you are disqualified.`
          : null;
        disqualificationUpdates[`${teamKey}/disqualified`] = disqualified;
        disqualificationUpdates[`${teamKey}/disqualificationReason`] = team.disqualificationReason;
        disqualificationUpdates[`${teamKey}/squadCountAtEnd`] = squadCount;
      }
      if (Object.keys(disqualificationUpdates).length) {
        await updateRtdb(readinessRef, disqualificationUpdates);
      }
    }
    const readinessTeams = allParticipatingTeams
      .map(([, team]) => team)
      .filter((team) => !team.disqualified);
    const noEligibleMegaFranchises = !usesSquadBalanceAnalysis
      && allParticipatingTeams.length > 0
      && readinessTeams.length === 0;

    // Bots never submit a Playing XI. For Mega auctions, the host selects and
    // persists their best eligible XI from the squad using the site's selector.
    if (!usesSquadBalanceAnalysis) {
      const roomPlayers = Array.isArray(roomData.players) ? roomData.players : Object.values(roomData.players || {});
      const botIds = new Set(roomPlayers.filter((player) => player?.isBot || /^(bot[_-]|auctionbot[_-])/i.test(String(player?.id || ''))).map((player) => player.id));
      for (const [teamKey, botTeam] of Object.entries(readinessData)) {
        if (!botTeam?.teamId || botTeam.teamId === 'NONE' || botTeam.disqualified) continue;
        const botUserId = String(botTeam.userId || '').trim();
        if (!botIds.has(botUserId) && !/^(bot[_-]|auctionbot[_-])/i.test(botUserId)) continue;
        const saved = botTeam.playingXI;
        const alreadyValid = saved?.startingXI?.length === 11 && Boolean(saved?.impactPlayerChasing || saved?.impactPlayer) && Boolean(saved?.impactPlayerDefending || saved?.impactPlayer)
          && validatePlayingXIOptions(saved.startingXI, saved.impactPlayerChasing || saved.impactPlayer, saved.impactPlayerDefending || saved.impactPlayer, botTeam.squad || [], IPL_PLAYERS);
        if (alreadyValid) continue;
        const selection = autoSelectBestXI(botTeam.squad || [], IPL_PLAYERS);
        if (!selection.startingXI?.length || !selection.impactPlayerChasing || !selection.impactPlayerDefending
          || !validatePlayingXIOptions(selection.startingXI, selection.impactPlayerChasing, selection.impactPlayerDefending, botTeam.squad || [], IPL_PLAYERS)) {
          throw new Error(`Could not automatically select an eligible Playing XI for bot franchise ${botTeam.teamName || botTeam.teamId}.`);
        }
        await updateRtdb(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${teamKey}`), {
          playingXI: {
            startingXI: selection.startingXI,
            impactPlayer: selection.impactPlayerChasing,
            impactPlayerChasing: selection.impactPlayerChasing,
            impactPlayerDefending: selection.impactPlayerDefending,
            autoSelected: true,
            selectionStatus: 'bot_auto_selected',
            submittedAt: getSyncedTime(),
            autoSelectedAt: getSyncedTime()
          }
        });
        botTeam.playingXI = { ...selection, autoSelected: true, selectionStatus: 'bot_auto_selected', submittedAt: getSyncedTime() };
      }
    }

    const allSubmitted = noEligibleMegaFranchises || (readinessTeams.length >= 2 && readinessTeams.every((t) =>
      t.playingXI?.startingXI?.length === 11 && Boolean(t.playingXI?.impactPlayerChasing || t.playingXI?.impactPlayer) && Boolean(t.playingXI?.impactPlayerDefending || t.playingXI?.impactPlayer)
    ));
    const deadlinePassed = getSyncedTime() >= Number(roomData.xiSubmissionDeadline || 0);
    if (!usesSquadBalanceAnalysis && !deadlinePassed && !allSubmitted) return;

    const claim = await runTransactionRtdb(roomRef, (current) => {
      if (!current || current.status !== 'awaiting_xi') return;
      const stillBeforeDeadline = getSyncedTime() < Number(current.xiSubmissionDeadline || 0);
      if (!usesSquadBalanceAnalysis && stillBeforeDeadline && !allSubmitted) return;
      return { ...current, status: 'analyzing', winnerAnalysisStatus: 'analyzing' };
    });
    if (!claim.committed) return;

    try {
      const teamsSnap = await get(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams`));
      const teamsData = teamsSnap.val() || {};
      const allFranchises = Object.values(teamsData).filter((t) => t?.teamId && t.teamId !== 'NONE');
      const franchises = allFranchises.filter((t) => !t.disqualified);
      const disqualifiedFranchises = allFranchises.filter((t) => t.disqualified);
      const payload = [];
      const toFullPlayer = (item) => {
        const id = typeof item === 'string' ? item : item?.id;
        const catalog = IPL_PLAYERS.find((p) => p.id === id) || {};
        return { ...catalog, ...((typeof item === 'object' && item) || {}), id };
      };
      for (const [teamKey, t] of Object.entries(teamsData)) {
        if (!t?.teamId || t.teamId === 'NONE' || t.disqualified) continue;
        const squad = Array.isArray(t.squad) ? t.squad : [];
        const fullSquad = squad.map(toFullPlayer);
        if (usesSquadBalanceAnalysis) {
          payload.push({
            franchiseId: t.teamId,
            franchiseName: t.teamName || t.teamId,
            submittedXI: [],
            fullSquad,
            autoSelected: false
          });
          continue;
        }
        const savedXI = t.playingXI;
        const savedChasing = savedXI?.impactPlayerChasing || savedXI?.impactPlayer;
        const savedDefending = savedXI?.impactPlayerDefending || savedXI?.impactPlayer;
        const savedIsValid = savedXI?.startingXI?.length === 11
          && Boolean(savedChasing) && Boolean(savedDefending)
          && validatePlayingXIOptions(savedXI.startingXI, savedChasing, savedDefending, squad, IPL_PLAYERS);
        const selection = savedIsValid
          ? savedXI
          : autoSelectBestXI(squad, IPL_PLAYERS);
        const selectedChasing = selection.impactPlayerChasing || selection.impactPlayer;
        const selectedDefending = selection.impactPlayerDefending || selection.impactPlayer;
        if (!selection.startingXI?.length || !selectedChasing || !selectedDefending
          || !validatePlayingXIOptions(selection.startingXI, selectedChasing, selectedDefending, squad, IPL_PLAYERS)) {
          throw new Error(`Could not automatically select an eligible Playing XI for ${t.teamName || t.teamId}. Please check that the franchise squad has enough eligible players.`);
        }

        const autoSelected = !savedIsValid || Boolean(savedXI.autoSelected);

        // Persist the fallback selection so it survives refreshes/rejoins and
        // the result shown to the franchise matches the XI sent to Gemini.
        if (!savedIsValid) {
          await updateRtdb(ref(getRoomDatabase(roomId), `auctions/${roomId}/teams/${teamKey}`), {
            playingXI: {
              startingXI: selection.startingXI.map(toFullPlayer),
              impactPlayer: toFullPlayer(selectedChasing),
              impactPlayerChasing: toFullPlayer(selectedChasing),
              impactPlayerDefending: toFullPlayer(selectedDefending),
              autoSelected: true,
              selectionStatus: 'auto_selected',
              submittedAt: getSyncedTime(),
              autoSelectedAt: getSyncedTime()
            }
          });
        }

        payload.push({
          franchiseId: t.teamId,
          franchiseName: t.teamName || t.teamId,
          submittedXI: [
            ...selection.startingXI.map((player, index) => ({ ...toFullPlayer(player), battingOrder: index + 1 })),
            { ...toFullPlayer(selectedChasing), isImpactPlayer: true, impactScenario: 'chasing' },
            { ...toFullPlayer(selectedDefending), isImpactPlayer: true, impactScenario: 'defending' }
          ],
          impactPlayerChasing: toFullPlayer(selectedChasing),
          impactPlayerDefending: toFullPlayer(selectedDefending),
          fullSquad,
          autoSelected,
          selectionType: autoSelected ? 'automatic' : 'manual'
        });
      }
      let eligibleRankings = [];
      let analysisModel = 'Eligibility Rules';
      if (payload.length >= 2 || (usesSquadBalanceAnalysis && payload.length === 1)) {
        if (!user?.getIdToken) throw new Error('Sign in again to complete winner analysis.');
        const analysisToken = await user.getIdToken();
        const response = await fetch('/api/analyze-winner', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + analysisToken
          },
          body: JSON.stringify({
            roomId,
            serverId: getRoomServerId(roomId),
            auctionType: roomData.auctionType || 'mega',
            franchises: payload
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'AI analysis failed');
        eligibleRankings = result.rankings || [];
        analysisModel = result.model || 'AI';
      } else if (payload.length === 1) {
        eligibleRankings = [{
          franchiseId: payload[0].franchiseId,
          rank: 1,
          score: null,
          summary: usesSquadBalanceAnalysis
            ? 'This is the only participating franchise. Its overall squad balance is recorded as the sole ranking.'
            : 'This is the only franchise that met the 18-player minimum and is therefore the sole eligible franchise.',
          strengths: [],
          risks: []
        }];
      }

      const disqualifiedRankings = disqualifiedFranchises.map((franchise, index) => {
        const squadCount = Array.isArray(franchise.squad) ? franchise.squad.length : 0;
        const reason = franchise.disqualificationReason || `You need to buy minimum 18 players, but you bought only ${squadCount} players. So you are disqualified.`;
        return {
          franchiseId: franchise.teamId,
          rank: eligibleRankings.length + index + 1,
          score: null,
          disqualified: true,
          summary: `DISQUALIFIED: ${reason}`,
          strengths: [],
          risks: [reason]
        };
      });
      const rankings = [...eligibleRankings, ...disqualifiedRankings].sort((a, b) => a.rank - b.rank);
      const completedAt = getSyncedTime();
      await updateRtdb(roomRef, {
        status: 'completed',
        completedAt,
        winnerAnalysisStatus: 'completed',
        winnerRankings: rankings,
        winnerAnalysisModel: analysisModel,
        winnerAnalysisCompletedAt: completedAt
      });
      // Start the 48-hour history retention clock only after final rankings are saved.
      try {
        await set(ref(rtdb, `completedRoomHistory/${roomId}/completedAt`), completedAt);
      } catch (historyIndexError) {
        console.warn('Could not schedule completed history expiry:', historyIndexError?.message || historyIndexError);
      }
      void trackAnalyticsEvent('auction_completed', roomId);
      // Mark the public directory entry completed before removing it. The lobby
      // filters out completed entries, so a temporary RTDB delete failure cannot
      // leave a finished auction available to new users.
      const publicRoomRef = ref(getRoomDatabase(roomId), `publicRooms/${roomId}`);
      try {
        await updateRtdb(publicRoomRef, {
          status: 'completed',
          completedAt: getSyncedTime()
        });
      } catch (directoryUpdateError) {
        console.warn('Could not mark public room completed:', directoryUpdateError);
      }
      try {
        await remove(publicRoomRef);
      } catch (directoryError) {
        console.warn('Public room cleanup failed; completed status remains as a fallback:', directoryError);
      }
      await push(ref(getRoomDatabase(roomId), `auctions/${roomId}/messages`), {
        userId: 'system', userName: 'System',
        text: usesSquadBalanceAnalysis
          ? 'Classic/Sprint AI squad-balance rankings are ready. Open Auction Summary to view the rankings and reasons.'
          : disqualifiedFranchises.length
            ? `Auction rankings are ready. ${disqualifiedFranchises.length} franchise(s) disqualified for buying fewer than 18 players. Open Auction Summary to view the results.`
            : 'AI franchise rankings are ready. Open Auction Summary to view the results.',
        type: 'log', timestamp: serverTimestampRtdb()
      });
      await flushAuctionToFirestore(roomId);
    } catch (error) {
      await updateRtdb(roomRef, { status: 'analysis_failed', winnerAnalysisStatus: 'failed', winnerAnalysisError: String(error?.message || 'AI analysis failed') });
      throw error;
    }
  }, [user, getSyncedTime, flushAuctionToFirestore]);

  // Only the host can retry because the retry transaction updates the complete
  // room document and Firebase rules intentionally reserve that write for host.
  const retryWinnerAnalysis = useCallback(async (roomId) => {
    if (!user) return;
    const roomRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/room`);
    const roomSnap = await get(roomRef);
    if (!roomSnap.exists() || roomSnap.val()?.hostId !== user.uid) return;
    const retryClaim = await runTransactionRtdb(roomRef, (current) => {
      if (!current || current.status !== 'analysis_failed') return;
      return {
        ...current,
        status: 'awaiting_xi',
        winnerAnalysisStatus: 'collecting',
        winnerAnalysisError: null
      };
    });
    if (!retryClaim.committed) return;
    await finalizeWinnerAnalysis(roomId);
  }, [user, finalizeWinnerAnalysis]);



  // ─── Bot Management & Bidding Engine ───

  const placeBotBid = useCallback(async (roomId, botUserId, botTeamId, botName) => {
    if (!roomId || !user) return;
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/place-bot-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, botUserId, botTeamId, botName })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.reason !== 'live_state_changed' && result.reason !== 'bid_timer_expired' && result.reason !== 'already_high_bidder') {
        throw new Error(result.error || 'Bot bid failed.');
      }
      return result;
    }
    return result;
  }, [user]);

  const botTeamMutation = useCallback(async (roomId, action, teamIdOrBotId) => {
    if (!user) throw new Error('Sign in required');
    const roomServerId = getRoomServerId(roomId);
    if (roomServerId === '3') await ensureServer3Auth();
    else if (roomServerId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/room-bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId: roomServerId, action, value: teamIdOrBotId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Bot team update failed');
    return result;
  }, [user]);

  const submitBotRetentionAction = useCallback(async (roomId, botUserId, decision, amount = null) => {
    if (!user) throw new Error('Sign in required');
    const serverId = getRoomServerId(roomId);
    if (serverId === '3') await ensureServer3Auth();
    else if (serverId === '2') await ensureServer2Auth();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/bot-retention-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomId, serverId, botUserId, decision, amount })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Bot RTM action failed');
    return result;
  }, [user]);

  const addBotTeam = useCallback(async (roomId, teamId) => {
    return botTeamMutation(roomId, 'add', teamId);
  }, [botTeamMutation]);

  const removeBotTeam = useCallback(async (roomId, botUserId) => {
    return botTeamMutation(roomId, 'remove', botUserId);
  }, [botTeamMutation]);

  const fillEmptyTeamsWithBots = useCallback(async (roomId) => {
    return botTeamMutation(roomId, 'fill', null);
  }, [botTeamMutation]);

  // Guard ref: track the last timer cycle (timerEndsAt) that a bot bid was queued for.
  // Prevents multiple bot bids from being scheduled when currentAuction re-renders
  // multiple times during the same countdown cycle.
  const lastBotBidCycleRef = React.useRef(null);

  // One host client coordinates bot RTM decisions, just like bot bidding.
  // Bots try to use both retention cards on eligible Set 1 and Set 2 players.
  const lastBotRtmActionRef = React.useRef(null);

  useEffect(() => {
    if (!currentAuction || !user || currentAuction.hostId !== user.uid) return;
    const live = currentAuction.currentAuction;
    const offer = live?.retentionOffer;
    if (live?.status !== 'processing_sale' || offer?.status !== 'pending') return;

    const phase = offer.phase;
    const botId = phase === 'counter_bid' ? offer.buyerId : offer.eligibleUserId;
    if (!String(botId || '').startsWith('bot_')) return;

    const actionKey = `${currentAuction.id}:${phase}:${offer.expiresAt}:${botId}:${offer.counterBid ?? ''}`;
    if (lastBotRtmActionRef.current === actionKey) return;
    lastBotRtmActionRef.current = actionKey;

    // Small reaction delay makes bot decisions feel natural. The transaction
    // rechecks the live offer, so a stale timer cannot override a human decision.
    setTimeout(async () => {
      const roomId = currentAuction.id;
      const liveRef = ref(getRoomDatabase(roomId), `auctions/${roomId}/live`);
      const roomData = currentAuction;
      const player = IPL_PLAYERS.find((p) => p.id === offer.playerId);
      const botTeam = roomTeams.find((t) => t.userId === botId || t.id === `${roomId}_${botId}`);
      if (!player || !botTeam) {
        lastBotRtmActionRef.current = null;
        return;
      }

      const squad = Array.isArray(botTeam.squad) ? botTeam.squad : [];
      const budget = Number(botTeam.budgetRemaining ?? roomData.settings?.budget ?? 120);
      const squadLimit = Number(roomData.squadLimit || 25);
      const overseasLimit = roomData.auctionType === 'sprint5' ? 2
        : roomData.auctionType === 'sprint11' ? 4 : MEGA_OVERSEAS_LIMIT;
      const slotsLeft = squadLimit - squad.length;
      const isOverseas = player.country && player.country !== 'IND';
      const overseasCount = squad.reduce((count, item) => {
        const id = typeof item === 'string' ? item : item?.id;
        const info = IPL_PLAYERS.find((p) => p.id === id);
        return count + (info && info.country !== 'IND' ? 1 : 0);
      }, 0);
      const roleCount = squad.reduce((count, item) => {
        const id = typeof item === 'string' ? item : item?.id;
        const info = IPL_PLAYERS.find((p) => p.id === id);
        return count + (info?.role === player.role ? 1 : 0);
      }, 0);
      const maxPerRole = squadLimit <= 5 ? 3 : squadLimit <= 11 ? 5 : 9;
      const canAddPlayer = slotsLeft > 0 && (!isOverseas || overseasCount < overseasLimit)
        && (roleCount < maxPerRole || slotsLeft <= 1);
      const isRtmPrioritySet = ['Marquee Set 1', 'Set 1', 'Set 2'].includes(String(player.set || '').trim());
      const cardsRemaining = Number.isFinite(Number(botTeam.retentionCardsRemaining))
        ? Number(botTeam.retentionCardsRemaining)
        : 2;

      try {
        if (phase === 'initial_decision' && offer.eligibleUserId === botId) {
          const shouldUseRtm = isRtmPrioritySet && cardsRemaining > 0 && canAddPlayer
            && budget >= Number(offer.bid || 0);
          await submitBotRetentionAction(roomId, botId, shouldUseRtm ? 'accept' : 'decline');
        } else if (phase === 'counter_bid' && offer.buyerId === botId) {
          // Keep bot RTM counter-prices strictly below ₹25 Cr while
          // still requiring the counter to exceed the current bid.
          const minCounter = Math.max(5, Math.ceil((Number(offer.bid || 0) + 0.25) * 4) / 4);
          const maxCounter = Math.min(24.75, budget);
          if (canAddPlayer && maxCounter >= minCounter) {
            const steps = Math.floor((maxCounter - minCounter) * 4 + 0.0001);
            const counterBid = Number((minCounter + Math.floor(Math.random() * (steps + 1)) / 4).toFixed(2));
            await submitBotRetentionAction(roomId, botId, 'counter_bid', counterBid);
          }
        } else if (phase === 'match_decision' && offer.eligibleUserId === botId
          && offer.counterBid != null) {
          const counterBid = Number(offer.counterBid);
          const slotsAfter = Math.max(0, slotsLeft - 1);
          const leavesEnoughPurse = slotsLeft <= 1 || (budget - counterBid) / slotsAfter >= 0.30;
          const shouldMatch = isRtmPrioritySet && cardsRemaining > 0 && canAddPlayer
            && budget >= counterBid && leavesEnoughPurse;
          await submitBotRetentionAction(roomId, botId, shouldMatch ? 'match' : 'decline_counter');
        }
      } catch (error) {
        console.warn('[Bot RTM] Automated decision failed:', error);
        lastBotRtmActionRef.current = null;
      }
    }, 350 + Math.random() * 650);
  }, [currentAuction, user, roomTeams, getSyncedTime, submitBotRetentionAction]);

  // Host Bidding Bot Loop Effect
  useEffect(() => {
    if (!currentAuction || !user || currentAuction.hostId !== user.uid) return;
    if (currentAuction.currentAuction?.status !== 'bidding') return;

    const botPlayers = (currentAuction.players || []).filter(p => p.isBot || p.id.startsWith('bot_'));
    if (botPlayers.length === 0) return;

    const live = currentAuction.currentAuction;
    if (!live || live.status !== 'bidding') return;

    const player = IPL_PLAYERS.find(p => p.id === live.playerId);
    if (!player) return;

    // ─── Deduplicate: skip if we already queued a bot bid for this exact timer cycle ───
    // A timer cycle is identified by the timerEndsAt value.
    // When a bid is placed (human or bot), timerEndsAt changes → new cycle → new bid allowed.
    const cycleKey = `${live.playerId}_${live.timerEndsAt}`;
    if (lastBotBidCycleRef.current === cycleKey) return;
    lastBotBidCycleRef.current = cycleKey;

    const now = getSyncedTime();
    const timerSec = currentAuction.settings?.bidTimer || DEFAULT_BID_TIMER_SECONDS;
    const timerMs = timerSec * 1000;
    const remainingMs = Math.max(0, (live.timerEndsAt || 0) - now);
    const cBid = live.currentBid || 0;

    // If timer has already expired, don't schedule anything
    if (remainingMs <= 0) return;

    // ─── Timer-Adaptive & Mixed Pacing Engine ───
    // Dynamically scales to host's configured timer (5s, 10s, 15s, 20s)
    let delayMs = 400;
    const randMode = Math.random();

    if (cBid < 3.0) {
      // Early Price Stage: 70% rapid impulse, 30% mid-timer hesitation
      if (randMode < 0.70) {
        delayMs = Math.min(900, timerMs * (0.05 + Math.random() * 0.10));
      } else {
        delayMs = timerMs * (0.25 + Math.random() * 0.25);
      }
    } else {
      // High Price / Intense Stage: Mixed blend (Impulse vs Mid-Timer vs Clutch Sniping)
      if (randMode < 0.35) {
        // Instant Impulse Reaction
        delayMs = Math.min(1000, timerMs * (0.08 + Math.random() * 0.12));
      } else if (randMode < 0.70) {
        // Mid-Timer Re-evaluation
        delayMs = timerMs * (0.30 + Math.random() * 0.25);
      } else {
        // Late Clutch Sniping (final 15–30% of countdown)
        const targetRemainMs = timerMs * (0.15 + Math.random() * 0.15);
        delayMs = remainingMs > targetRemainMs
          ? remainingMs - targetRemainMs
          : 300 + Math.random() * 400;
      }
    }

    // Bound delay safely: minimum 300ms, maximum (remainingMs - 300ms)
    delayMs = Math.max(300, Math.min(delayMs, Math.max(300, remainingMs - 300)));

    const initialBudget = currentAuction.settings?.budget || 120.0;

    const timer = setTimeout(async () => {
      // Pick a suitable bot team that is not the current high bidder
      const eligibleBots = shuffleArray(botPlayers.filter(p => p.id !== live.highBidderId));
      for (const botP of eligibleBots) {
        const botTeam = roomTeams.find(t => t.userId === botP.id);
        if (!botTeam) continue;

        const bidDecision = evaluateBotBid({
          player,
          currentBid: live.currentBid || 0,
          highBidderId: live.highBidderId,
          botTeam,
          squadLimit: currentAuction.squadLimit || 25,
          overseasLimit: currentAuction.overseasLimit || MEGA_OVERSEAS_LIMIT,
          initialBudget,
        });

        if (bidDecision && bidDecision.shouldBid) {
          try {
            // Pass room timer setting, maxValuation, and budgetRemaining to enforce bounds on retries
            await placeBotBid(
              currentAuction.id,
              botP.id,
              botP.team,
              botP.name,
              timerSec,
              bidDecision.maxValuation,
              botTeam.budgetRemaining ?? initialBudget
            );
          } catch (e) {
            // Graceful bot bid fail
          }
          break; // 1 bid per delay tick
        }
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [currentAuction, user, roomTeams, placeBotBid, getSyncedTime]);

  const value = {
    currentAuction,
    team,
    roomTeams,
    loading,
    createRoom,
    joinRoomDb,
    kickPlayer,
    joinAuction,
    placeBid,
    updatePlayerTeam,
    updateRoomSettings,
    startAuction,
    endPlayerAuction,
    recoverPlayerTransition,
    decideRetention,
    submitRetentionCounterBid,
    pauseAuction,
    resumeAuction,
    endAuction,
    submitPlayingXI,
    finalizeWinnerAnalysis,
    retryWinnerAnalysis,
    sendMessage,
    messages,
    addBotTeam,
    removeBotTeam,
    fillEmptyTeamsWithBots,
    getSyncedTime
  };

  return (
    <AuctionContext.Provider value={value}>
      {children}
    </AuctionContext.Provider>
  );
};