import React from 'react';

/**
 * Compact franchise-table strip for the cinematic auction stage.
 * This is presentation-only: the auction context remains the source of truth.
 */
const FranchiseArenaStrip = ({ teams = [], activeTeamId = null }) => (
  <div className="ss-franchise-arena-strip" aria-label="Franchise auction tables">
    {teams.map((team) => {
      const active = Boolean(activeTeamId && team.id === activeTeamId);
      return (
        <div
          key={team.id}
          className={`ss-franchise-table ${active ? 'is-active' : ''}`}
          data-team-id={team.id}
          aria-current={active ? 'true' : undefined}
          title={active ? `${team.name} is the current highest bidder` : team.name}
        >
          <div className="ss-franchise-table-light" aria-hidden="true" />
          <img src={team.logo} alt="" loading="lazy" decoding="async" />
          <span className="ss-franchise-table-name">{team.id}</span>
          <span className="ss-franchise-table-state">{active ? 'HIGH BID' : 'TABLE'}</span>
        </div>
      );
    })}
  </div>
);

export default React.memo(FranchiseArenaStrip);
