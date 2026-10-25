import React, { useEffect, useState } from 'react';

/**
 * Presentation-only franchise tables. AuctionContext remains authoritative:
 * paddle effects react to accepted bid / RTM state and never submit auction actions.
 */
const FranchiseArenaStrip = ({
  teams = [],
  activeTeamId = null,
  bidEventKey = '',
  rtmTeamId = null,
  rtmEventKey = ''
}) => {
  const [raisedBidTeam, setRaisedBidTeam] = useState(null);
  const [raisedRtmTeam, setRaisedRtmTeam] = useState(null);

  useEffect(() => {
    if (!activeTeamId || !bidEventKey) return undefined;
    setRaisedBidTeam(activeTeamId);
    const timer = window.setTimeout(() => setRaisedBidTeam(null), 850);
    return () => window.clearTimeout(timer);
  }, [activeTeamId, bidEventKey]);

  useEffect(() => {
    if (!rtmTeamId || !rtmEventKey) return undefined;
    setRaisedRtmTeam(rtmTeamId);
    const timer = window.setTimeout(() => setRaisedRtmTeam(null), 1100);
    return () => window.clearTimeout(timer);
  }, [rtmTeamId, rtmEventKey]);

  return (
    <div className="ss-franchise-arena-strip" data-active-team={activeTeamId || ""} role="group" aria-label="Franchise auction tables">
      {teams.map((team) => {
        const active = Boolean(activeTeamId && team.id === activeTeamId);
        const bidRaised = raisedBidTeam === team.id;
        const rtmRaised = raisedRtmTeam === team.id;
        return (
          <div
            key={team.id}
            className={`ss-franchise-table ${active ? 'is-active' : ''} ${bidRaised ? 'bid-paddle-raised' : ''} ${rtmRaised ? 'rtm-paddle-raised' : ''}`}
            data-team-id={team.id}
            aria-current={active ? 'true' : undefined}
            title={active ? `${team.name} is the current highest bidder` : team.name}
          >
            <div className="ss-franchise-table-light" aria-hidden="true" />
            <img src={team.logo} alt="" loading="lazy" decoding="async" />
            <span className="ss-franchise-table-name">{team.id}</span>
            <span className="ss-franchise-table-state" aria-live={active ? "polite" : "off"}>{active ? 'HIGH BID · LEADING' : 'TABLE'}</span>
            <span className="ss-franchise-paddle ss-franchise-bid-paddle" aria-hidden="true">BID</span>
            <span className="ss-franchise-paddle ss-franchise-rtm-paddle" aria-hidden="true">RTM</span>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(FranchiseArenaStrip);
