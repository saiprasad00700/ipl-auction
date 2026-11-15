// Modified from the upstream project by saiprasad00700.
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import Footer from '../components/Footer';
import useDocumentTitle from '../hooks/useDocumentTitle';

const PrivacyPolicy = () => {
  useDocumentTitle('Privacy Policy', 'Privacy Policy for SSAUCTION.');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [activeSection, setActiveSection] = useState('info-collect');

  const sections = [
    { id: 'info-collect', label: '1. Information we collect' },
    { id: 'how-use', label: '2. How we use information' },
    { id: 'auth', label: '3. Authentication' },
    { id: 'auction-data', label: '4. Auction and room data' },
    { id: 'chats', label: '5. Text chat and voice chat' },
    { id: 'analytics', label: '6. AI analysis, analytics and advertising' },
    { id: 'storage', label: '7. Data storage and retention' },
    { id: 'third-party', label: '8. Third-party services' },
    { id: 'choices', label: '9. Your choices' },
    { id: 'children', label: '10. Children\'s privacy' },
    { id: 'changes', label: '11. Changes to this policy' },
    { id: 'contact', label: '12. Contact' },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    const handleScroll = () => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 10) {
        setActiveSection(sections[sections.length - 1].id);
      }
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0F10] text-[#E5E5E5] font-sans selection:bg-white/20 selection:text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0E0F10]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5">
            <Home size={14} />
            <span>Home</span>
          </Link>
          <ChevronRight size={14} className="text-gray-600" />
          <span className="text-gray-500">Legal</span>
          <ChevronRight size={14} className="text-gray-600" />
          <span className="text-white">Privacy Policy</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col lg:flex-row gap-8 lg:gap-24 items-start w-full flex-1">
        {/* Left TOC - sticky on desktop, hidden on mobile */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-28">
          <h3 className="text-white font-semibold text-sm mb-4">On this page</h3>
          <nav className="flex flex-col gap-2.5 border-l border-white/10">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`text-sm text-left pl-4 -ml-[1px] border-l ${activeSection === s.id ? 'border-emerald-300 text-white' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-white/30'} transition-colors`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-3xl w-full pb-16 sm:pb-20">
          <details className="lg:hidden mb-6 border border-white/10 rounded-md p-4 bg-white/[0.01]">
            <summary className="cursor-pointer text-sm font-medium text-white">On this page</summary>
            <nav className="flex flex-col gap-2 mt-3 border-l border-white/10">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`text-sm text-left pl-3 -ml-[1px] border-l ${activeSection === s.id ? 'border-emerald-300 text-white' : 'border-transparent text-gray-400'} transition-colors`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </details>

          <div className="mb-8 sm:mb-12 border-b border-white/10 pb-6 sm:pb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">Privacy Policy</h1>
            <p className="text-sm text-gray-500 mb-6">Last updated: November 15, 2026</p>
            <p className="text-base text-[#E5E5E5] leading-relaxed">
              This policy explains what information SSAUCTION collects, how it is used, and which third-party services are involved. We aim to collect only the minimal data necessary to provide a real-time multiplayer auction experience.
            </p>
          </div>

          <div className="space-y-8 sm:space-y-12">
            <section id="info-collect" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">1. Information we collect</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>When you use SSAUCTION, we collect the following information:</p>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                  <li><strong className="text-gray-200">Account information:</strong> If you sign in with Google, we collect your display name, email address, and profile picture URL.</li>
                  <li><strong className="text-gray-200">Auction data:</strong> We store the state of the auction rooms you create or join, including team configurations, bids, and chat messages.</li>
                  <li><strong className="text-gray-200">Device and technical information:</strong> Our analytics and server infrastructure may process browser type, screen resolution, operating system, IP address, timestamps, page views, and feature events for analytics, security, rate limiting, and diagnostics.</li>
                </ul>
              </div>
            </section>

            <section id="how-use" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">2. How we use information</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                  <li>Synchronize state across connected clients in real-time.</li>
                  <li>Maintain user sessions and authentication.</li>
                  <li>Identify and troubleshoot bugs or performance issues.</li>
                  <li>Improve the overall user experience and stability of the platform.</li>
                </ul>
              </div>
            </section>

            <section id="auth" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">3. Authentication</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  We use Firebase Authentication (via Google OAuth 2.0) to handle user sign-in. SSAUCTION never receives, processes, or stores your Google password. Your authentication token is managed entirely by Firebase and your browser.
                </p>
              </div>
            </section>

            <section id="auction-data" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">4. Auction and room data</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  Auction rooms, bids, rosters, and associated configurations are stored in the Firebase Realtime Database. This data is retained to allow users to resume interrupted auctions and review past auction results. We do not use this data for any marketing or advertising purposes.
                </p>
              </div>
            </section>

            <section id="chats" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">5. Text chat and voice chat</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  <strong className="text-gray-200">Text messages:</strong> Messages, stickers, and shared GIF references sent in an auction room are stored in the Firebase Realtime Database so they can be delivered and displayed to participants in that room. We do not routinely read, monitor, or review private conversations, and we do not use message contents for advertising.
                </p>
                <p>
                  Because text messages are stored in our database, authorized technical administrators may be able to access them. Access is not part of routine operation and may occur only when reasonably necessary to maintain or secure the service, investigate abuse or technical problems, respond to a support request, or comply with a legal obligation. Other participants in the same room can see messages shared in that room.
                </p>
                <p>
                  <strong className="text-gray-200">Voice chat:</strong> Voice chat is provided through Agora RTC. When you join a voice channel, your browser requests microphone permission and live audio is transmitted in real time to other participants in the same auction room. Agora processes the audio and related connection information to provide the service. SSAUCTION does not intentionally record or store voice conversations and does not provide a replay feature. We may process room identifiers and participant identifiers to authenticate and manage the voice session. Agora may process technical and connection metadata under its own privacy terms.
                </p>
                <p>
                  Please remember that other participants may independently record, capture, or repeat conversations using their own devices or software. Do not share information in text or voice chat that you do not want other room participants to hear or see.
                </p>
              </div>
            </section>

            <section id="analytics" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">6. AI analysis, analytics and advertising</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p><strong className="text-gray-200">AI-assisted winner analysis:</strong> In supported auction modes, SSAUCTION sends submitted franchise information to the Google Gemini API to generate comparative team rankings and explanations. This may include franchise identifiers and names, submitted Playing XI and batting order, Impact Player selections, squad/player names and roles, and player-performance statistics associated with those players. The analysis is automated and may be inaccurate; it assists the game's ranking process and is not a guarantee of actual team performance or professional advice. Google processes submitted information to provide the AI service under its applicable terms and privacy policy. Do not include sensitive personal information in player names, room names, or other submitted fields.</p>
                <p><strong className="text-gray-200">Optional analytics and diagnostics:</strong> Umami, Cloudflare Web Analytics, and SSAUCTION's application analytics (such as page views and room activity events) are optional. They are activated only after you accept optional analytics in the privacy choices banner. If you decline, these analytics scripts and application analytics events are not activated. Essential application operations, security, hosting, and real-time auction services may still process technical information needed to operate and protect the service.</p>
                <p><strong className="text-gray-200">Advertising:</strong> If Google AdSense or other advertising services are enabled, Google and its advertising partners may use cookies, web beacons, IP addresses, device identifiers, and similar technologies to serve, measure, and personalize ads based on visits to this site or other sites. You can manage Google's personalized advertising settings at <a className="text-blue-400 hover:text-blue-300" href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Google Ads Settings</a>. You can also visit <a className="text-blue-400 hover:text-blue-300" href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer">AboutAds.info</a> for information about interest-based advertising choices. Advertising technologies will be used only when advertising is enabled and subject to applicable consent requirements.</p>
              </div>
            </section>

            <section id="storage" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">7. Data storage and retention</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  Account, room, and auction data is stored using Firebase and other service providers described in this policy. We retain account data and auction history while needed to provide the service and for legitimate operational, security, and legal purposes. Inactive rooms may be automatically deleted under our room-retention rules. Voice conversations are not intentionally recorded or stored by SSAUCTION.
                </p>
                <p>
                  Certain application preferences, such as volume level and active room IDs, are stored locally on your device using <code>localStorage</code>. You can clear these at any time via your browser settings.
                </p>
              </div>
            </section>

            <section id="third-party" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">8. Third-party services</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>SSAUCTION integrates with the following third-party services:</p>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                  <li><strong>Firebase (Google):</strong> For Google sign-in and real-time database services, including auction-room data, presence, and text messages.</li>
                  <li><strong>Render and Cloudflare:</strong> For application hosting, server requests, routing, delivery, and website security. These providers may process technical connection information such as IP addresses and request metadata.</li>
                  <li><strong>Agora:</strong> For real-time voice communication. Live audio and technical connection metadata are processed to provide voice sessions; SSAUCTION does not intentionally record or store voice conversations.</li>
                  <li><strong>Google Gemini:</strong> For AI-assisted analysis of auction squads and player-performance information to generate franchise rankings and explanations in supported modes.</li>
                  <li><strong>Umami and Cloudflare Web Analytics:</strong> For website usage, performance, and diagnostic analytics.</li>
                  <li><strong>Google AdSense (if enabled):</strong> For advertising, which may involve cookies and similar technologies as described above.</li>
                  <li><strong>Supabase:</strong> For selected application analytics and stored cricket player-match statistics used by winner analysis, and for sticker-related storage where enabled.</li>
                </ul>
                <p>
                  These services have their own privacy policies governing how they handle data processed on our behalf.
                </p>
              </div>
            </section>

            <section id="choices" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">9. Your choices</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  You can decline optional analytics using the privacy choices banner; declining does not disable essential sign-in, security, or auction functions. Your current choice is stored in this browser. Clearing browser storage may cause the choice banner to appear again. You may request deletion of your account and associated data by contacting us, and you can revoke SSAUCTION access through your Google Account permissions dashboard.
                </p>
              </div>
            </section>

            <section id="children" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">10. Children's privacy</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  SSAUCTION is a general-audience cricket auction simulation for cricket fans and is not designed or directed specifically to children under 13. Children under 13 may be able to access the service, but they are not our intended audience. The service is not intended for children to submit personal information or create accounts. We do not knowingly collect personal information from children under 13. If a parent or guardian believes a child under 13 has provided personal information, please contact us so we can review the request and take appropriate steps, including deletion where required. We do not knowingly use children's personal information for targeted advertising. This statement does not replace any obligations that may apply under the laws of a user's location.
                </p>
              </div>
            </section>

            <section id="changes" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">11. Changes to this policy</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the "Last updated" date at the top.
                </p>
              </div>
            </section>

            <section id="contact" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-white mb-4">12. Contact</h2>
              <div className="space-y-4 text-[#E5E5E5] text-base leading-relaxed">
                <p>
                  If you have questions about this Privacy Policy or how we handle your data, please contact the engineering team at:
                </p>
                <p>
                  <a href="mailto:ssauctionforall@gmail.com" className="text-blue-400 hover:text-blue-300 transition-colors">ssauctionforall@gmail.com</a>
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
