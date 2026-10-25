import React from 'react';

/**
 * Original CSS-built auctioneer stage illustration.
 * This is a lightweight 2.5D visual, not a rigged WebGL/3D model.
 * Kept presentation-only so it cannot affect live auction state.
 */
const AuctioneerStage = ({ compact = false }) => (
  <div className={`ss-auctioneer-stage ${compact ? 'is-compact' : ''}`} aria-label="SS Auctioneer stage illustration">
    <div className="ss-auctioneer-backlight" aria-hidden="true" />
    <div className="ss-auctioneer-caption">
      <span className="ss-auctioneer-live-dot" />
      <span>SS AUCTION FLOOR</span>
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
    <div className="ss-auctioneer-podium">
      <div className="ss-auctioneer-podium-top"><span>SS</span><small>AUCTIONEER</small></div>
      <div className="ss-auctioneer-podium-front"><span>THE AUCTION BEGINS</span></div>
    </div>
    <div className="ss-auctioneer-floor-glow" aria-hidden="true" />
  </div>
);

export default React.memo(AuctioneerStage);
