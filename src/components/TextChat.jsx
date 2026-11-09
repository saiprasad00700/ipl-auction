import React, { useState, useEffect, useRef } from 'react';
import { useAuction } from '../contexts/AuctionContext';
import { useAuth } from '../contexts/AuthContext';
import { TEAMS } from '../data/teams';
import { Send, MessageSquare, ChevronUp, ChevronDown, Image as ImageIcon, Smile, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabaseSticker } from '../lib/supabase';
import { ref as databaseRef, set as setDatabaseValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

const STICKER_PACKS = {
   WhatsApp: [
      { emoji: '😂', label: 'ROFL' }, { emoji: '😭', label: 'Crying' },
      { emoji: '❤️', label: 'Love' }, { emoji: '😍', label: 'Lovely' },
      { emoji: '😎', label: 'Cool' }, { emoji: '🔥', label: 'Fire' },
      { emoji: '👍', label: 'Good one' }, { emoji: '🙏', label: 'Please' },
      { emoji: '👏', label: 'Clap' }, { emoji: '🤯', label: 'Mind blown' },
      { emoji: '🥳', label: 'Celebration' }, { emoji: '🤝', label: 'Deal' },
      { emoji: '💯', label: 'Perfect' }, { emoji: '😴', label: 'Sleepy' },
      { emoji: '🤡', label: 'Clown' }, { emoji: '😤', label: 'Angry' }
   ],
   Cricket: [
      { emoji: '🏏', label: 'Cricket' }, { emoji: '🏆', label: 'Champion' },
      { emoji: '🔥', label: 'What a shot' }, { emoji: '💥', label: 'Six!' },
      { emoji: '🎯', label: 'Perfect yorker' }, { emoji: '🙌', label: 'What a catch' },
      { emoji: '🦁', label: 'King' }, { emoji: '👑', label: 'GOAT' },
      { emoji: '💸', label: 'Big money' }, { emoji: '😱', label: 'Unbelievable' },
      { emoji: '🫡', label: 'Respect' }, { emoji: '🚀', label: 'To the moon' },
      { emoji: '🥶', label: 'Ice cold' }, { emoji: '🤌', label: 'Masterclass' },
      { emoji: '📢', label: 'Howzat!' }, { emoji: '🧤', label: 'Safe hands' }
   ]
};

const TextChat = ({ roomId, isCollapsed, onToggleCollapse }) => {
   const { messages, sendMessage, currentAuction } = useAuction();
   const { user } = useAuth();
   const [text, setText] = useState('');
   const [showGifPicker, setShowGifPicker] = useState(false);
   const [showStickerPicker, setShowStickerPicker] = useState(false);
   const [activeStickerPack, setActiveStickerPack] = useState('WhatsApp');
   const [gifSearchQuery, setGifSearchQuery] = useState('');
   const [searchedGifs, setSearchedGifs] = useState([]);
   const [isSearchingGifs, setIsSearchingGifs] = useState(false);
   const [myStickers, setMyStickers] = useState([]);
   const [isUploadingSticker, setIsUploadingSticker] = useState(false);
   const [stickerError, setStickerError] = useState('');
   const stickerFileInputRef = useRef(null);
   const scrollContainerRef = useRef(null);
   const roomPlayer = currentAuction?.players?.find((player) => player.id === user?.uid);
   const isBotUser = Boolean(user?.uid && (/^(bot[_-]|auctionbot[_-])/i.test(user.uid) || roomPlayer?.isBot));
   const canSendChat = Boolean(user && !isBotUser);

   // Mark other members' chat messages as seen when they are displayed in the open chat.
   // Each user writes only their own receipt under that message.
   const markedSeenMessageIdsRef = useRef(new Set());
   useEffect(() => {
      if (!user?.uid || !roomId || isBotUser) return;
      const seenBy = {
         userId: user.uid,
         teamId: roomPlayer?.team || null,
         teamName: roomPlayer?.teamName || null,
         isSpectator: !roomPlayer?.team,
         seenAt: Date.now()
      };
      chatMessages.forEach((message) => {
         if (!message.id || message.userId === user.uid || markedSeenMessageIdsRef.current.has(message.id)) return;
         markedSeenMessageIdsRef.current.add(message.id);
         setDatabaseValue(
            databaseRef(rtdb, `auctions/${roomId}/messages/${message.id}/seenBy/${user.uid}`),
            seenBy
         ).catch((error) => {
            markedSeenMessageIdsRef.current.delete(message.id);
            console.warn('[TextChat] Read receipt could not be saved:', error?.message || error);
         });
      });
   }, [chatMessages, roomId, user?.uid, isBotUser, roomPlayer?.team, roomPlayer?.teamName]);

   // Sticker messages are stored as ordinary chat records in Firebase RTDB.
   // Existing message rules already allow the "sticker" type; no schema migration is needed.
   const chatMessages = messages.filter(m =>
      m.type === 'text' || m.type === 'gif' || m.type === 'sticker' || !m.type
   );

   useEffect(() => {
      let cancelled = false;
      const loadMyStickers = async () => {
         if (!user?.uid) { setMyStickers([]); return; }
         try {
            const { data: result, error } = await supabaseSticker.storage.from('user-stickers').list(user.uid, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
            if (error) throw error;
            const stickers = await Promise.all((result || []).map(async item => {
               const path = `${user.uid}/${item.name}`;
               const { data, error: urlError } = await supabaseSticker.storage.from('user-stickers').createSignedUrl(path, 60 * 60 * 24 * 365);
               if (urlError) throw urlError;
               return { id: path, name: item.name, url: data.signedUrl };
            }));
            if (!cancelled) setMyStickers(stickers);
         } catch (error) {
            console.warn('[TextChat] Personal stickers could not be loaded:', error.message);
            if (!cancelled) setStickerError('Personal stickers are not configured yet.');
         }
      };
      loadMyStickers();
      return () => { cancelled = true; };
   }, [user?.uid]);

   useEffect(() => {
      if (scrollContainerRef.current) {
         scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
   }, [chatMessages.length]);

   const handleSend = async (e) => {
      e.preventDefault();
      if (!text.trim() || !roomId || !canSendChat) return;
      try {
         await sendMessage(roomId, text.trim(), 'text');
         setText('');
      } catch (err) {
         console.error('[TextChat] Message could not be sent:', err);
      }
   };

   const handleSendSticker = async (sticker) => {
      if (!roomId || !canSendChat) return;
      try {
         await sendMessage(roomId, sticker.url || sticker.emoji, 'sticker');
         setShowStickerPicker(false);
      } catch (err) {
         console.error('[TextChat] Sticker could not be sent:', err);
      }
   };

   const handleStickerUpload = async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !user?.uid) return;
      if (!file.type.startsWith('image/')) { setStickerError('Please choose an image file.'); return; }
      if (file.size > 2 * 1024 * 1024) { setStickerError('Sticker images must be 2 MB or smaller.'); return; }
      setIsUploadingSticker(true);
      setStickerError('');
      try {
         const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'sticker.png';
         const path = `${user.uid}/${Date.now()}-${safeName}`;
         const { error: uploadError } = await supabaseSticker.storage.from('user-stickers').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
         if (uploadError) throw uploadError;
         const { data, error: urlError } = await supabaseSticker.storage.from('user-stickers').createSignedUrl(path, 60 * 60 * 24 * 365);
         if (urlError) throw urlError;
         setMyStickers(current => [{ id: path, name: path.split('/').pop(), url: data.signedUrl }, ...current]);
         setActiveStickerPack('My Stickers');
      } catch (error) {
         console.error('[TextChat] Sticker upload failed:', error);
         setStickerError('Upload failed. Please check sticker storage setup and try again.');
      } finally {
         setIsUploadingSticker(false);
      }
   };

   const fetchGifs = async (query = '') => {
      if (!GIPHY_API_KEY) {
         setSearchedGifs([]);
         return;
      }
      setIsSearchingGifs(true);
      try {
         const url = query.trim()
            ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query.trim())}&limit=16&rating=g`
            : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=16&rating=g`;
         const res = await fetch(url);
         if (!res.ok) throw new Error(`GIPHY request failed (${res.status})`);
         const json = await res.json();
         const list = (json?.data || []).map(item => ({
            id: item.id,
            name: item.title || 'GIF',
            url: item.images?.fixed_height?.url || item.images?.original?.url
         })).filter(item => item.url);
         setSearchedGifs(list);
      } catch (err) {
         console.warn('[TextChat] GIF search unavailable:', err.message);
         setSearchedGifs([]);
      } finally {
         setIsSearchingGifs(false);
      }
   };

   const handleSearchGifs = async (e) => {
      e.preventDefault();
      await fetchGifs(gifSearchQuery);
   };

   useEffect(() => {
      if (showGifPicker) fetchGifs('');
   }, [showGifPicker]);

   const closePickers = () => {
      setShowGifPicker(false);
      setShowStickerPicker(false);
   };

   return (
      <div className="relative flex flex-col h-full bg-transparent w-full">
         {onToggleCollapse && (
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
               <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title={isCollapsed ? 'Expand Chat' : 'Collapse Chat'}
               >
                  {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
               </button>
            </div>
         )}

         {!isCollapsed && (
            <>
               <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar flex flex-col min-h-0">
                  {chatMessages.length === 0 ? (
                     <div className="flex-1 flex flex-col items-center justify-center opacity-30 p-8 text-center my-auto">
                        <MessageSquare size={24} className="text-gray-500 mb-2 animate-pulse" />
                        <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">No banter yet</p>
                        <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-1">Send a message or sticker</p>
                     </div>
                  ) : (
                     chatMessages.map((msg, index) => {
                        const isMe = msg.userId === user?.uid;
                        const userTeamId = TEAMS.find(t => t.id === msg.teamId || t.name === msg.teamId)?.logo;
                        const isGif = msg.type === 'gif' || (msg.text?.startsWith('http') && msg.text?.includes('.gif'));
                        return (
                           <motion.div
                              key={msg.id || index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${isMe ? 'ml-auto' : 'mr-auto'}`}
                           >
                              {!isMe && (
                                 <div className="flex items-center gap-1.5 mb-1 px-1">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">{msg.userName}</span>
                                    {(msg.isSpectator ?? Boolean(currentAuction?.players?.find((player) => player.id === msg.userId && !player.team))) && (
                                       <span className="rounded bg-blue-500/10 border border-blue-400/20 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-blue-300">Spectator</span>
                                    )}
                                    {msg.teamId && (
                                       <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[7px] font-black text-gray-400 uppercase tracking-widest">{msg.teamId}</span>
                                    )}
                                 </div>
                              )}

                              {msg.type === 'sticker' ? (
                                 <div className="px-2 py-1" title="Sticker">
                                    {String(msg.text || '').startsWith('http') ? <img src={msg.text} alt="Chat sticker" className="max-w-[150px] max-h-[150px] object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,0.35)]" loading="lazy" /> : <span role="img" aria-label="Chat sticker" className="block text-[58px] sm:text-[66px] leading-none drop-shadow-[0_5px_12px_rgba(0,0,0,0.35)]">{msg.text}</span>}
                                 </div>
                              ) : (
                                 <div className={`rounded-2xl text-[11px] leading-relaxed break-words shadow-lg overflow-hidden ${
                                    isGif
                                       ? 'border border-white/10 max-w-[200px]'
                                       : isMe
                                          ? 'px-4 py-3 bg-white/10 border border-white/10 text-white rounded-tr-none'
                                          : 'px-4 py-3 bg-white/5 border border-white/10 text-gray-300 rounded-tl-none'
                                 }`}>
                                    {isGif ? <img src={msg.text} alt="GIF" className="w-full h-auto object-cover block" /> : msg.text}
                                 </div>
                              )}
                              {msg.userId !== user?.uid && Object.keys(msg.seenBy || {}).length > 0 && (
                                 <div className={`mt-1 flex items-center gap-1.5 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-500">Seen by</span>
                                    <div className="flex items-center gap-1">
                                       {Object.values(msg.seenBy || {}).map((viewer, viewerIndex) => {
                                          const viewerTeam = TEAMS.find((teamItem) => teamItem.id === viewer?.teamId);
                                          return viewerTeam?.logo ? (
                                             <img
                                                key={viewer?.userId || viewerIndex}
                                                src={viewerTeam.logo}
                                                alt={viewerTeam.name}
                                                title={viewerTeam.name}
                                                className="h-4 w-4 rounded-full object-contain bg-white/5"
                                             />
                                          ) : (
                                             <span key={viewer?.userId || viewerIndex} title="Spectator" className="rounded bg-blue-500/10 px-1 py-0.5 text-[7px] font-bold text-blue-300">S</span>
                                          );
                                       })}
                                    </div>
                                 </div>
                              )}
                           </motion.div>
                        );
                     })
                  )}
               </div>

               {!canSendChat ? (
                  <div className="p-3 border-t border-white/5 text-center text-[9px] font-bold uppercase tracking-widest text-gray-500">Bots cannot send chat messages</div>
               ) : (
               <form onSubmit={handleSend} className="p-3 border-t border-white/5 bg-white/[0.01] flex gap-2 relative">
                  <button
                     type="button"
                     onClick={() => { setShowStickerPicker(!showStickerPicker); setShowGifPicker(false); }}
                     className={`w-10 h-10 border rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${showStickerPicker ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                     title="Send stickers"
                     aria-label="Open sticker picker"
                  >
                     <Smile size={17} />
                  </button>
                  <button
                     type="button"
                     onClick={() => { setShowGifPicker(!showGifPicker); setShowStickerPicker(false); }}
                     className={`w-10 h-10 border rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${showGifPicker ? 'bg-white/10 border-white/20 text-white shadow-inner' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                     title="Send a GIF"
                     aria-label="Open GIF picker"
                  >
                     <ImageIcon size={14} />
                  </button>
                  <input
                     type="text"
                     value={text}
                     onChange={(e) => setText(e.target.value)}
                     placeholder="Type a message..."
                     className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[11px] text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-gray-700"
                     maxLength={150}
                  />
                  <button
                     type="submit"
                     disabled={!text.trim()}
                     className="w-10 h-10 bg-white disabled:opacity-40 hover:bg-white/90 text-black rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:scale-100 cursor-pointer shrink-0"
                     aria-label="Send message"
                  >
                     <Send size={14} fill="currentColor" />
                  </button>
               </form>
               )}

               {showStickerPicker && canSendChat && (
                  <div className="absolute bottom-[72px] left-3 right-3 bg-[#101114]/[.98] border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-xl z-[60] flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <div>
                           <p className="text-[9px] font-black text-white uppercase tracking-widest">Sticker gallery</p>
                           <p className="text-[8px] text-gray-500 mt-1">Tap a sticker to send it to everyone</p>
                        </div>
                        <button type="button" onClick={closePickers} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close sticker picker">
                           <X size={15} />
                        </button>
                     </div>
                     <div className="grid grid-cols-3 gap-2">
                        {[...Object.keys(STICKER_PACKS), 'My Stickers'].map(pack => (
                           <button
                              key={pack}
                              type="button"
                              onClick={() => setActiveStickerPack(pack)}
                              className={`rounded-xl py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${activeStickerPack === pack ? 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/30' : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'}`}
                           >
                              {pack === 'WhatsApp' ? '💬 WhatsApp' : pack === 'Cricket' ? '🏏 Cricket' : `⭐ My Stickers (${myStickers.length})`}
                           </button>
                        ))}
                     </div>
                     <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => stickerFileInputRef.current?.click()} disabled={isUploadingSticker} className="px-3 py-2 rounded-lg bg-emerald-400/15 border border-emerald-300/25 text-emerald-200 text-[9px] font-black uppercase tracking-wider disabled:opacity-50">{isUploadingSticker ? 'Uploading...' : '+ Add your sticker'}</button>
                        <input ref={stickerFileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleStickerUpload} />
                        <span className="text-[8px] text-gray-500">PNG, JPG, WEBP or GIF · max 2 MB</span>
                     </div>
                     {stickerError && <p role="alert" className="text-[9px] text-amber-300">{stickerError}</p>}
                     <div className="grid grid-cols-4 gap-2 max-h-[210px] overflow-y-auto custom-scrollbar">
                        {(activeStickerPack === 'My Stickers' ? myStickers : STICKER_PACKS[activeStickerPack]).map((sticker, index) => (
                           <button
                              key={`${activeStickerPack}-${sticker.label}-${index}`}
                              type="button"
                              onClick={() => handleSendSticker(sticker)}
                              className="min-h-[76px] rounded-xl border border-white/5 bg-white/[0.035] hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 p-2"
                              title={sticker.label}
                           >
                              {sticker.url ? <img src={sticker.url} alt="My sticker" className="w-12 h-12 object-contain" /> : <span className="text-[34px] leading-none" role="img" aria-label={sticker.label}>{sticker.emoji}</span>}
                              <span className="text-[7px] text-gray-500 font-bold uppercase tracking-wide text-center">{sticker.label || 'My sticker'}</span>
                           </button>
                        ))}
                     </div>
                  </div>
               )}

               {showGifPicker && canSendChat && (
                  <div className="absolute bottom-16 right-3 left-3 bg-[#0d0d0e]/98 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl z-[60] flex flex-col gap-3">
                     <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Global GIF Search</span>
                        <button type="button" onClick={closePickers} className="text-[8px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer">Close</button>
                     </div>
                     <form onSubmit={handleSearchGifs} className="flex gap-2">
                        <input
                           type="text"
                           value={gifSearchQuery}
                           onChange={(e) => setGifSearchQuery(e.target.value)}
                           placeholder="Search any GIF (e.g. Dhoni, Kohli...)"
                           className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-gray-700"
                        />
                        <button type="submit" className="px-3 bg-white hover:bg-white/90 text-black font-black text-[9px] uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer shrink-0">Search</button>
                     </form>
                     <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[160px] custom-scrollbar min-h-[80px]">
                        {isSearchingGifs ? (
                           <div className="col-span-4 flex items-center justify-center py-8 opacity-50">
                              <span className="text-[9px] font-black text-white uppercase tracking-widest animate-pulse">Searching GIPHY...</span>
                           </div>
                        ) : searchedGifs.length === 0 ? (
                           <div className="col-span-4 flex items-center justify-center py-8 opacity-50">
                              <span className="text-[9px] font-black text-white uppercase tracking-widest text-center">{GIPHY_API_KEY ? 'No GIFs found' : 'GIF search is not configured. Stickers work without it.'}</span>
                           </div>
                        ) : (
                           searchedGifs.map(gif => (
                              <button
                                 key={gif.id}
                                 type="button"
                                 onClick={async () => {
                                    try {
                                       await sendMessage(roomId, gif.url, 'gif');
                                       setShowGifPicker(false);
                                       setGifSearchQuery('');
                                    } catch (err) {
                                       console.error('[TextChat] GIF could not be sent:', err);
                                    }
                                 }}
                                 className="relative rounded-lg overflow-hidden border border-white/5 hover:border-white/30 aspect-video group cursor-pointer transition-all active:scale-95 bg-white/5"
                              >
                                 <img src={gif.url} alt={gif.name} className="w-full h-full object-cover" />
                                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <span className="text-[7px] font-black text-white uppercase tracking-tight truncate max-w-[90%] px-1">{gif.name}</span>
                                 </div>
                              </button>
                           ))
                        )}
                     </div>
                  </div>
               )}
            </>
         )}
      </div>
   );
};

export default TextChat;
