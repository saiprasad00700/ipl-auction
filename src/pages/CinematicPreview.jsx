// Original SS AUCTION cinematic 3D preview. This is a visual sandbox; it does not mutate live auction state.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Gavel, Mic, Volume2, VolumeX, RotateCcw, Sparkles, Users } from 'lucide-react';
import * as THREE from 'three';

const FRANCHISES = [
  ['CSK', '#f5c542'], ['DC', '#4aa8ff'], ['GT', '#8da6c8'], ['KKR', '#a78bfa'], ['LSG', '#38bdf8'],
  ['MI', '#60a5fa'], ['PBKS', '#f87171'], ['RR', '#f472b6'], ['RCB', '#fb7185'], ['SRH', '#fb923c'],
];

function makeTextTexture(text, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '900 76px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.fillText(text, 256, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLabel(text, color, width = 3.2) {
  const material = new THREE.MeshBasicMaterial({ map: makeTextTexture(text, color), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.31), material);
  return mesh;
}

function buildCharacter(group, palette, kind = 'player') {
  const jersey = new THREE.MeshStandardMaterial({ color: palette, roughness: 0.48, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101a2c, roughness: 0.65 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb97853, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe5bd68, metalness: 0.65, roughness: 0.28, emissive: 0x573510, emissiveIntensity: 0.25 });
  const add = (geo, mat, pos, scale, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  if (kind === 'auctioneer') {
    add(new THREE.CylinderGeometry(0.47, 0.62, 1.2, 12), dark, [0, 1.18, 0], [1, 1, 0.72]);
    add(new THREE.SphereGeometry(0.42, 20, 16), skin, [0, 2.08, 0], [0.9, 1.08, 0.9]);
    add(new THREE.CylinderGeometry(0.43, 0.43, 0.13, 20), gold, [0, 2.51, 0], [1, 1, 1]);
    add(new THREE.ConeGeometry(0.42, 0.44, 20), dark, [0, 2.76, 0], [1, 1, 1]);
    const arm = add(new THREE.CapsuleGeometry(0.13, 0.76, 5, 8), dark, [0.62, 1.72, 0], [1, 1, 1]); arm.rotation.z = -0.85;
    const gavel = new THREE.Group(); gavel.position.set(1.0, 2.14, 0); gavel.rotation.z = -0.28; group.add(gavel);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8), gold, [0, -0.12, 0], [1,1,1], gavel);
    add(new THREE.BoxGeometry(0.38, 0.2, 0.22), gold, [0, 0.19, 0], [1,1,1], gavel);
    group.userData.gavel = gavel;
  } else {
    add(new THREE.CapsuleGeometry(0.56, 0.94, 6, 12), jersey, [0, 1.15, 0], [1, 1, 0.72]);
    add(new THREE.SphereGeometry(0.39, 20, 16), skin, [0, 2.05, 0], [0.92, 1.1, 0.92]);
    add(new THREE.SphereGeometry(0.4, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), dark, [0, 2.18, 0], [1.02, 0.8, 1.02]);
    const left = add(new THREE.CapsuleGeometry(0.13, 0.75, 5, 8), jersey, [-0.65, 1.22, 0], [1,1,1]); left.rotation.z = -0.42;
    const right = add(new THREE.CapsuleGeometry(0.13, 0.75, 5, 8), jersey, [0.65, 1.22, 0], [1,1,1]); right.rotation.z = 0.42;
    add(new THREE.CylinderGeometry(0.19, 0.22, 0.7, 10), dark, [-0.28, 0.25, 0], [1,1,1]);
    add(new THREE.CylinderGeometry(0.19, 0.22, 0.7, 10), dark, [0.28, 0.25, 0], [1,1,1]);
    const number = makeLabel('SS', '#ffffff', 0.95); number.position.set(0, 1.23, 0.52); group.add(number);
  }
}

