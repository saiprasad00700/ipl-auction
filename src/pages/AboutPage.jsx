import React from 'react';
import { Link } from 'react-router-dom';
import PublicInfoLayout from '../components/PublicInfoLayout';

const AboutPage = () => (
  <PublicInfoLayout title="About SS AUCTION" description="SS AUCTION is an independent, free-to-use multiplayer cricket auction simulation where friends can create rooms, build virtual squads and compare team strategies.">
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">What is SS AUCTION?</h2>
      <p>SS AUCTION is a fan-made cricket auction simulation developed as an independent project. It lets participants host or join auction rooms, select franchises, bid on players with virtual budgets and build squads together. It is designed for entertainment and cricket strategy practice.</p>
      <p className="mt-3">The platform is free to use. All auction purses, player prices and bids are virtual game values. They are not real money, cannot be redeemed and are not used for betting or cash prizes. Any optional developer support is voluntary and is not required to use the game.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">How the experience works</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Create a room and share its code, or join an available room.</li>
        <li>Choose an available franchise and take part in the live player auction.</li>
        <li>Manage your virtual purse, squad composition and eligible retention options.</li>
        <li>In MEGA mode, submit a Playing XI and receive an AI-assisted team ranking.</li>
      </ul>
      <p className="mt-3">For the exact rules and mode-specific limits, read the <Link className="text-emerald-300 hover:underline" to="/guide">Game Guide</Link>.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Independent project and trademarks</h2>
      <p>SS AUCTION is not an official IPL product. It is not affiliated with, endorsed by, sponsored by or associated with the Board of Control for Cricket in India (BCCI), the Indian Premier League (IPL), or any IPL franchise. Team names, player names, photographs, trademarks and other third-party materials remain the property of their respective owners. Their appearance does not imply ownership, sponsorship or endorsement.</p>
      <p className="mt-3">The project uses custom cartoon-style artwork in parts of its interface. Player photographs and other third-party visual materials may have separate rights and licensing terms. If you are a rights holder and have a concern, please contact us so it can be reviewed.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
      <p>For questions, feedback or rights-related requests, email <a className="text-emerald-300 hover:underline" href="mailto:ssauctionforall@gmail.com">ssauctionforall@gmail.com</a>.</p>
    </section>
  </PublicInfoLayout>
);

export default AboutPage;
