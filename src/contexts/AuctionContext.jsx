// Modified from the upstream project by saiprasad00700.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import app, { db, getServerTime, isServerTimeSynced, rtdb } from '../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { supabase } from '../lib/supabase';
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
import { autoSelectBestXI, PLAYING_XI_DEADLINE_MS, validatePlayingXI } from '../lib/auctionWinnerRules';


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
    return getServerTime();
  }, []);

  // RTM actions can be clicked immediately after a room reconnects. Wait briefly
  // for Firebase's server-time metadata instead of rejecting the user's click
  // during the short connection/sync window.
  const ensureServerTimeSync = useCallback(async () => {
    if (isServerTimeSynced()) return;
    try { goOnline(rtdb); } catch (e) {}
    await new Promise((resolve) => {
      let attempts = 0;
      const retry = setInterval(() => {
        attempts += 1;
        if (isServerTimeSynced() || attempts >= 50) {
          clearInterval(retry);
          resolve();
        }
      }, 100);
    });
    if (!isServerTimeSynced()) {
      throw new Error('Auction server time is still connecting. Please try again in a moment.');
    }
  }, []);

  // Create a new room in DB (RTDB + Supabase index, zero Firestore load)
  const createRoom = useCallback(async (roomId, userId, playerDetails, auctionType = 'mega', isPublic = true) => {
    // Explicitly connect RTDB WebSocket for room creation
    try { goOnline(rtdb); } catch (e) {}

    const teamDetails = TEAMS.find(t => t.id === playerDetails.team);
    
    // Mode-specific configurations
    const isSprint5 = auctionType === 'sprint5';
    const isSprint11 = auctionType === 'sprint11';
    
    const budget = isSprint5 ? 60.0 : isSprint11 ? 90.0 : 120.0;
    const squadLimit = isSprint5 ? 5 : isSprint11 ? 11 : 25;
    const overseasLimit = isSprint5 ? 2 : 4;

    const liveRef = ref(rtdb, `auctions/${roomId}/live`);
    await set(liveRef, { status: 'waiting' });

    // Instantly set host online presence in RTDB
    const hostPresenceRef = ref(rtdb, `auctions/${roomId}/presence/${userId}`);
    await set(hostPresenceRef, {
      online: true,
      lastSeen: serverTimestampRtdb()
    });

    // Sync to RTDB for real-time reads
    const rtdbRoomRef = ref(rtdb, `auctions/${roomId}/room`);
    await set(rtdbRoomRef, {
      hostId: userId,
      hostName: playerDetails.name,
      status: 'waiting',
      auctionType,
      isPublic: !!isPublic,
      lastActivityAt: Date.now(),
      squadLimit,
      overseasLimit,
      players: [{
        id: userId,
        name: playerDetails.name,
        team: playerDetails.team,
        teamName: teamDetails?.name || 'Unknown',
        isHost: true
      }],
      bannedPlayers: [],
      settings: {
        bidTimer: 10,
        budget
      }
    });


    // Publish only minimal metadata for public rooms; never expose auction state.
    const publicRoomRef = ref(rtdb, `publicRooms/${roomId}`);
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
      const selectFranchise = httpsCallable(getFunctions(app), 'updatePlayerTeam');
      await selectFranchise({ roomId, userId, teamId: playerDetails.team });
    }

    // Record history without blocking room creation if rules are not deployed yet.
    try {
      await set(ref(rtdb, `userAuctionHistory/${userId}/${roomId}`), {
        roomId, userId, hostId: userId,
        hostName: playerDetails.name || 'Manager',
        teamId: playerDetails.team || '',
        teamName: teamDetails?.name || 'Unknown',
        mode: auctionType, status: 'waiting', createdAt: Date.now(),
        spent: 0, budgetRemaining: budget, squad: []
      });
    } catch (historyError) {
      console.warn('Could not save room history entry:', historyError?.message || historyError);
    }

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
          settings: { bidTimer: 10, budget }
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
      const roomSnap = await get(ref(rtdb, `auctions/${roomId}/room`));
      const teamsSnap = await get(ref(rtdb, `auctions/${roomId}/teams`));

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
    const rtdbRoomRef = ref(rtdb, `auctions/${roomId}/room`);
    const roomSnap = await get(rtdbRoomRef);
    const roomData = roomSnap.exists() ? roomSnap.val() : {};
    const auctionType = roomData.auctionType || 'mega';

    let targetPlayers = IPL_PLAYERS.length;
    if (auctionType === 'sprint11') targetPlayers = 150;
    else if (auctionType === 'sprint5') targetPlayers = 75;

    const marqueeIndices = [];
    const nonMarqueeIndicesByRole = {};
    IPL_PLAYERS.forEach((p, i) => {
      if (p.set.includes('Marquee')) marqueeIndices.push(i);
      else {
        if (!nonMarqueeIndicesByRole[p.role]) nonMarqueeIndicesByRole[p.role] = [];
        nonMarqueeIndicesByRole[p.role].push(i);
      }
    });

    const selectedPlayersByRole = new Set(marqueeIndices);
    const nonMarqueeTarget = Math.max(0, targetPlayers - marqueeIndices.length);
    const nonMarqueeTotal = IPL_PLAYERS.length - marqueeIndices.length;
    const fraction = nonMarqueeTotal > 0 ? (nonMarqueeTarget / nonMarqueeTotal) : 1;
    Object.keys(nonMarqueeIndicesByRole).forEach(roleName => {
      const shuffledRole = shuffleArray(nonMarqueeIndicesByRole[roleName]);
      const limit = auctionType === 'mega' ? shuffledRole.length : Math.max(1, Math.ceil(shuffledRole.length * fraction));
      shuffledRole.slice(0, limit).forEach(idx => selectedPlayersByRole.add(idx));
    });

    const sets = [...new Set(IPL_PLAYERS.map(p => p.set))];
    let randomizedIndices = [];
    sets.forEach(setName => {
      const setIndices = IPL_PLAYERS
        .map((p, i) => (p.set === setName && selectedPlayersByRole.has(i)) ? i : -1)
        .filter(i => i !== -1);
      randomizedIndices = [...randomizedIndices, ...shuffleArray(setIndices)];
    });
    if (!randomizedIndices.length) throw new Error('No players were selected for this auction.');
    if (!user?.uid) throw new Error('Sign in before starting the auction.');
    const call = httpsCallable(getFunctions(app), 'startAuction');
    await call({
      roomId,
      playerOrder: randomizedIndices,
      firstPlayerId: IPL_PLAYERS[randomizedIndices[0]].id
    });
    await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'auction_started' });
  }, [user]);

  const endPlayerAuction = useCallback(async (roomId) => {
    // A single missed sync check must not permanently stall the lot at 0 seconds.
    // Reconnect RTDB and briefly wait for its server-time offset before giving up.
    if (!isServerTimeSynced()) {
      try { goOnline(rtdb); } catch (e) {}
      await new Promise((resolve) => {
        let attempts = 0;
        const retry = setInterval(() => {
          attempts += 1;
          if (isServerTimeSynced() || attempts >= 50) {
            clearInterval(retry);
            resolve();
          }
        }, 100);
      });
      if (!isServerTimeSynced()) return;
    }
    // Prevent duplicate calls from the timer interval
    if (endingPlayerRef.current) return;
    endingPlayerRef.current = true;

    try {
      const liveRef = ref(rtdb, `auctions/${roomId}/live`);

      // Avoid treating an active RTM decision window as a failed settlement.
      // The timer can call this handler repeatedly while RTM is waiting; aborting
      // a transaction on every tick produced a flood of false errors and retries.
      const initialLiveSnap = await get(liveRef);
      const initialLive = initialLiveSnap.exists() ? initialLiveSnap.val() : null;
      if (!initialLive) return;
      if (initialLive.status === 'sold' || initialLive.status === 'unsold') return;
      if (initialLive.status === 'processing_sale') {
        const offer = initialLive.retentionOffer;
        if (offer?.status === 'pending' && getSyncedTime() < Number(offer.expiresAt) + 1500) {
          return;
        }
      }

      // Read the room and franchise roster before claiming the expired lot.
      const preRoomSnap = await get(ref(rtdb, `auctions/${roomId}/room`));
      const preRoomData = preRoomSnap.exists() ? preRoomSnap.val() : {};
      const preTeamsSnap = await get(ref(rtdb, `auctions/${roomId}/teams`));
      const preTeamsData = preTeamsSnap.exists() ? preTeamsSnap.val() : {};
      const { getPlayerOriginalFranchise } = await import('../data/playerOriginalFranchises');
      const { RETENTION_DECISION_MS, RETENTION_CARDS_PER_FRANCHISE, canUseRetentionCard } = await import('../lib/auctionWinnerRules');

      // Claim the lot atomically. If an eligible original franchise manager is present,
      // pause settlement for the five-second retention decision before charging anyone.
      const txResult = await runTransactionRtdb(liveRef, (currentData) => {
        if (!currentData) return;
        const now = getSyncedTime();

        // Recovery path: if the client that opened a retention offer disconnected,
        // any connected client can settle it after its deadline.
        if (currentData.status === 'processing_sale') {
          const offer = currentData.retentionOffer;
          if (!offer || offer.status !== 'pending') return;
          // Another client may still be inside the current RTM decision window.
          // Do not abort the transaction just because this timer tick arrived early.
          if (now < Number(offer.expiresAt) + 1500) return;
          if (offer.phase === 'counter_bid' && offer.rtmUsed) {
            // Original franchise exercised RTM but the winning bidder did not raise in time.
            currentData.highBidderId = offer.eligibleUserId;
            currentData.highBidderName = offer.eligibleTeamName;
            currentData.highBidderTeamId = offer.originalFranchiseId;
            currentData.currentBid = Number(offer.bid || currentData.currentBid || 0);
            offer.status = 'accepted';
          } else if (offer.phase === 'match_decision' && offer.counterBid != null) {
            if (offer.decision === 'match' && Number(offer.decidedAt) <= Number(offer.expiresAt)) {
              currentData.highBidderId = offer.eligibleUserId;
              currentData.highBidderName = offer.eligibleTeamName;
              currentData.highBidderTeamId = offer.originalFranchiseId;
              currentData.currentBid = Number(offer.counterBid);
              offer.status = 'accepted';
            } else {
              currentData.highBidderId = offer.buyerId;
              currentData.highBidderName = offer.buyerName;
              currentData.highBidderTeamId = offer.buyerTeamId;
              currentData.currentBid = Number(offer.counterBid);
              offer.status = 'declined';
            }
          } else {
            // No RTM, or the initial decision expired: the original winning bid stands.
            offer.status = offer.decision === 'decline' ? 'declined' : 'expired';
          }
          currentData.status = currentData.highBidderId ? 'sold' : 'unsold';
          currentData.transitionDeadline = now + (currentData.status === 'sold' ? 5000 : 2000) + 2500;
          return currentData;
        }

        if (currentData.status !== 'bidding') return;
        if (currentData.timerEndsAt && now < currentData.timerEndsAt) return;

        const isSold = !!currentData.highBidderId;
        let retentionOffer = null;
        if (isSold) {
          const originalFranchiseId = getPlayerOriginalFranchise(currentData.playerId);
          const buyerFranchiseId = currentData.highBidderTeamId;
          const eligiblePlayer = (preRoomData.players || []).find((p) =>
            p.team === originalFranchiseId && p.id !== currentData.highBidderId
          );
          const eligibleTeamEntry = Object.entries(preTeamsData).find(([, t]) =>
            t.userId === eligiblePlayer?.id && t.teamId === originalFranchiseId
          );
          const eligibleTeamData = eligibleTeamEntry?.[1] || {};
          const cardsRemaining = Number.isFinite(Number(eligibleTeamData.retentionCardsRemaining))
            ? Number(eligibleTeamData.retentionCardsRemaining)
            : RETENTION_CARDS_PER_FRANCHISE;
          const purseRemaining = Number(eligibleTeamData.budgetRemaining ?? preRoomData.settings?.budget ?? 120);
          if (originalFranchiseId && originalFranchiseId !== buyerFranchiseId && eligiblePlayer
            && canUseRetentionCard({
              originalFranchiseId,
              eligibleFranchiseId: eligibleTeamData.teamId,
              cardsRemaining,
              purseRemaining,
              winningBid: Number(currentData.currentBid || 0)
            })) {
            retentionOffer = {
              playerId: currentData.playerId,
              originalFranchiseId,
              eligibleUserId: eligiblePlayer.id,
              eligibleTeamName: eligiblePlayer.teamName || originalFranchiseId,
              buyerId: currentData.highBidderId,
              buyerTeamId: buyerFranchiseId,
              buyerName: currentData.highBidderName,
              bid: Number(currentData.currentBid || 0),
              counterBid: null,
              phase: 'initial_decision',
              rtmUsed: false,
              expiresAt: now + RETENTION_DECISION_MS,
              status: 'pending',
              decision: null
            };
          }
        }
        currentData.status = retentionOffer ? 'processing_sale' : (isSold ? 'sold' : 'unsold');
        // Shared deadline lets another connected client recover if the coordinator tab closes.
        if (!retentionOffer) currentData.transitionDeadline = now + (isSold ? 5000 : 2000) + 2500;
        else delete currentData.transitionDeadline;
        if (retentionOffer) currentData.retentionOffer = retentionOffer;
        return currentData;
      });

      if (!txResult.committed) {
        const latestState = txResult.snapshot?.val();
        const latestOffer = latestState?.retentionOffer;
        const genuinelyExpired = latestState?.status === 'bidding'
          ? (!latestState.timerEndsAt || getSyncedTime() >= Number(latestState.timerEndsAt))
          : latestState?.status === 'processing_sale'
            && latestOffer?.status === 'pending'
            && getSyncedTime() >= Number(latestOffer.expiresAt) + 1500;
        if (!genuinelyExpired) {
          endingPlayerRef.current = false;
          return;
        }
        console.error('[Auction] Settlement transaction was not committed.', {
          roomId,
          liveState: txResult.snapshot?.val() || null,
          serverTimeSynced: isServerTimeSynced(),
          serverTime: getSyncedTime()
        });
        endingPlayerRef.current = false;
        // A competing client or a clock boundary can make an otherwise valid
        // settlement transaction return uncommitted. Retry from fresh RTDB state
        // instead of leaving the lot stuck at 0 seconds.
        if (txResult.snapshot?.val()?.status === 'bidding'
          || txResult.snapshot?.val()?.status === 'processing_sale') {
          setTimeout(() => { void endPlayerAuction(roomId); }, 500);
        }
        return;
      }

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

        // A decision is accepted only if it was made by the eligible manager before expiry.
        const settleTx = await runTransactionRtdb(liveRef, (currentData) => {
          if (!currentData || currentData.status !== 'processing_sale') return;
          const offer = currentData.retentionOffer;
          if (!offer || offer.status !== 'pending') return;
          const now = getSyncedTime();
          const initialDeclined = offer.phase === 'initial_decision'
            && offer.decision === 'decline'
            && Number(offer.decidedAt) <= Number(offer.expiresAt);
          const matchDecisionMade = offer.phase === 'match_decision'
            && ['match', 'decline_counter'].includes(offer.decision)
            && Number(offer.decidedAt) <= Number(offer.expiresAt);
          if (!initialDeclined && !matchDecisionMade && now < Number(offer.expiresAt) + 1500) return;
          if (offer.phase === 'counter_bid' && offer.rtmUsed) {
            currentData.highBidderId = offer.eligibleUserId;
            currentData.highBidderName = offer.eligibleTeamName;
            currentData.highBidderTeamId = offer.originalFranchiseId;
            currentData.currentBid = Number(offer.bid || currentData.currentBid || 0);
            offer.status = 'accepted';
          } else if (offer.phase === 'match_decision' && offer.counterBid != null) {
            if (offer.decision === 'match' && Number(offer.decidedAt) <= Number(offer.expiresAt)) {
              currentData.highBidderId = offer.eligibleUserId;
              currentData.highBidderName = offer.eligibleTeamName;
              currentData.highBidderTeamId = offer.originalFranchiseId;
              currentData.currentBid = Number(offer.counterBid);
              offer.status = 'accepted';
            } else {
              currentData.highBidderId = offer.buyerId;
              currentData.highBidderName = offer.buyerName;
              currentData.highBidderTeamId = offer.buyerTeamId;
              currentData.currentBid = Number(offer.counterBid);
              offer.status = 'declined';
            }
          } else {
            offer.status = offer.decision === 'decline' ? 'declined' : 'expired';
          }
          currentData.status = currentData.highBidderId ? 'sold' : 'unsold';
          currentData.transitionDeadline = now + (currentData.status === 'sold' ? 5000 : 2000) + 2500;
          return currentData;
        });
        if (!settleTx.committed) {
          const failedState = settleTx.snapshot?.val() || null;
          const failedOffer = failedState?.retentionOffer || null;
          console.error('[Auction] RTM settlement transaction was not committed.', {
            roomId,
            liveStatus: failedState?.status ?? null,
            offerPhase: failedOffer?.phase ?? null,
            offerStatus: failedOffer?.status ?? null,
            offerDecision: failedOffer?.decision ?? null,
            offerExpiresAt: failedOffer?.expiresAt ?? null,
            offerDecidedAt: failedOffer?.decidedAt ?? null,
            hasCounterBid: failedOffer?.counterBid != null,
            serverTimeSynced: isServerTimeSynced(),
            serverTime: getSyncedTime(),
            liveState: failedState
          });
          endingPlayerRef.current = false;
          // Keep recovering if the lot is still awaiting RTM settlement. Another
          // connected client may have raced this transaction or its clock may
          // have reached the expiry boundary slightly later.
          if (failedState?.status === 'processing_sale' && failedOffer?.status === 'pending') {
            setTimeout(() => { void endPlayerAuction(roomId); }, 500);
          }
          return;
        }
        auctionState = settleTx.snapshot.val();
        if (auctionState.retentionOffer?.status === 'accepted') {
          await push(ref(rtdb, `auctions/${roomId}/messages`), {
            userId: 'system', userName: 'System',
            text: `${IPL_PLAYERS.find(p => p.id === auctionState.playerId)?.name || 'Player'} goes to ${auctionState.highBidderName} through RTM for ₹${Number(auctionState.currentBid).toFixed(2)} Cr.`,
            type: 'retention_accepted',
            metadata: { playerId: auctionState.playerId, teamId: auctionState.highBidderTeamId, bid: auctionState.currentBid },
            timestamp: serverTimestampRtdb()
          });
        } else if (auctionState.retentionOffer?.status === 'declined' || auctionState.retentionOffer?.status === 'expired') {
          await push(ref(rtdb, `auctions/${roomId}/messages`), {
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
      const rtdbRoomSnap = await get(ref(rtdb, `auctions/${roomId}/room`));
      const roomData = rtdbRoomSnap.exists() ? rtdbRoomSnap.val() : {};

      if (isSold) {
        teamDocId = `${roomId}_${auctionState.highBidderId}`;
        const teamRef = ref(rtdb, `auctions/${roomId}/teams/${teamDocId}`);
        const defaultBudget = roomData.settings?.budget || 120.0;

        // A transaction makes the squad append and budget deduction atomic. If
        // multiple browsers settle the same lot, only the first can apply it.
        const settleSale = httpsCallable(getFunctions(app), 'applySaleSettlement');
        const settlementResponse = await settleSale({ roomId, playerId: auctionState.playerId });
        const settlement = settlementResponse.data;
        const finalTeamData = settlement.team;
        teamSaleApplied = !settlement.alreadyApplied;
        newTeamData = finalTeamData;

        // Reconcile room-level counters from the committed team record, not by
        // incrementing a stale room snapshot. This also repairs the counters if a
        // previous client committed the squad transaction but disconnected before
        // updating room.players.
        if (finalTeamData) {
          const syncStats = httpsCallable(getFunctions(app), 'syncRoomPlayerStats');
          await syncStats({ roomId, userId: auctionState.highBidderId });
        }
      }

      // Do not advance the lot until required state writes have completed. A failed
      // write throws into the recovery path instead of being silently swallowed.
      const syncPromises = [];
      // A concurrent/recovery client that finds the player already in the squad
      // must not emit a second sale message.
      if (!isSold || teamSaleApplied) syncPromises.push(push(ref(rtdb, `auctions/${roomId}/messages`), {
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
      let playerOrder = roomData.playerOrder;
      if (!playerOrder) {
        const orderSnap = await get(ref(rtdb, `auctions/${roomId}/playerOrder`));
        if (orderSnap.exists()) playerOrder = orderSnap.val();
      }

      // ── Bug Fix 2: Always release endingPlayerRef via finally inside the timeout callback ──
      // Previously, component unmount before timeout fired left the ref stuck at true forever.
      const advanceToNextPlayer = async () => {
        try {
          if (roomData.status !== 'active') return;

          const settings = roomData.settings;
          const currentPlayerId = auctionState.playerId;
          const order = playerOrder || Array.from({ length: IPL_PLAYERS.length }, (_, i) => i);
          const currentPlayerIndexInOrder = order.findIndex(idx => IPL_PLAYERS[idx] && IPL_PLAYERS[idx].id === currentPlayerId);
          const nextIndexInOrder = currentPlayerIndexInOrder !== -1 ? order[currentPlayerIndexInOrder + 1] : order[0];

          if (nextIndexInOrder !== undefined && IPL_PLAYERS[nextIndexInOrder]) {
            const nextPlayer = IPL_PLAYERS[nextIndexInOrder];
            // Guard the local timeout with the same settled-lot identity as the
            // recovery path. If another client already advanced it, do not reset
            // the next player's timer or overwrite newer live state.
            await runTransactionRtdb(liveRef, (current) => {
              if (!current || current.playerId !== currentPlayerId
                || !['sold', 'unsold'].includes(current.status)) return;
              return {
                playerId: nextPlayer.id,
                currentBid: 0,
                highBidderId: '',
                highBidderName: 'No Bids',
                timerEndsAt: getSyncedTime() + (settings?.bidTimer || 10) * 1000,
                status: 'bidding'
              };
            });
          } else {
            // Natural end of bidding must enter the same shared XI phase as host-triggered end.
            const deadline = getSyncedTime() + PLAYING_XI_DEADLINE_MS;
            await updateRtdb(ref(rtdb, `auctions/${roomId}/room`), {
              status: 'awaiting_xi',
              xiSubmissionStartedAt: getSyncedTime(),
              xiSubmissionDeadline: deadline,
              winnerAnalysisStatus: 'collecting'
            });
            await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'bidding_ended' });
          }
        } finally {
          // Always release the lock — even if any async step above throws or component unmounts
          endingPlayerRef.current = false;
        }
      };

      setTimeout(advanceToNextPlayer, waitTime);
    } catch (err) {
      // Log the real failure instead of silently swallowing the auction settlement error.
      console.error('[Auction] endPlayerAuction failed:', err);
      endingPlayerRef.current = false;
    }
  }, [getSyncedTime, flushAuctionToFirestore]);

  // Recover an overdue sold/unsold transition from shared RTDB state. The
  // transaction checks the player, status and deadline again, so only one client
  // can advance a given settled lot.
  const recoverPlayerTransition = useCallback(async (roomId) => {
    if (!isServerTimeSynced()) return;
    const liveRef = ref(rtdb, `auctions/${roomId}/live`);
    const liveSnap = await get(liveRef);
    const live = liveSnap.exists() ? liveSnap.val() : null;
    if (!live || !['sold', 'unsold'].includes(live.status)) return;
    if (!Number.isFinite(Number(live.transitionDeadline)) || getSyncedTime() < Number(live.transitionDeadline)) return;

    const roomSnap = await get(ref(rtdb, `auctions/${roomId}/room`));
    if (!roomSnap.exists()) return;
    const roomData = roomSnap.val();
    if (roomData.status !== 'active') return;

    // Repair the sale's durable side effects before advancing the live lot.
    // This covers a coordinator disconnect after live.status became "sold" but
    // before the team squad/budget or room roster counters finished syncing.
    if (live.status === 'sold' && live.highBidderId && live.playerId) {
      const [retentionRules, playerFranchises] = await Promise.all([
        import('../lib/auctionWinnerRules'),
        import('../data/playerOriginalFranchises')
      ]);
      const { RETENTION_CARDS_PER_FRANCHISE } = retentionRules;
      const { getPlayerOriginalFranchise } = playerFranchises;
      const teamDetails = TEAMS.find((t) => t.id === live.highBidderTeamId);
      const teamRef = ref(rtdb, `auctions/${roomId}/teams/${roomId}_${live.highBidderId}`);
      const defaultBudget = Number(roomData.settings?.budget ?? 120);
      const offer = live.retentionOffer;
      const successfullyRetainedPlayer = offer?.status === 'accepted'
        && live.highBidderTeamId === offer.originalFranchiseId
        && (offer.decision === 'match'
          || (offer.phase === 'counter_bid' && offer.decision === 'accept'));

      const settleSale = httpsCallable(getFunctions(app), 'applySaleSettlement');
      const settlementResponse = await settleSale({ roomId, playerId: live.playerId });
      const settlement = settlementResponse.data;
      const finalTeam = settlement.team || null;
      if (!finalTeam) throw new Error('Sale recovery could not find or create the winning team record.');

      const syncStats = httpsCallable(getFunctions(app), 'syncRoomPlayerStats');
      await syncStats({ roomId, userId: live.highBidderId });
    }

    let playerOrder = roomData.playerOrder;
    if (!playerOrder) {
      const orderSnap = await get(ref(rtdb, `auctions/${roomId}/playerOrder`));
      if (orderSnap.exists()) playerOrder = orderSnap.val();
    }
    const order = playerOrder || Array.from({ length: IPL_PLAYERS.length }, (_, i) => i);
    const currentIndex = order.findIndex((idx) => IPL_PLAYERS[idx]?.id === live.playerId);
    const nextIndex = currentIndex >= 0 ? order[currentIndex + 1] : order[0];

    if (nextIndex === undefined || !IPL_PLAYERS[nextIndex]) {
      const claim = await runTransactionRtdb(liveRef, (current) => {
        if (!current || current.playerId !== live.playerId || !['sold', 'unsold'].includes(current.status)) return;
        if (Number(current.transitionDeadline) > getSyncedTime()) return;
        current.status = 'awaiting_xi';
        current.transitionDeadline = null;
        return current;
      });
      if (!claim.committed) return;
      const now = getSyncedTime();
      await updateRtdb(ref(rtdb, `auctions/${roomId}/room`), {
        status: 'awaiting_xi',
        xiSubmissionStartedAt: now,
        xiSubmissionDeadline: now + PLAYING_XI_DEADLINE_MS,
        winnerAnalysisStatus: 'collecting'
      });
      await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'bidding_ended' });
      return;
    }

    await runTransactionRtdb(liveRef, (current) => {
      if (!current || current.playerId !== live.playerId || !['sold', 'unsold'].includes(current.status)) return;
      if (Number(current.transitionDeadline) > getSyncedTime()) return;
      return {
        playerId: IPL_PLAYERS[nextIndex].id,
        currentBid: 0,
        highBidderId: '',
        highBidderName: 'No Bids',
        timerEndsAt: getSyncedTime() + (roomData.settings?.bidTimer || 10) * 1000,
        status: 'bidding'
      };
    });
  }, [getSyncedTime]);

  const joinRoomDb = useCallback(async (roomId, userId, playerDetails) => {
    // Explicitly connect RTDB WebSocket when joining a room
    try { goOnline(rtdb); } catch (e) {}

    const teamDetails = TEAMS.find(t => t.id === playerDetails.team);
    
    // Fetch current room state from RTDB (0 Firestore cost!)
    const rtdbRoomSnap = await get(ref(rtdb, `auctions/${roomId}/room`));
    let data = null;
    
    if (rtdbRoomSnap.exists()) {
      data = rtdbRoomSnap.val();
    } else {
      let supabaseFound = false;
      if (supabase) {
        try {
          const { data: sData } = await supabase.from('auctions').select('*').eq('id', roomId).maybeSingle();
          if (sData) {
            data = {
              id: sData.id,
              hostId: sData.host_id,
              hostName: sData.host_name,
              status: sData.status,
              auctionType: sData.auction_type || 'mega',
              isPublic: sData.is_public !== false,
              squadLimit: sData.squad_limit || 25,
              overseasLimit: sData.overseas_limit || 4,
              players: sData.players || [],
              bannedPlayers: sData.banned_players || [],
              settings: sData.settings || { bidTimer: 10, budget: 120 }
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

    if (data.status === 'completed') {
      throw new Error("This auction has already ended.");
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

    // Add/update the roster through a trusted callable; clients cannot write
    // the room roster directly under the security rules.
    const joinRoomCall = httpsCallable(getFunctions(app), 'joinAuctionRoom');
    await joinRoomCall({ roomId, userId, userName: updatedPlayer.name });

    // Save history independently of the activity heartbeat. A heartbeat/rules
    // failure must never prevent a successfully joined room from being recorded.
    try {
      const historyRef = ref(rtdb, `userAuctionHistory/${userId}/${roomId}`);
      const previousHistory = await get(historyRef);
      const previousEntry = previousHistory.exists() ? previousHistory.val() : {};
      await set(historyRef, {
        roomId, userId, hostId: data.hostId || '',
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

    // Refresh the inactivity heartbeat separately; do not let it block history.
    try {
      await httpsCallable(getFunctions(app), 'touchAuctionActivity')({ roomId });
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

    // Create/Update team in RTDB if team is provided
    if (playerDetails.team) {
      const selectFranchise = httpsCallable(getFunctions(app), 'updatePlayerTeam');
      await selectFranchise({ roomId, userId, teamId: playerDetails.team });
    }
  }, []);

  // Kick a player from the room
  const kickPlayer = useCallback(async (roomId, playerObj) => {
    if (!user?.uid) throw new Error('Sign in before removing a player.');
    const call = httpsCallable(getFunctions(app), 'kickAuctionPlayer');
    const result = await call({ roomId, playerId: playerObj?.id });
    await push(ref(rtdb, `auctions/${roomId}/messages`), {
      userId: 'system', userName: 'System',
      text: `${result.data?.playerName || playerObj?.name || 'Player'} has been removed from the session.`,
      type: 'log', timestamp: serverTimestampRtdb()
    });
  }, [user]);

  // Listen to current auction state live
  const joinAuction = useCallback((auctionId, userId) => {
    if (!userId) return () => {};
    
    // Explicitly open RTDB WebSocket connection for active auction session
    try { goOnline(rtdb); } catch (e) {}

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
    const myPresenceRef = ref(rtdb, `auctions/${auctionId}/presence/${userId}`);
    const connectedRef = ref(rtdb, '.info/connected');
    
    // ── Bug Fix: Declare shared state vars BEFORE any onValue subscriptions that reference them ──
    // Previously currentRoomData was declared at line 658 but referenced inside the onValue(connectedRef)
    // callback above at line 648. JavaScript 'let' is in the TDZ until its declaration line runs,
    // so if the callback fired before that point it threw: "Cannot access before initialization".
    let currentRoomData = null;
    let currentRtdbData = null;
    let currentPresences = {};

    // Set presence status on connect/disconnect
    const unsubConnected = onValue(connectedRef, async (snap) => {
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

        setCurrentAuction({ 
          id: auctionId, 
          ...currentRoomData,
          players: playersWithPresence,
          currentAuction: currentRtdbData || currentRoomData.currentAuction
        });
      }
    };

    // Presence listener (all users' presence)
    const presenceRef = ref(rtdb, `auctions/${auctionId}/presence`);
    const unsubPresence = onValue(presenceRef, (snap) => {
      currentPresences = snap.val() || {};
      checkAndSet();
    });

    let didFallbackFetch = false;
    let didTeamsFallback = false;

    const unsubAuction = onValue(ref(rtdb, `auctions/${auctionId}/room`), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // PROACTIVE BAN CHECK: Kick user if they are banned
        if (data.bannedPlayers && data.bannedPlayers.includes(userId)) {
           window.location.href = '/?error=kicked';
           return;
        }

        auctionLoaded = true;
        if (!data.playerOrder) {
          get(ref(rtdb, `auctions/${auctionId}/playerOrder`)).then(oSnap => {
            if (oSnap.exists()) data.playerOrder = oSnap.val();
            currentRoomData = data;
            checkAndSet();
          }).catch(() => {});
        }
        currentRoomData = data;
        checkAndSet();
        checkLoaded();
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
                  overseasLimit: sData.overseas_limit || 8,
                  players: sData.players || [],
                  bannedPlayers: sData.banned_players || [],
                  settings: sData.settings || { bidTimer: 10, budget: 120 }
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
              await updateRtdb(ref(rtdb, `auctions/${auctionId}/room`), data);
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

    const unsubLive = onValue(ref(rtdb, `auctions/${auctionId}/live`), (snapshot) => {
      currentRtdbData = snapshot.val();
      checkAndSet();
    }, (error) => {
      handleFirebaseError(error);
    });


    const unsubTeams = onValue(ref(rtdb, `auctions/${auctionId}/teams`), async (snapshot) => {
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
              await updateRtdb(ref(rtdb, `auctions/${auctionId}/teams`), teamsToSync);
            }
          } catch(e) { handleFirebaseError(e); }
        }, 500);
      }
    }, (error) => {
      setLoading(false);
      handleFirebaseError(error);
    });

    const msgQuery = queryRtdb(ref(rtdb, `auctions/${auctionId}/messages`), limitToLast(10));
    const unsubMessages = onValue(msgQuery, (snapshot) => {
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
      try { goOffline(rtdb); } catch (e) {}
    };
  }, [user]);

  const sendMessage = useCallback(async (roomId, text, type = 'text') => {
    if (!user?.uid) throw new Error('Sign in before sending a message.');
    if (type !== 'text') throw new Error('Only regular chat messages can be sent through chat.');
    const sendChat = httpsCallable(getFunctions(app), 'sendAuctionChatMessage');
    await sendChat({ roomId, text });
  }, [user]);

  const placeBid = useCallback(async () => {
    if (!currentAuction) throw new Error("Auction not found!");
    if (!user?.uid) throw new Error("Please log in to bid!");
    if (!team) throw new Error("You must select a team in the lobby to participate!");
    const call = httpsCallable(getFunctions(app), 'placeBid');
    await call({ roomId: currentAuction.id });
  }, [currentAuction, user, team]);

  const decideRetention = useCallback(async (roomId, decision, botAction = false) => {
    if (!user?.uid || !['accept', 'decline', 'match', 'decline_counter'].includes(decision)) {
      throw new Error('Invalid RTM decision.');
    }
    const call = httpsCallable(getFunctions(app), 'decideRetention');
    await call({ roomId, decision, botAction });
  }, [user]);

  const submitRetentionCounterBid = useCallback(async (roomId, amount, botTeamId = null) => {
    if (!user?.uid || !Number.isFinite(Number(amount))) throw new Error('Enter a valid counter-bid amount.');
    const call = httpsCallable(getFunctions(app), 'submitRetentionCounterBid');
    await call({
      roomId,
      amount: Number(Number(amount).toFixed(2)),
      ...(botTeamId ? { botAction: true, botTeamId } : {})
    });
  }, [user]);

  const updatePlayerTeam = useCallback(async (roomId, userId, newTeamId) => {
    if (!user?.uid) throw new Error('Sign in before choosing a franchise.');
    const call = httpsCallable(getFunctions(app), 'updatePlayerTeam');
    await call({ roomId, userId, teamId: newTeamId });
  }, [user]);

  const updateRoomSettings = useCallback(async (roomId, settings) => {
    if (!user?.uid) throw new Error('Sign in before updating auction settings.');
    const call = httpsCallable(getFunctions(app), 'updateAuctionControls');
    await call({ roomId, action: 'update_settings', settings });
  }, [user]);

  const pauseAuction = useCallback(async (roomId) => {
    if (!user?.uid) throw new Error('Sign in before pausing the auction.');
    const call = httpsCallable(getFunctions(app), 'updateAuctionControls');
    await call({ roomId, action: 'pause' });
    await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'auction_paused' });
  }, [user]);

  const resumeAuction = useCallback(async (roomId) => {
    if (!user?.uid) throw new Error('Sign in before resuming the auction.');
    const call = httpsCallable(getFunctions(app), 'updateAuctionControls');
    await call({ roomId, action: 'resume' });
    await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'auction_resumed' });
  }, [user]);

  // End the bidding phase and open the shared two-minute Playing XI window.
  const endAuction = useCallback(async (roomId) => {
    if (!user?.uid) throw new Error('Sign in before ending the auction.');
    const call = httpsCallable(getFunctions(app), 'endAuction');
    const result = await call({ roomId });
    const disqualifiedNames = result.data?.disqualifiedNames || [];
    const roomData = currentAuction || {};
    const minimumSquadRuleApplies = (roomData.auctionType || 'mega') === 'mega';
    const ruleMessage = minimumSquadRuleApplies
      ? ` Minimum squad size is 18; franchises below 18 are disqualified. ${disqualifiedNames.length ? `Disqualified: ${disqualifiedNames.join(', ')}.` : 'All franchises met the minimum squad size.'}`
      : '';
    if (!result.data?.alreadyEnded) {
      await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'auction_ended' });
    }
  }, [user, currentAuction]);

  const submitPlayingXI = useCallback(async (roomId, startingXI, impactPlayer) => {
    if (!user?.uid) throw new Error('Sign in to submit your Playing XI');
    const call = httpsCallable(getFunctions(app), 'submitPlayingXI');
    await call({ roomId, startingXI, impactPlayer });
    await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'xi_submitted' });
  }, [user]);

  // One client claims the analysis phase transactionally after the deadline.
  // All other clients observe the same persisted result through the room listener.
  const finalizeWinnerAnalysis = useCallback(async (roomId) => {
    const roomRef = ref(rtdb, `auctions/${roomId}/room`);
    const roomSnap = await get(roomRef);
    if (!roomSnap.exists()) return;
    const roomData = roomSnap.val();
    if (roomData.status !== 'awaiting_xi') return;

    // Let analysis begin as soon as every participating franchise has submitted,
    // while retaining the two-minute deadline as the fallback for late/missing teams.
    const readinessSnap = await get(ref(rtdb, `auctions/${roomId}/teams`));
    const readinessTeams = Object.values(readinessSnap.val() || {})
      .filter((t) => t?.teamId && t.teamId !== 'NONE' && !t.disqualified);
    const allSubmitted = readinessTeams.length >= 2 && readinessTeams.every((t) =>
      t.playingXI?.startingXI?.length === 11 && Boolean(t.playingXI?.impactPlayer)
    );
    const deadlinePassed = getSyncedTime() >= Number(roomData.xiSubmissionDeadline || 0);
    if (!deadlinePassed && !allSubmitted) return;

    const claimCall = httpsCallable(getFunctions(app), 'claimWinnerAnalysis');
    try {
      await claimCall({ roomId });
    } catch (error) {
      // Another client may have claimed analysis, or the submission window may still be open.
      return;
    }

    try {
      const teamsSnap = await get(ref(rtdb, `auctions/${roomId}/teams`));
      const teamsData = teamsSnap.val() || {};
      const allFranchises = Object.values(teamsData).filter((t) => t?.teamId && t.teamId !== 'NONE');
      const franchises = allFranchises.filter((t) => !t.disqualified);
      const disqualifiedFranchises = allFranchises.filter((t) => t.disqualified);
      const payload = franchises.map((t) => {
        const squad = Array.isArray(t.squad) ? t.squad : [];
        const savedXI = t.playingXI;
        const selection = savedXI?.startingXI?.length === 11 && savedXI?.impactPlayer
          ? savedXI
          : autoSelectBestXI(squad, IPL_PLAYERS);
        const toFullPlayer = (item) => {
          const id = typeof item === 'string' ? item : item?.id;
          const catalog = IPL_PLAYERS.find((p) => p.id === id) || {};
          return { ...catalog, ...(typeof item === 'object' && item ? item : {}), id };
        };
        const fullSquad = squad.map(toFullPlayer);
        return {
          franchiseId: t.teamId,
          franchiseName: t.teamName || t.teamId,
          submittedXI: [
            ...(selection.startingXI || []).map(toFullPlayer),
            { ...toFullPlayer(selection.impactPlayer), isImpactPlayer: true }
          ],
          fullSquad,
          autoSelected: !savedXI?.startingXI?.length || Boolean(savedXI.autoSelected)
        };
      });
      let eligibleRankings = [];
      let analysisModel = 'Eligibility Rules';
      if (payload.length >= 2) {
        const response = await fetch('/api/analyze-winner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, franchises: payload })
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
          summary: 'This is the only franchise that met the 18-player minimum and is therefore the sole eligible franchise.',
          strengths: [],
          risks: []
        }];
      }

      const disqualifiedRankings = disqualifiedFranchises.map((franchise, index) => {
        const squadCount = Array.isArray(franchise.squad) ? franchise.squad.length : 0;
        const reason = franchise.disqualificationReason || `Only ${squadCount} players bought; at least 18 are required.`;
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
      const completeCall = httpsCallable(getFunctions(app), 'completeWinnerAnalysis');
      await completeCall({ roomId, rankings, model: analysisModel });
      // The trusted backend persists results and removes the room from the public lobby.
      await httpsCallable(getFunctions(app), 'postAuctionSystemEvent')({ roomId, event: 'auction_completed' });
      await flushAuctionToFirestore(roomId);
    } catch (error) {
      try {
        const failCall = httpsCallable(getFunctions(app), 'failWinnerAnalysis');
        await failCall({ roomId, errorMessage: String(error?.message || 'AI analysis failed') });
      } catch (stateError) {
        console.error('Could not record analysis failure securely:', stateError);
      }
      throw error;
    }
  }, [getSyncedTime, flushAuctionToFirestore]);

  // Allow a manager to retry a failed AI analysis after fixing the server API configuration.
  // A transaction ensures only one connected client can reclaim the analysis phase.
  const retryWinnerAnalysis = useCallback(async (roomId) => {
    if (!user?.uid) throw new Error('Sign in before retrying winner analysis.');
    const call = httpsCallable(getFunctions(app), 'retryWinnerAnalysis');
    await call({ roomId });
    await finalizeWinnerAnalysis(roomId);
  }, [user, finalizeWinnerAnalysis]);



  // ─── Bot Management & Bidding Engine ───

  const placeBotBid = useCallback(async (roomId, botUserId, botTeamId, botName, timerSeconds = 10, maxValuation = Infinity, botBudget = Infinity) => {
    if (!roomId || !user?.uid) return;
    const call = httpsCallable(getFunctions(app), 'placeBid');
    await call({
      roomId,
      botAction: true,
      botUserId,
      botTeamId,
      botName,
      timerSeconds,
      maxValuation: Number.isFinite(maxValuation) ? maxValuation : 0,
      botBudget: Number.isFinite(botBudget) ? botBudget : 0
    });
  }, [user]);

  const addBotTeam = useCallback(async (roomId, teamId) => {
    if (!user?.uid) throw new Error('Sign in before adding a bot.');
    const call = httpsCallable(getFunctions(app), 'manageAuctionBots');
    await call({ roomId, action: 'add', teamId });
  }, [user]);

  const removeBotTeam = useCallback(async (roomId, botUserId) => {
    if (!user?.uid) throw new Error('Sign in before removing a bot.');
    const call = httpsCallable(getFunctions(app), 'manageAuctionBots');
    await call({ roomId, action: 'remove', botUserId });
  }, [user]);

  const fillEmptyTeamsWithBots = useCallback(async (roomId) => {
    if (!user?.uid) throw new Error('Sign in before filling empty teams with bots.');
    const call = httpsCallable(getFunctions(app), 'manageAuctionBots');
    await call({ roomId, action: 'fill_empty' });
  }, [user]);

  // Guard ref: track the last timer cycle (timerEndsAt) that a bot bid was queued for.
  // Prevents multiple bot bids from being scheduled when currentAuction re-renders
  // multiple times during the same countdown cycle.
  const lastBotBidCycleRef = React.useRef(null);

  // One host client coordinates bot RTM decisions, just like bot bidding.
  // Bots only exercise retention cards for Marquee Set 1 players.
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
      const overseasLimit = Number(roomData.overseasLimit || 8);
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
      const isMarquee = player.set === 'Marquee Set 1';
      const cardsRemaining = Number.isFinite(Number(botTeam.retentionCardsRemaining))
        ? Number(botTeam.retentionCardsRemaining)
        : 2;

      try {
        if (phase === 'initial_decision' && offer.eligibleUserId === botId) {
          const shouldUseRtm = isMarquee && cardsRemaining > 0 && canAddPlayer
            && budget >= Number(offer.bid || 0);
          await decideRetention(roomId, shouldUseRtm ? 'accept' : 'decline', true);
        } else if (phase === 'counter_bid' && offer.buyerId === botId) {
          // Counter-prices are between ₹5 Cr and ₹20 Cr and must exceed the
          // original bid. If the bid is already ₹20 Cr or the bot cannot afford
          // the player / fit the squad, it lets the RTM timer expire.
          const minCounter = Math.max(5, Math.ceil((Number(offer.bid || 0) + 0.25) * 4) / 4);
          const maxCounter = Math.min(20, budget);
          if (canAddPlayer && maxCounter >= minCounter) {
            const steps = Math.floor((maxCounter - minCounter) * 4 + 0.0001);
            const counterBid = Number((minCounter + Math.floor(Math.random() * (steps + 1)) / 4).toFixed(2));
            await submitRetentionCounterBid(roomId, counterBid, botId);
          }
        } else if (phase === 'match_decision' && offer.eligibleUserId === botId
          && offer.counterBid != null) {
          const counterBid = Number(offer.counterBid);
          const slotsAfter = Math.max(0, slotsLeft - 1);
          const leavesEnoughPurse = slotsLeft <= 1 || (budget - counterBid) / slotsAfter >= 0.30;
          const shouldMatch = isMarquee && cardsRemaining > 0 && canAddPlayer
            && budget >= counterBid && leavesEnoughPurse;
          await decideRetention(roomId, shouldMatch ? 'match' : 'decline_counter', true);
        }
      } catch (error) {
        console.warn('[Bot RTM] Automated decision failed:', error);
        lastBotRtmActionRef.current = null;
      }
    }, 350 + Math.random() * 650);
  }, [currentAuction, user, roomTeams, getSyncedTime, decideRetention, submitRetentionCounterBid]);

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
    const timerSec = currentAuction.settings?.bidTimer || 10;
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
          overseasLimit: currentAuction.overseasLimit || 8,
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