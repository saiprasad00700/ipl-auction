import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import Footer from './Footer';
import useDocumentTitle from '../hooks/useDocumentTitle';

const PublicInfoLayout = ({ title, description, updated = 'November 15, 2026', children }) => {
  useDocumentTitle(title, description);
  return (
    <div className="min-h-screen bg-[#0E0F10] text-[#E5E5E5] font-sans flex flex-col">
      <header className="sticky top-0 z-50 bg-[#0E0F10]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 lg:px-8 h-14 flex items-center">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-1.5"><Home size={14} /><span>Home</span></Link>
          <ChevronRight size={14} className="text-gray-600" /><span className="text-white">{title}</span>
        </div>
      </header>
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 flex-1">
        <div className="border-b border-white/10 pb-7 mb-8">
          <p className="text-xs text-emerald-300 uppercase tracking-[0.2em] font-bold mb-3">SS AUCTION</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">{title}</h1>
          <p className="text-sm text-gray-500 mb-5">Last updated: {updated}</p>
          <p className="text-base text-gray-300 leading-relaxed">{description}</p>
        </div>
        <div className="space-y-8 text-sm sm:text-base text-gray-300 leading-relaxed">{children}</div>
      </main>
      <Footer />
    </div>
  );
};

export default PublicInfoLayout;
