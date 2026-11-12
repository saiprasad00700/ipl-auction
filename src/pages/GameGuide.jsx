// Updated SSAUCTION Rulebook
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, ChevronRight, ChevronDown } from 'lucide-react';
import Footer from '../components/Footer';
import useDocumentTitle from '../hooks/useDocumentTitle';

const GameGuide = () => {
  useDocumentTitle('Rulebook', 'Official game rules and auction guide for SSAUCTION.');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [activeSection, setActiveSection] = useState('mega-mode');
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (idx) => setOpenFaq(openFaq === idx ? null : idx);

  const sections = [
    { id: 'mega-mode', label: '1. MEGA mode' },
    { id: 'auction', label: '2. Auction & bidding' },
    { id: 'squad', label: '3. Squad rules' },
    { id: 'rtm', label: '4. Retention (RTM) cards' },
    { id: 'playing-xi', label: '5. Playing XI submission' },
    { id: 'rankings', label: '6. AI rankings' },
    { id: 'faq', label: '7. FAQ' },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setActiveSection(entry.target.id); });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 10) {
        setActiveSection(sections[sections.length - 1].id);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => { observer.disconnect(); window.removeEventListener('scroll', handleScroll); };
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth' }); setActiveSection(id); }
  };

  const faqs = [
    { q: 'Do all game modes require Playing XI submission?', a: 'No. Playing XI submission and AI franchise rankings apply only to MEGA mode.' },
    { q: 'What if a franchise buys fewer than 18 players in MEGA mode?', a: 'That franchise is disqualified. If every participating franchise has fewer than 18 players, the site skips the five-minute submission wait and goes directly to the rankings page, showing each franchise its purchased player count and disqualification reason.' },
    { q: 'How long do franchises get to submit their Playing XI?', a: 'In MEGA mode, franchises have five minutes after the host ends the auction to submit their Playing XI.' },
    { q: 'What happens if a franchise does not submit an XI in time?', a: 'The system automatically selects the best eligible Playing XI from that franchise’s squad.' },
    { q: 'How many overseas players are allowed?', a: 'A MEGA mode franchise can have a maximum of four overseas players in its squad.' },
    { q: 'How many RTM cards does each franchise get?', a: 'Each franchise gets two RTM cards. An RTM can be used only when the player is eligible for that franchise based on the player’s original IPL franchise.' },
    { q: 'Are the rankings based only on AI knowledge?', a: 'No. The analysis uses the stored player statistics dataset. It primarily considers the last three years of IPL performance and uses international performance when a player has insufficient IPL data.' },
  ];

  const nav = (
    <nav className="flex flex-col gap-2.5 border-l border-white/10">
      {sections.map((s) => (
        <button key={s.id} onClick={() => scrollTo(s.id)}
          className={`text-sm text-left pl-4 -ml-[1px] border-l ${activeSection === s.id ? 'border-emerald-300 text-white' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-white/30'} transition-colors`}>
          {s.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#0E0F10] text-[#E5E5E5] font-sans selection:bg-white/20 selection:text-white flex flex-col">
      <header className="sticky top-0 z-50 bg-[#0E0F10]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"><Home size={14} /><span>Home</span></Link>
          <ChevronRight size={14} className="text-gray-600" /><span className="text-gray-500">Guide</span>
          <ChevronRight size={14} className="text-gray-600" /><span className="text-white">Rulebook</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col lg:flex-row gap-8 lg:gap-24 items-start w-full flex-1">
        <aside className="hidden lg:block w-64 shrink-0 sticky top-28">
          <h3 className="text-white font-semibold text-sm mb-4">On this page</h3>{nav}
        </aside>

        <main className="flex-1 max-w-3xl w-full pb-20">
          <div className="mb-8 sm:mb-12 border-b border-white/10 pb-6 sm:pb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">SSAUCTION Rulebook</h1>
            <p className="text-sm text-gray-500 mb-6">Last updated: November 13, 2026</p>
            <p className="text-base text-[#E5E5E5] leading-relaxed">Read the rules before starting an auction. This guide explains MEGA mode, bidding, squad requirements, RTM cards, Playing XI submission and AI rankings.</p>
          </div>

          <details className="lg:hidden mb-8 border border-white/10 rounded-md p-4 bg-white/[0.01]">
            <summary className="cursor-pointer text-sm font-medium text-white">On this page</summary>
            <div className="mt-3">{nav}</div>
          </details>

          <div className="space-y-10 sm:space-y-16">
            <section id="mega-mode" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">1. MEGA mode</h2>
              <div className="border border-white/10 rounded-md p-5 bg-white/[0.01] space-y-3 text-sm text-gray-300 leading-relaxed">
                <p>MEGA mode is the full squad-building auction. Each franchise starts with a virtual purse of <strong className="text-white">₹120 crore</strong>.</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Each franchise must buy at least <strong className="text-white">18 players</strong> to qualify for the final rankings.</li>
                  <li>A franchise can buy a maximum of <strong className="text-white">4 overseas players</strong>.</li>
                  <li>Each franchise receives <strong className="text-white">2 RTM cards</strong>.</li>
                  <li>Playing XI submission and the final AI ranking process are applicable only in MEGA mode.</li>
                </ul>
                <p>All purse values and bids are virtual game values. No real money is wagered or paid.</p>
              </div>
            </section>

            <section id="auction" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">2. Auction & bidding</h2>
              <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <p>Host a room and share its room code with friends. Each participant joins and selects an available franchise. During the auction, players are presented one at a time and franchises compete by placing bids before the timer expires.</p>
                <div className="border border-white/10 rounded-md p-5 bg-white/[0.01] space-y-3">
                  <h3 className="font-semibold text-white">Bid increments</h3>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong className="text-white">Marquee / Set 1:</strong> minimum bid increment is ₹0.25 crore.</li>
                    <li><strong className="text-white">Set 2 onwards:</strong> minimum bid increment is ₹0.15 crore.</li>
                    <li>For a player with a base price below ₹1 crore, the minimum bid amount is ₹0.15 crore.</li>
                  </ul>
                </div>
                <p>The auction timer resets when a valid bid is placed. When the timer expires, the player is sold to the highest bidder. If there is no valid bid, the player is marked unsold. The host controls the auction flow and configured timer.</p>
              </div>
            </section>

            <section id="squad" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">3. Squad rules</h2>
              <div className="border border-white/10 rounded-md p-5 bg-white/[0.01]">
                <ul className="list-disc pl-5 space-y-3 text-sm text-gray-300 leading-relaxed">
                  <li>Minimum squad size for MEGA mode qualification: <strong className="text-white">18 players</strong>.</li>
                  <li>Maximum overseas players: <strong className="text-white">4</strong>.</li>
                  <li>Keep enough purse balance to complete the minimum squad requirement; do not spend the entire purse too early.</li>
                  <li>Only eligible players in the franchise squad can be selected for the final Playing XI.</li>
                </ul>
              </div>
            </section>

            <section id="rtm" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">4. Retention (RTM) cards</h2>
              <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <p>Each franchise has two Retention To Match (RTM) cards. Eligibility is based on the player’s original IPL franchise, not simply the franchise that currently bids for the player.</p>
                <ol className="list-decimal pl-5 space-y-3">
                  <li>When another franchise wins the bidding for an RTM-eligible player, the player’s original franchise receives a prompt to use an RTM card.</li>
                  <li>If the original franchise accepts, the bidding franchise gets 15 seconds to enter a counter-price higher than the current highest bid.</li>
                  <li>If no valid counter-price is submitted in time, the original franchise gets the player at the current highest bid.</li>
                  <li>If a valid counter-price is submitted, the original franchise gets 10 seconds to decide whether to match it.</li>
                  <li>If the original franchise matches, it gets the player at the counter-price. If it declines or the decision timer expires, the bidding franchise gets the player at the counter-price.</li>
                </ol>
                <p>Each successful use consumes one of the franchise’s two RTM cards. The prompts are time-limited, so respond before the countdown ends.</p>
              </div>
            </section>

            <section id="playing-xi" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">5. Playing XI submission</h2>
              <div className="border border-white/10 rounded-md p-5 bg-white/[0.01] space-y-3 text-sm text-gray-300 leading-relaxed">
                <p>This stage applies <strong className="text-white">only to MEGA mode</strong>. After the host ends the auction:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Each qualified franchise gets <strong className="text-white">5 minutes</strong> to submit its Playing XI.</li>
                  <li>Players must be arranged in the chosen batting/bowling order.</li>
                  <li>The XI must include at least <strong className="text-white">2 all-rounders</strong> and a total of <strong className="text-white">5 bowlers</strong>.</li>
                  <li>One Impact Player can also be selected. The analysis considers 11 starting players plus 1 Impact Player (12 players in total).</li>
                  <li>If a franchise does not submit before the deadline, the system automatically selects the best eligible XI from its squad.</li>
                </ul>
                <p>If every participating franchise has bought fewer than 18 players, the system does not wait for the five-minute XI window. It goes directly to the rankings page and marks every franchise as disqualified, showing the number of players each one purchased and explaining that at least 18 players were required.</p>
              </div>
            </section>

            <section id="rankings" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">6. AI rankings</h2>
              <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <p>After the MEGA mode submission stage, SSAUCTION analyses the eligible franchise teams and displays a ranked leaderboard.</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>The analysis primarily uses each player’s real performance statistics from the <strong className="text-white">last three IPL seasons</strong>.</li>
                  <li>If a player has insufficient IPL match data, international performance is used as a fallback.</li>
                  <li>The analysis considers relevant batting, bowling and all-round performance statistics, such as matches, runs, average, strike rate, wickets and economy.</li>
                  <li>Each franchise receives a unique rank from 1 to the number of participating franchises. There are no tied ranks.</li>
                  <li>For position-by-position comparison, the corresponding player positions in each franchise’s submitted XI are evaluated.</li>
                  <li>Franchises that fail the 18-player minimum are disqualified and are identified as such on the results page.</li>
                </ul>
                <p>AI rankings are game results generated from the available statistics and analysis rules; they are not a guarantee of real-world cricket performance.</p>
              </div>
            </section>

            <section id="faq" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-5">7. FAQ</h2>
              <div className="border-t border-white/10">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="border-b border-white/10">
                    <button onClick={() => toggleFaq(idx)} className="w-full py-4 flex items-center justify-between text-left hover:text-white transition-colors text-[#E5E5E5] group">
                      <span className="text-sm font-medium">{faq.q}</span>
                      <ChevronDown size={16} className={`text-gray-500 transition-transform duration-200 shrink-0 ${openFaq === idx ? 'rotate-180 text-white' : 'group-hover:text-gray-400'}`} />
                    </button>
                    <AnimatePresence>
                      {openFaq === idx && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="pb-4 text-sm text-gray-400 leading-relaxed">{faq.a}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default GameGuide;
