import React from 'react';
import { Link } from 'react-router-dom';
import PublicInfoLayout from '../components/PublicInfoLayout';

const AIAnalysisPage = () => (
  <PublicInfoLayout title="How AI Team Analysis Works" description="Learn how SS AUCTION uses available cricket statistics and an AI model to compare auction teams and produce game rankings.">
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Purpose of the analysis</h2>
      <p>AI-assisted analysis is a game feature. It compares the squads or Playing XIs created during an auction and produces a ranked results page with explanations, strengths and risks. It is not an official cricket ranking, a prediction of match outcomes or professional advice.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">MEGA mode</h2>
      <p>In MEGA mode, eligible franchises submit a starting Playing XI in the selected order and can select separate Impact Player options for chasing and defending. The analysis evaluates the submitted XI, role balance and player performance evidence. The first eleven entries are treated as the ordered starting XI; Impact Player options are assessed separately.</p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Recent IPL player-match statistics from the 2024, 2025 and 2026 seasons are attached where mapped records are available.</li>
        <li>Recent IPL evidence is the primary basis for assessment. When a player has fewer than five IPL appearances in the available three-season window, recent international performance may be used as supporting or alternative evidence.</li>
        <li>Relevant measures include batting runs, balls, average and strike rate, as well as bowling wickets, runs conceded, overs and economy.</li>
        <li>Each eligible franchise receives a unique rank. A franchise that fails the minimum squad requirement is disqualified under the game rules.</li>
      </ul>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">SPRINT 11 and SPRINT 5 modes</h2>
      <p>For SPRINT 11 (11-player) and SPRINT 5 (5-player) analysis, the model compares each franchise's complete purchased squad. It considers role coverage, batting and bowling options, all-rounders, depth and balance for the selected format. These modes do not use a submitted Playing XI or Impact Player selection, and the analysis endpoint does not apply the MEGA 18-player qualification rule to these modes.</p>
    </section>
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Data, AI limitations and user choices</h2>
      <p>SS AUCTION retrieves mapped recent IPL match records from its statistics database and sends relevant player and team information to the Google Gemini API for analysis. The submitted franchise names, player names, squad/Playing XI selections, Impact Player choices and attached performance statistics may be processed to generate rankings and explanations. The Privacy Policy explains the data handling and third-party services.</p>
      <p className="mt-3">Statistics coverage may be incomplete. Player roles, data mappings or model interpretations can be imperfect, and AI-generated explanations may contain errors. A rank is a result within this simulation and should not be treated as an objective or guaranteed measure of real-world team strength.</p>
      <p className="mt-3">Read the <Link to="/guide" className="text-emerald-300 hover:underline">Game Guide</Link> for squad rules and submission requirements, and the <Link to="/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link> for information about data processing.</p>
    </section>
  </PublicInfoLayout>
);

export default AIAnalysisPage;
