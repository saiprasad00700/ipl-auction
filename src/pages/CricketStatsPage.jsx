import React from 'react';
import { Link } from 'react-router-dom';
import PublicInfoLayout from '../components/PublicInfoLayout';

const CricketStatsPage = () => (
  <PublicInfoLayout title="Cricket Statistics and Data" description="An overview of the player-performance information used by SS AUCTION's AI-assisted team analysis.">
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">What the statistics are used for</h2>
      <p>SS AUCTION maintains a player-match statistics dataset to support its AI-assisted auction analysis. The server looks up records by the player identifiers used in the auction catalogue, groups available records by season and derives season-level batting and bowling summaries.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Recent IPL seasons</h2>
      <p>The current analysis data pipeline loads mapped IPL player-match records for the 2024, 2025 and 2026 seasons. Available batting fields include runs, balls faced, fours, sixes and dismissals. Available bowling fields include wickets, runs conceded, balls bowled and maidens. Derived measures include batting average, strike rate, bowling average, overs and economy.</p>
      <p className="mt-3">Not every player necessarily has complete records for every season or every statistic. A missing record means the database does not currently have a mapped recent IPL record for that player; it should not be interpreted as zero performance.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">How missing recent IPL data is handled</h2>
      <p>For MEGA mode, recent IPL performance is the primary evidence. When a player has fewer than five IPL appearances in the available three-season window, recent international T20 or relevant ODI performance may be considered as a fallback. If reliable evidence is unavailable, the analysis is expected to acknowledge uncertainty rather than invent statistics.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Data limitations</h2>
      <p>The dataset is intended for a game feature, not as a live official score service or a complete statistical archive. Coverage, mappings and derived calculations may contain gaps or errors. Users should verify important cricket statistics against authoritative sources.</p>
      <p className="mt-3">See <Link to="/ai-analysis" className="text-emerald-300 hover:underline">How AI Team Analysis Works</Link> for the ranking process, or the <Link to="/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link> for information about data use.</p>
    </section>
  </PublicInfoLayout>
);

export default CricketStatsPage;