function createArena(scene) {
  const root = new THREE.Group(); scene.add(root);
  const mat = (color, roughness = 0.5, metalness = 0.2, emissive = 0x000000) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: 0.35 });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(19, 20, 0.55, 96), mat(0x101a2a, 0.3, 0.45)); floor.position.y = -0.35; floor.receiveShadow = true; root.add(floor);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(11.8, 12.5, 0.08, 96), mat(0x142d32, 0.5, 0.15, 0x08251f)); inner.position.y = 0.02; root.add(inner);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x49f2b2, emissive: 0x1acb8a, emissiveIntensity: 1.5, metalness: 0.4 });
  [12.2, 15.5, 18.4].forEach((r, i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? 0.055 : 0.035, 8, 120), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = i === 0 ? 0.12 : -0.02; root.add(ring); });
  // Stadium tiers: concentric low-poly seating bands.
  for (let i = 0; i < 4; i++) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(19 + i * 0.65, 18.6 + i * 0.65, 0.58, 96, 1, true, 0, Math.PI * 2), mat(i % 2 ? 0x18243a : 0x101b2d, 0.75, 0.1));
    tier.position.y = 1.05 + i * 0.68; root.add(tier);
    const lightRing = new THREE.Mesh(new THREE.TorusGeometry(18.9 + i * 0.65, 0.028, 6, 128), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x37c9ff : 0x50f0bb }));
    lightRing.rotation.x = Math.PI / 2; lightRing.position.y = 1.36 + i * 0.68; root.add(lightRing);
  }
  // Individual stadium light clusters around the upper rim.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, x = Math.cos(a) * 20.2, z = Math.sin(a) * 20.2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.15, 0.34), new THREE.MeshBasicMaterial({ color: 0xd8f7ff }));
    bar.position.set(x, 4.1, z); bar.lookAt(0, 1.6, 0); root.add(bar);
    if (i % 4 === 0) { const lamp = new THREE.PointLight(i % 8 ? 0x55dfff : 0x42ffba, 22, 17); lamp.position.set(x, 4, z); root.add(lamp); }
  }
  // Raised center presentation dais.
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.45, 48), mat(0x17273a, 0.3, 0.65, 0x061e27)); dais.position.set(0, 0.28, -1.0); dais.receiveShadow = true; root.add(dais);
  const daisRing = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.075, 10, 80), ringMat); daisRing.rotation.x = Math.PI / 2; daisRing.position.set(0, 0.52, -1); root.add(daisRing);
  const player = new THREE.Group(); player.position.set(-1.05, 0.52, -1.25); root.add(player); buildCharacter(player, 0x2563eb, 'player');
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.18, 32), mat(0x273a50, 0.25, 0.6)); plinth.position.set(-1.05, 0.6, -1.25); root.add(plinth);
  const auctioneer = new THREE.Group(); auctioneer.position.set(4.8, 0.18, -0.7); auctioneer.scale.setScalar(0.78); root.add(auctioneer); buildCharacter(auctioneer, 0x17243b, 'auctioneer');
  const podium = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.15), mat(0x0c1726, 0.25, 0.7, 0x103d39)); podium.position.set(4.8, 0.57, -0.75); root.add(podium);
  const plaque = makeLabel('AUCTION', '#6cf7c1', 1.7); plaque.position.set(4.8, 0.78, -0.15); root.add(plaque);
  const tables = [];
  FRANCHISES.forEach(([name, color], i) => {
    const angle = Math.PI * 0.14 + i / 10 * Math.PI * 1.72;
    const x = Math.sin(angle) * 10.2, z = Math.cos(angle) * 10.2 + 0.5;
    const tableGroup = new THREE.Group(); tableGroup.position.set(x, 0, z); tableGroup.rotation.y = Math.atan2(-x, -z); root.add(tableGroup);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.24, 1.35), mat(0x162338, 0.25, 0.7)); top.position.y = 0.88; tableGroup.add(top);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 1.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })); edge.position.y = 1.0; tableGroup.add(edge);
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.65, 0.12), mat(0x0b1422, 0.25, 0.45)); front.position.set(0, 0.45, 0.66); tableGroup.add(front);
    const label = makeLabel(name, '#' + new THREE.Color(color).getHexString(), 1.8); label.position.set(0, 0.47, 0.74); tableGroup.add(label);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0x0a1827 })); screen.position.set(0, 1.12, 0); tableGroup.add(screen);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color })); dot.position.set(0.86, 1.13, 0); tableGroup.add(dot);
    const players = new THREE.Group(); players.position.set(0, 0, 0.15); tableGroup.add(players);
    [-0.55, 0, 0.55].forEach((dx, j) => { const p = new THREE.Group(); p.position.set(dx, 0, j === 1 ? -0.12 : 0.04); p.scale.setScalar(0.24); players.add(p); buildCharacter(p, color, 'player'); });
    tables.push({ name, group: tableGroup, edge, color, angle, dot });
  });
  // Camera crane and overhead rig silhouettes give the stage a broadcast feel.
  const trussMat = mat(0x34485f, 0.3, 0.8);
  const truss = new THREE.Mesh(new THREE.TorusGeometry(20.8, 0.09, 8, 96), trussMat); truss.rotation.x = Math.PI / 2; truss.position.y = 4.6; root.add(truss);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(10, 0.65, 0.18), mat(0x0c1728, 0.3, 0.65, 0x05251f)); banner.position.set(0, 4.05, -18.5); root.add(banner);
  const title = makeLabel('SS AUCTION', '#7df7c4', 7.3); title.position.set(0, 4.08, -18.38); root.add(title);
  root.userData = { player, auctioneer, tables, daisRing, ringMat, truss };
  return root;
}

