// Modified from the upstream project by saiprasad00700.
import React from 'react';

/**
 * Original CSS-built auctioneer stage illustration.
 * This is a lightweight 2.5D visual, not a rigged WebGL/3D model.
 * Kept presentation-only so it cannot affect live auction state.
 */
const AuctioneerStage = ({ compact = false, status = 'idle', playerName = '' }) => {
  const stageLabel = status === 'sold' ? 'SOLD' : status === 'unsold' ? 'UNSOLD' : status === 'processing_sale' ? 'RETENTION DECISION' : status === 'bidding' ? 'BIDDING LIVE' : 'AUCTION FLOOR';

  return (
  <div className={`ss-auctioneer-stage ${compact ? 'is-compact' : ''}`} data-auction-status={status} role="img" aria-label={`SS Auctioneer stage illustration: ${stageLabel}`}>
    <div className="ss-auctioneer-backlight" aria-hidden="true" />
    <div className="ss-auctioneer-caption" aria-hidden="true">
      <span className="ss-auctioneer-live-dot" />
      <span>{stageLabel}</span>
    </div>
    <div className="ss-auctioneer-figure" aria-hidden="true">
      <div className="ss-auctioneer-head">
        <div className="ss-auctioneer-hair" />
        <div className="ss-auctioneer-face">
          <i /><i /><span />
        </div>
      </div>
      <div className="ss-auctioneer-neck" />
      <div className="ss-auctioneer-torso">
        <div className="ss-auctioneer-shirt" />
        <div className="ss-auctioneer-tie" />
        <div className="ss-auctioneer-pocket" />
      </div>
      <div className="ss-auctioneer-arm ss-auctioneer-arm-left" />
      <div className="ss-auctioneer-arm ss-auctioneer-arm-right">
        <div className="ss-auctioneer-gavel"><span /></div>
      </div>
      <div className="ss-auctioneer-hand ss-auctioneer-hand-left" />
      <div className="ss-auctioneer-hand ss-auctioneer-hand-right" />
    </div>
    <div className="ss-auctioneer-podium" aria-hidden="true">
      <div className="ss-auctioneer-podium-top"><span>SS</span><small>AUCTIONEER</small></div>
      <div className="ss-auctioneer-podium-front"><span>{playerName ? `${playerName} · ${stageLabel}` : stageLabel}</span></div>
    </div>
    <div className="ss-auctioneer-floor-glow" aria-hidden="true" />
  </div>
  );
};

export default React.memo(AuctioneerStage);
