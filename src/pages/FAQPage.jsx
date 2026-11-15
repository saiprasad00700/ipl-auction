import React from 'react';
import { Link } from 'react-router-dom';
import PublicInfoLayout from '../components/PublicInfoLayout';

const items = [
  ['Is SS AUCTION free?', 'Yes. SS AUCTION is free to use. The auction purse and bids are virtual values; users do not deposit or wager real money. Optional developer support is voluntary and is not required to play.'],
  ['Can I play with friends?', 'Yes. Create an auction room and share its room code so other participants can join.'],
  ['Which modes are available?', 'The project includes MEGA, SPRINT 11 (11-player) and SPRINT 5 (5-player) auction formats. Check the Game Guide for the current rules and limits.'],
  ['Does every mode use Playing XI submission?', 'No. Playing XI submission and the MEGA qualification rules apply to MEGA mode. SPRINT 11 and SPRINT 5 analysis compares the purchased squad.'],
  ['How are MEGA rankings calculated?', 'The system uses available recent IPL player-match statistics as its primary evidence and may use recent international performance as a fallback when a player has too few recent IPL appearances. The AI compares team composition and the submitted XI to produce unique ranks.'],
  ['Can AI rankings be wrong?', 'Yes. Statistics may be incomplete and AI-generated assessments can contain errors. Rankings are game results, not guaranteed predictions or official cricket judgements.'],
  ['Does voice chat record conversations?', 'Voice chat is transmitted through Agora RTC. SS AUCTION does not intentionally record voice conversations. Other participants may independently record or capture audio using their own devices or software.'],
  ['Is SS AUCTION an official IPL platform?', 'No. SS AUCTION is an independent fan-made simulation and is not affiliated with, endorsed by or sponsored by the BCCI, IPL or any franchise.'],
  ['How can I report a problem or rights concern?', 'Email ssaauctionforall@gmail.com with a description of the issue and any relevant page or asset details.']
];

const FAQPage = () => (
  <PublicInfoLayout title="Frequently Asked Questions" description="Answers to common questions about rooms, auction modes, AI rankings, voice chat and the SS AUCTION platform.">
    {items.map(([question, answer], index) => (
      <section key={question} className="border-b border-white/10 pb-6">
        <h2 className="text-lg font-semibold text-white mb-2">{index + 1}. {question}</h2>
        <p>{answer}</p>
      </section>
    ))}
    <p>For detailed auction rules, visit the <Link to="/guide" className="text-emerald-300 hover:underline">Game Guide</Link>. For data handling, read the <Link to="/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link>.</p>
  </PublicInfoLayout>
);

export default FAQPage;