export default function CinematicPreview() {
  const mountRef = useRef(null);
  const sceneApi = useRef(null);
  const [shot, setShot] = useState(0);
  const [bid, setBid] = useState(2);
  const [leader, setLeader] = useState('LSG');
  const [outcome, setOutcome] = useState('LIVE LOT');
  const [sound, setSound] = useState(false);
  const [rtm, setRtm] = useState(false);
  const [webglError, setWebglError] = useState('');

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let renderer, scene, camera, arena, frame = 0, raf = 0, observer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      host.appendChild(renderer.domElement);
      scene = new THREE.Scene(); scene.background = new THREE.Color(0x050914); scene.fog = new THREE.FogExp2(0x050914, 0.012);
      camera = new THREE.PerspectiveCamera(43, host.clientWidth / host.clientHeight, 0.1, 120);
      camera.position.set(0, 12.5, 27); camera.lookAt(0, 1.1, 0);
      scene.add(new THREE.HemisphereLight(0x9ad9ff, 0x101523, 2.0));
      const key = new THREE.SpotLight(0x9fffe0, 260, 60, Math.PI / 4, 0.55, 1.1); key.position.set(-8, 17, 5); key.target.position.set(0, 0, 0); key.castShadow = true; scene.add(key, key.target);
      const rim = new THREE.SpotLight(0x4a78ff, 220, 60, Math.PI / 3, 0.6, 1); rim.position.set(10, 13, -9); rim.target.position.set(0, 1, 0); scene.add(rim, rim.target);
      const fill = new THREE.PointLight(0x35e9b1, 75, 35); fill.position.set(0, 7, 7); scene.add(fill);
      arena = createArena(scene);
      const resize = () => { if (!host.clientWidth || !host.clientHeight) return; camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
      observer = new ResizeObserver(resize); observer.observe(host);
      const animate = () => {
        raf = requestAnimationFrame(animate); frame += 0.008;
        const a = arena.userData;
        a.daisRing.rotation.z += 0.002;
        a.player.position.y = 0.52 + Math.sin(frame * 1.8) * 0.045;
        a.auctioneer.userData.gavel.rotation.z = Math.sin(frame * 1.5) * 0.28 - 0.18;
        a.tables.forEach((t, i) => { const active = t.name === leader; t.edge.material.emissiveIntensity = active ? 1.6 + Math.sin(frame * 5) * 0.45 : 0.22; t.dot.scale.setScalar(active ? 1.2 + Math.sin(frame * 5) * 0.12 : 1); });
        const targetShot = shot % 4;
        const poses = [
          [0, 12.5, 27, 0, 1.1, 0],
          [-10, 7.2, 16, 0, 1.0, 0],
          [10, 6.4, 12, 2, 1.1, -1],
          [0, 19, 7, 0, 0, 0],
        ];
        const p = poses[targetShot];
        camera.position.x += (p[0] - camera.position.x) * 0.025;
        camera.position.y += (p[1] - camera.position.y) * 0.025;
        camera.position.z += (p[2] - camera.position.z) * 0.025;
        camera.lookAt(p[3], p[4], p[5]);
        arena.rotation.y = Math.sin(frame * 0.16) * 0.025;
        renderer.render(scene, camera);
      };
      animate();
      sceneApi.current = { scene, camera, arena, renderer };
    } catch (err) {
      setWebglError('3D rendering could not start in this browser. Try updating your browser or enabling hardware acceleration.');
      console.error('SS AUCTION 3D preview failed:', err);
    }
    return () => {
      cancelAnimationFrame(raf); observer?.disconnect();
      if (arena) arena.traverse(obj => { obj.geometry?.dispose(); if (obj.material) { const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => { m.map?.dispose(); m.dispose(); }); } });
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === host) host.removeChild(renderer.domElement);
      sceneApi.current = null;
    };
  }, [shot, leader]);

  const announce = (message) => {
    if (!sound || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US'; utterance.rate = 0.92; window.speechSynthesis.speak(utterance);
  };
  const nextBid = () => { const next = +(bid + 0.5).toFixed(2); setBid(next); setOutcome('BID ACCEPTED'); announce('New bid. ' + next.toFixed(2) + ' crore.'); };
  const sell = () => { setOutcome('SOLD'); announce('Sold! Sold for ' + bid.toFixed(2) + ' crore.'); };
  const useRtm = () => { setRtm(v => !v); setOutcome(rtm ? 'LIVE LOT' : 'RTM REVIEW'); announce(rtm ? 'Back to live bidding.' : 'Retention card review.'); };

  return (
    <main className="ss3d-preview">
      <header className="ss3d-topbar">
        <Link to="/" className="ss3d-back"><ArrowLeft size={17}/> <span>SS AUCTION</span></Link>
        <div className="ss3d-live"><span/> CINEMATIC ARENA <b>PREVIEW</b></div>
        <div className="ss3d-top-actions"><span className="ss3d-room">ROOM DEMO · 10 FRANCHISES</span><button aria-label="Toggle voice announcements" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button></div>
      </header>
      <section className="ss3d-hero">
        <div className="ss3d-heading"><span className="ss3d-eyebrow"><Sparkles size={13}/> NEXT-GENERATION AUCTION EXPERIENCE</span><h1>THE AUCTION <em>ARENA</em></h1><p>A stadium-scale 3D stage. Live bidding energy. Every decision in the spotlight.</p></div>
        <div className="ss3d-scene-wrap">
          <div className="ss3d-scene" ref={mountRef} aria-label="Interactive 3D cricket auction arena with animated player, auctioneer and ten franchise tables" role="img"/>
          {webglError && <div className="ss3d-webgl-error">{webglError}</div>}
          <div className="ss3d-scene-vignette"/>
          <div className="ss3d-cam-label"><Camera size={14}/> {['WIDE BROADCAST','PLAYER CLOSE-UP','AUCTIONEER CAM','OVERHEAD ARENA'][shot % 4]}</div>
          <div className="ss3d-lot-label"><span>MARQUEE SET 01</span><small>BASE PRICE</small><strong>₹2.00 <i>Cr</i></strong></div>
          <div className="ss3d-bid-hud"><small>CURRENT BID</small><strong>₹{bid.toFixed(2)} <i>Cr</i></strong><span>LEADING · {leader}</span></div>
          <div className={'ss3d-status ' + (outcome === 'SOLD' ? 'is-sold' : outcome === 'RTM REVIEW' ? 'is-rtm' : '')}>{outcome}</div>
          <div className="ss3d-player-caption"><span>LOT 001 / WICKET-KEEPER</span><strong>THE NEXT GAME CHANGER</strong><small>Original demo character · cinematic player introduction</small></div>
          <div className="ss3d-scene-controls"><button onClick={() => setShot(v => (v + 1) % 4)}><Camera size={15}/> Change camera</button><button onClick={() => {setShot(0); setBid(2); setLeader('LSG'); setOutcome('LIVE LOT'); setRtm(false);}}><RotateCcw size={15}/> Reset scene</button></div>
        </div>
      </section>
      <section className="ss3d-console">
        <div className="ss3d-console-head"><div><span className="ss3d-eyebrow">LIVE AUCTION CONTROL</span><h2>Every bid changes the room.</h2></div><span className="ss3d-status-chip"><i/> {outcome}</span></div>
        <div className="ss3d-console-grid">
          <div className="ss3d-bid-panel"><div className="ss3d-panel-kicker">PLAYER ON THE BLOCK</div><div className="ss3d-player-mini"><div className="ss3d-avatar">WK</div><div><strong>Marquee Player</strong><small>Wicket-keeper · Overseas demo</small></div><b>LOT 001</b></div><div className="ss3d-price-row"><span>Current bid</span><strong>₹{bid.toFixed(2)} Cr</strong></div><div className="ss3d-action-row"><button className="ss3d-bid-button" onClick={nextBid}><Gavel size={17}/> PLACE BID · ₹{(bid + 0.5).toFixed(2)} Cr</button><button className={'ss3d-rtm-button ' + (rtm ? 'active' : '')} onClick={useRtm}>RTM CARD</button><button className="ss3d-sold-button" onClick={sell}>SOLD</button></div><p className="ss3d-demo-note">Demo controls only — no real auction or database is changed.</p></div>
          <div className="ss3d-franchise-panel"><div className="ss3d-panel-kicker"><Users size={14}/> FRANCHISE TABLES <span>10 ACTIVE</span></div><div className="ss3d-franchise-grid">{FRANCHISES.map(([name, color]) => <button key={name} className={leader === name ? 'leading' : ''} onClick={() => {setLeader(name); setOutcome('LIVE LOT'); announce(name + ' is now leading.');}} style={{'--team-accent':color}}><i/><strong>{name}</strong><small>{leader === name ? 'LEADING' : '₹120 Cr'}</small></button>)}</div><div className="ss3d-feature-foot"><span><Mic size={14}/> VOICE CHAT READY</span><span><Sparkles size={14}/> 3D CAMERA CUTS</span></div></div>
        </div>
      </section>
      <footer className="ss3d-footer"><span>SS AUCTION · CINEMATIC REBUILD</span><span>PREVIEW BUILD · NOT CONNECTED TO LIVE AUCTIONS</span><Link to="/">Return to current site ↗</Link></footer>
    </main>
  );
}
