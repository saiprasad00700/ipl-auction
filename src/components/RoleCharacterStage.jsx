import React from 'react';

/**
 * Lightweight, responsive role-aware character placeholder for the cinematic stage.
 * Uses original CSS-built shapes (not real-player likenesses or downloaded portraits).
 * A future asset pass can replace this with rigged 3D models without changing auction state.
 */
const RoleCharacterStage = ({ player, visible = true }) => {
  if (!visible || !player) return null;

  const role = String(player.role || '').toLowerCase();
  const isKeeper = role.includes('wicket');
  const isBowler = role.includes('bowl') && !role.includes('all');
  const isAllRounder = role.includes('all');
  const showBat = isKeeper || isAllRounder || (!isBowler && !isAllRounder);
  const showBall = isBowler || isAllRounder;

  return (
    <div className="ss-role-intro" aria-label={`Animated ${player.role || 'cricket'} character introduction`}>
      <div className="ss-role-intro-kicker">PLAYER INTRODUCTION</div>
      <div className="ss-role-character" aria-hidden="true">
        <div className="ss-character-shadow" />
        <div className="ss-character-head">
          <div className="ss-character-hair" />
          <div className="ss-character-face">
            <i /><i />
            <span />
          </div>
        </div>
        <div className="ss-character-neck" />
        <div className="ss-character-body">
          <div className="ss-character-shirt-mark">SS</div>
        </div>
        <div className="ss-character-arm ss-character-arm-left" />
        <div className="ss-character-arm ss-character-arm-right" />
        <div className="ss-character-leg ss-character-leg-left" />
        <div className="ss-character-leg ss-character-leg-right" />
        {showBat && <div className="ss-character-bat"><span /></div>}
        {showBall && <div className="ss-character-ball"><span /></div>}
      </div>
      <div className="ss-role-intro-name">{player.name}</div>
      <div className="ss-role-intro-role">{player.role || 'Player'}</div>
    </div>
  );
};

export default React.memo(RoleCharacterStage);
