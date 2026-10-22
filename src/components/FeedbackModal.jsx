// Modified from the upstream project by saiprasad00700.
import React from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';

const FEEDBACK_EMAIL = 'ssauctionforall@gmail.com';
const FEEDBACK_SUBJECT = 'SSAUCTION Feedback';

const FeedbackModal = () => {
  const location = useLocation();

  // Show the feedback link strictly on the landing page only.
  if (location.pathname !== '/') return null;

  const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`;

  return (
    <a
      id="feedback-fab-button"
      href={mailtoUrl}
      aria-label="Send feedback by email"
      className="fixed bottom-20 right-6 z-[90] flex items-center gap-2 bg-[#0a0a0a]/80 hover:bg-emerald-400/10 text-white px-3.5 py-2 rounded-full border border-white/10 hover:border-[#6ee7b7]/30 backdrop-blur-xl shadow-2xl transition-all duration-300 group cursor-pointer"
    >
      <MessageSquarePlus className="w-3.5 h-3.5" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70 group-hover:text-white transition-colors duration-300">
        Feedback
      </span>
    </a>
  );
};

export default FeedbackModal;
