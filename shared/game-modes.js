/**
 * game-modes.js - Single / Hot-Seat / Live / Tournament
 *
 * Usage in any game script:
 *   GameModes.init({ gameLabel, startFn, resetFn, getScore })
 *   GameModes.roundEnd(finalScore)
 */
(function () {
  const CSS = `
  #gm-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(circle at 14% 16%, rgba(0,221,180,0.12), transparent 42%),
      radial-gradient(circle at 88% 82%, rgba(255,47,156,0.12), transparent 44%),
      rgba(13,16,23,0.97);
    backdrop-filter: blur(8px);
    font-family: "Manrope","Segoe UI",sans-serif;
    animation: gm-fade-in 0.22s ease;
  }
  #gm-overlay.gm-hidden { display: none; }
  @keyframes gm-fade-in { from { opacity: 0; } to { opacity: 1; } }

  .gm-card {
    background: linear-gradient(155deg, rgba(22,27,39,0.96) 0%, rgba(19,24,39,0.98) 60%, rgba(16,20,34,0.98) 100%);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 24px;
    padding: 34px 40px;
    max-width: 520px;
    width: 92%;
    text-align: center;
    color: #eef1ff;
    box-shadow: 0 30px 72px rgba(0,0,0,0.64), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .gm-card.gm-card-pick {
    position: relative;
    overflow: hidden;
    --gm-accent: rgba(0, 221, 180, 0.5);
    --gm-accent-soft: rgba(0, 221, 180, 0);
    --gm-secondary: rgba(255, 47, 156, 0.38);
    --gm-secondary-soft: rgba(255, 47, 156, 0);
    --gm-tertiary: rgba(255, 180, 64, 0.3);
    --gm-tertiary-soft: rgba(255, 180, 64, 0);
    --gm-symbol: rgba(233, 241, 255, 0.7);
    --gm-label: rgba(233, 241, 255, 0.34);
  }

  .gm-card.gm-card-pick::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.35;
    background: linear-gradient(
      180deg,
      rgba(255,255,255,0.05) 0%,
      rgba(255,255,255,0.01) 12%,
      rgba(255,255,255,0.05) 24%,
      rgba(255,255,255,0.01) 36%,
      rgba(255,255,255,0.05) 48%,
      rgba(255,255,255,0.01) 60%,
      rgba(255,255,255,0.05) 72%,
      rgba(255,255,255,0.01) 84%,
      rgba(255,255,255,0.04) 100%
    );
    mix-blend-mode: soft-light;
    animation: gm-scan 10s linear infinite;
  }

  .gm-card.gm-card-pick::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 0;
    box-shadow: inset 0 0 0 1px rgba(138, 174, 255, 0.2), inset 0 0 45px rgba(0, 221, 180, 0.08);
  }

  .gm-card.gm-card-pick > * {
    position: relative;
    z-index: 1;
  }

  .gm-pick-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .gm-pick-orb {
    position: absolute;
    border-radius: 999px;
    opacity: 0.32;
    filter: blur(2px);
    animation: gm-pulse 6s ease-in-out infinite;
  }

  .gm-pick-orb.a {
    width: 190px;
    height: 190px;
    top: -38px;
    left: -20px;
    background: radial-gradient(circle, var(--gm-accent), var(--gm-accent-soft));
  }

  .gm-pick-orb.b {
    width: 210px;
    height: 210px;
    right: -86px;
    bottom: -72px;
    animation-duration: 7.2s;
    animation-direction: reverse;
    background: radial-gradient(circle, var(--gm-secondary), var(--gm-secondary-soft));
  }

  .gm-pick-orb.c {
    width: 130px;
    height: 130px;
    top: 34px;
    right: 170px;
    animation-duration: 5.4s;
    background: radial-gradient(circle, var(--gm-tertiary), var(--gm-tertiary-soft));
  }

  .gm-float {
    position: absolute;
    color: #d9f5ff;
    opacity: 0.18;
    text-shadow: 0 0 12px rgba(0, 221, 180, 0.3);
    animation: gm-drift linear infinite;
  }

  .gm-float.pad { top: 18%; left: 11%; font-size: 22px; animation-duration: 18s; }
  .gm-float.head { top: 70%; left: 8%; font-size: 19px; animation-duration: 22s; }
  .gm-float.trophy { top: 23%; right: 13%; font-size: 20px; animation-duration: 20s; }
  .gm-float.bolt { top: 74%; right: 18%; font-size: 18px; animation-duration: 16s; }

  .gm-float.sym {
    color: var(--gm-symbol);
    font-size: 21px;
    animation-duration: 24s;
  }

  .gm-float.tri { top: 39%; left: 30%; }
  .gm-float.cir { top: 20%; left: 49%; }
  .gm-float.crs { top: 62%; left: 58%; }
  .gm-float.sqr { top: 47%; right: 28%; }

  .gm-pick-label {
    position: absolute;
    right: 22px;
    top: 18px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gm-label);
    animation: gm-label-pulse 3.2s ease-in-out infinite;
  }

  .gm-card.gm-theme-single {
    --gm-accent: rgba(0, 221, 180, 0.56);
    --gm-accent-soft: rgba(0, 221, 180, 0);
    --gm-secondary: rgba(122, 168, 255, 0.36);
    --gm-secondary-soft: rgba(122, 168, 255, 0);
    --gm-tertiary: rgba(255, 200, 64, 0.28);
    --gm-tertiary-soft: rgba(255, 200, 64, 0);
    --gm-symbol: rgba(214, 248, 255, 0.8);
    --gm-label: rgba(188, 245, 255, 0.54);
  }

  .gm-card.gm-theme-hotseat,
  .gm-card.gm-theme-live {
    --gm-accent: rgba(255, 47, 156, 0.5);
    --gm-accent-soft: rgba(255, 47, 156, 0);
    --gm-secondary: rgba(0, 221, 180, 0.45);
    --gm-secondary-soft: rgba(0, 221, 180, 0);
    --gm-tertiary: rgba(106, 124, 255, 0.34);
    --gm-tertiary-soft: rgba(106, 124, 255, 0);
    --gm-symbol: rgba(255, 226, 247, 0.84);
    --gm-label: rgba(255, 197, 232, 0.56);
  }

  .gm-card.gm-theme-tournament {
    --gm-accent: rgba(255, 201, 64, 0.56);
    --gm-accent-soft: rgba(255, 201, 64, 0);
    --gm-secondary: rgba(255, 120, 76, 0.38);
    --gm-secondary-soft: rgba(255, 120, 76, 0);
    --gm-tertiary: rgba(0, 221, 180, 0.34);
    --gm-tertiary-soft: rgba(0, 221, 180, 0);
    --gm-symbol: rgba(255, 242, 203, 0.86);
    --gm-label: rgba(255, 228, 164, 0.62);
  }

  @keyframes gm-drift {
    0% { transform: translate3d(0, 0, 0) rotate(0deg); }
    25% { transform: translate3d(12px, -16px, 0) rotate(6deg); }
    50% { transform: translate3d(-6px, -28px, 0) rotate(-4deg); }
    75% { transform: translate3d(-14px, -10px, 0) rotate(3deg); }
    100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  }

  @keyframes gm-pulse {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.42; transform: scale(1.14); }
  }

  @keyframes gm-label-pulse {
    0%, 100% { opacity: 0.42; letter-spacing: 0.18em; }
    50% { opacity: 0.76; letter-spacing: 0.22em; }
  }

  @keyframes gm-scan {
    0% { transform: translateY(-30%); }
    100% { transform: translateY(30%); }
  }

  .gm-card h2 {
    margin: 0 0 8px;
    font-size: clamp(24px, 4vw, 34px);
    font-weight: 900;
    letter-spacing: -0.04em;
    text-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .gm-card h2 span {
    color: transparent;
    background: linear-gradient(110deg, #ff64b7 0%, #ff2f9c 45%, #ffd46d 100%);
    -webkit-background-clip: text;
    background-clip: text;
    text-shadow: 0 0 22px rgba(255, 68, 163, 0.28);
  }
  .gm-card .gm-sub {
    margin: 0 0 24px;
    color: #93a4c8;
    font-size: 15px;
    line-height: 1.6;
  }

  .gm-modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .gm-mode-btn {
    min-height: 118px;
    padding: 16px 12px;
    border-radius: 16px;
    background: linear-gradient(160deg, rgba(31,39,63,0.78) 0%, rgba(26,33,53,0.9) 100%);
    border: 1px solid rgba(171, 191, 238, 0.16);
    color: #eef1ff;
    cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    justify-content: center;
    position: relative;
    overflow: hidden;
    transition: border-color 0.18s, background 0.18s, transform 0.18s, box-shadow 0.18s;
  }
  .gm-mode-btn::before {
    content: '';
    position: absolute;
    inset: -1px;
    background: linear-gradient(115deg, rgba(0,221,180,0.14), rgba(255,47,156,0.14));
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  .gm-mode-btn::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 10px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(0,221,180,0), rgba(0,221,180,0.84), rgba(0,221,180,0));
    opacity: 0;
    transform: scaleX(0.5);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .gm-mode-btn > * { position: relative; z-index: 1; }
  .gm-mode-btn:hover {
    background: linear-gradient(160deg, rgba(37,47,74,0.84) 0%, rgba(29,38,62,0.96) 100%);
    border-color: rgba(203, 222, 255, 0.3);
    transform: translateY(-3px);
    box-shadow: 0 14px 30px rgba(7, 11, 23, 0.45);
  }
  .gm-mode-btn:hover::before { opacity: 1; }
  .gm-mode-btn:hover::after { opacity: 0.8; transform: scaleX(1); }
  .gm-mode-btn.gm-locked {
    border-color: rgba(255, 203, 102, 0.46);
    background: linear-gradient(160deg, rgba(44, 37, 22, 0.82) 0%, rgba(39, 29, 18, 0.9) 100%);
    cursor: not-allowed;
  }
  .gm-mode-btn.gm-locked:hover {
    transform: none;
    box-shadow: none;
    border-color: rgba(255, 203, 102, 0.58);
    background: linear-gradient(160deg, rgba(50, 40, 24, 0.88) 0%, rgba(44, 33, 20, 0.92) 100%);
  }
  .gm-mode-btn .gm-lock-pill {
    position: absolute;
    right: 10px;
    top: 10px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(255, 203, 102, 0.45);
    color: #ffd46d;
    background: rgba(255, 212, 109, 0.12);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .gm-mode-btn.gm-selected {
    border: 2px solid #00ddb4;
    background: linear-gradient(155deg, rgba(17,29,33,0.96), rgba(14,24,31,0.96));
    box-shadow: 0 0 0 1px rgba(0,221,180,0.36), 0 10px 30px rgba(0,221,180,0.24), inset 0 0 24px rgba(0,221,180,0.14);
    transform: translateY(-2px);
  }
  .gm-mode-btn.gm-selected::after { opacity: 1; transform: scaleX(1); }
  .gm-mode-btn .gm-mi {
    font-size: 29px;
    line-height: 1;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
  }
  .gm-mode-btn strong { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
  .gm-mode-btn small { font-size: 12px; color: #8ea0c7; }
  .gm-mode-btn[data-mode="live"] { grid-column: 1 / -1; }

  .gm-size-row { display: flex; gap: 10px; margin: 0 0 16px; }
  .gm-size-btn {
    flex: 1;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.12);
    background: #1c2235;
    color: #eef1ff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }
  .gm-size-btn.gm-selected {
    border: 2px solid #00ddb4;
    background: #111c21;
  }
  .gm-size-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .gm-btn-primary {
    width: 100%; padding: 14px; border-radius: 12px;
    background: linear-gradient(135deg, #ff2f9c 0%, #d01787 54%, #a4067a 100%);
    border: none; color: #fff; font-size: 16px; font-weight: 800;
    cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase;
    transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s;
    box-shadow: 0 10px 24px rgba(255, 47, 156, 0.34);
  }
  .gm-btn-primary:hover {
    opacity: 0.94;
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(255, 47, 156, 0.42);
  }
  .gm-btn-primary:disabled {
    opacity: 1;
    cursor: default;
    color: rgba(233, 241, 255, 0.42);
    background: linear-gradient(135deg, rgba(88, 19, 63, 0.92) 0%, rgba(72, 15, 53, 0.92) 100%);
    box-shadow: none;
    transform: none;
  }
  .gm-btn-secondary {
    width: 100%; padding: 12px; border-radius: 12px; margin-top: 10px;
    background: transparent; border: 1px solid rgba(255,255,255,0.14);
    color: #cdd4ef; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: background 0.18s;
  }
  .gm-btn-secondary:hover { background: rgba(255,255,255,0.06); }

  @media (max-width: 760px) {
    .gm-card {
      width: 94%;
      padding: 28px 20px;
      border-radius: 20px;
    }
    .gm-modes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .gm-mode-btn[data-mode="live"] { grid-column: 1 / -1; }
  }

  /* Unified mode picker layout to match shared selector style */
  .gm-card.gm-card-pick {
    max-width: 640px;
    width: min(640px, 94vw);
    padding: 26px 30px 24px;
    border-radius: 24px;
    border: 1px solid rgba(142, 183, 255, 0.26);
    background: linear-gradient(160deg, rgba(14, 26, 53, 0.97), rgba(9, 19, 44, 0.97));
    box-shadow: 0 28px 56px rgba(0, 0, 0, 0.5);
    text-align: left;
    position: relative;
    overflow: hidden;
  }

  .gm-card.gm-card-pick .gm-pick-bg {
    display: none;
  }

  .gm-card.gm-card-pick::before,
  .gm-card.gm-card-pick::after {
    display: none;
  }

  .gm-game-label {
    display: inline-block;
    margin-bottom: 10px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #22e8c3;
  }

  .gm-close {
    position: absolute;
    right: 18px;
    top: 16px;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: #8aa2cf;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }

  .gm-close:hover {
    border-color: rgba(142, 183, 255, 0.4);
    color: #d7e6ff;
  }

  .gm-card.gm-card-pick h2 {
    margin: 2px 0 8px;
    font-size: clamp(34px, 4vw, 48px);
    line-height: 1.08;
    letter-spacing: -0.03em;
    text-shadow: none;
  }

  .gm-card.gm-card-pick h2 span {
    display: none;
  }

  .gm-card.gm-card-pick .gm-sub {
    margin: 0 0 20px;
    color: #8fa8cf;
    font-size: 15px;
    line-height: 1.45;
  }

  .gm-card.gm-card-pick .gm-sub strong {
    color: #c2d8ff;
  }

  .gm-card.gm-card-pick .gm-modes {
    grid-template-columns: 1fr;
    gap: 14px;
    margin-bottom: 0;
  }

  .gm-card.gm-card-pick .gm-mode-btn {
    min-height: 84px;
    padding: 14px 18px;
    border-radius: 16px;
    display: grid;
    grid-template-columns: 44px 1fr;
    grid-template-rows: auto auto;
    align-items: center;
    justify-items: start;
    column-gap: 14px;
    row-gap: 3px;
    background: linear-gradient(160deg, rgba(31, 42, 71, 0.9), rgba(24, 34, 58, 0.9));
    border: 1px solid rgba(143, 172, 226, 0.26);
    transform: none;
    box-shadow: none;
  }

  .gm-card.gm-card-pick .gm-mode-btn::before,
  .gm-card.gm-card-pick .gm-mode-btn::after {
    display: none;
  }

  .gm-card.gm-card-pick .gm-mode-btn:hover {
    transform: none;
    border-color: rgba(136, 202, 255, 0.55);
    background: linear-gradient(160deg, rgba(38, 52, 84, 0.95), rgba(29, 41, 68, 0.95));
  }

  .gm-card.gm-card-pick .gm-mode-btn.gm-selected {
    border: 2px solid #00ddb4;
    box-shadow: 0 0 0 1px rgba(0, 221, 180, 0.3), 0 10px 26px rgba(0, 221, 180, 0.2);
    background: linear-gradient(160deg, rgba(22, 63, 78, 0.95), rgba(19, 48, 64, 0.94));
    transform: none;
  }

  .gm-card.gm-card-pick .gm-mode-btn .gm-mi {
    grid-row: 1 / span 2;
    width: 40px;
    text-align: center;
    font-size: 30px;
    filter: none;
  }

  .gm-card.gm-card-pick .gm-mode-btn strong {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .gm-card.gm-card-pick .gm-mode-btn small {
    font-size: 14px;
    color: #9ab1d8;
  }

  .gm-card.gm-card-pick .gm-btn-primary {
    margin-top: 16px;
  }

  @media (max-width: 760px) {
    .gm-card.gm-card-pick {
      padding: 22px 18px 20px;
    }

    .gm-card.gm-card-pick .gm-sub {
      font-size: 14px;
    }

    .gm-card.gm-card-pick .gm-mode-btn {
      min-height: 78px;
      padding: 12px 14px;
    }

    .gm-card.gm-card-pick .gm-mode-btn strong {
      font-size: 18px;
    }

    .gm-card.gm-card-pick .gm-mode-btn small {
      font-size: 13px;
    }
  }

  .gm-turn-tag {
    display: inline-block; margin-bottom: 12px;
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.12em; color: #00ddb4;
    background: rgba(0,221,180,0.1); border: 1px solid rgba(0,221,180,0.25);
    padding: 4px 12px; border-radius: 999px;
  }

  .gm-score-row { display: flex; gap: 14px; margin: 0 0 24px; }
  .gm-score-box {
    flex: 1; background: #1c2235;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 14px 12px;
  }
  .gm-score-box .gm-sname {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #6e7fa0; margin-bottom: 4px;
  }
  .gm-score-box .gm-sval { font-size: 32px; font-weight: 900; letter-spacing: -0.03em; }
  .gm-score-box.gm-winner { border: 2px solid #00ddb4; background: #111c21; }
  .gm-score-box.gm-winner .gm-sval { color: #00ddb4; }
  .gm-result-line { font-size: 20px; font-weight: 900; margin: 0 0 20px; }
  .gm-result-line.gm-win span { color: #00ddb4; }
  .gm-result-line.gm-draw { color: #ff2f9c; }

  .gm-round-pill {
    display: inline-block;
    margin: 0 0 12px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ff9fd3;
    background: rgba(255,47,156,0.1);
    border: 1px solid rgba(255,47,156,0.35);
  }

  .gm-code-display {
    font-size: clamp(42px, 10vw, 64px);
    font-weight: 900; letter-spacing: 0.18em; color: #00ddb4;
    background: rgba(0,221,180,0.07); border: 2px dashed rgba(0,221,180,0.35);
    border-radius: 16px; padding: 18px 24px; margin: 0 0 10px;
    cursor: default; user-select: all;
  }
  .gm-code-hint { font-size: 12px; color: #6e7fa0; margin: 0 0 18px; }

  .gm-code-input {
    width: 100%; padding: 16px; border-radius: 12px; margin-bottom: 8px;
    background: #1c2235; border: 1px solid rgba(255,255,255,0.14);
    color: #eef1ff; font-size: 26px; font-weight: 900; letter-spacing: 0.2em;
    text-align: center; text-transform: uppercase; outline: none;
    transition: border-color 0.18s;
    box-sizing: border-box;
  }
  .gm-code-input:focus { border-color: #00ddb4; }
  .gm-join-error { font-size: 13px; color: #ff6b6b; min-height: 18px; margin: 0 0 12px; }

  .gm-waiting-row {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    color: #6e7fa0; font-size: 14px; margin-bottom: 16px;
  }
  .gm-spinner {
    display: inline-block; width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(0,221,180,0.3); border-top-color: #00ddb4;
    animation: gm-spin 0.8s linear infinite; flex-shrink: 0;
  }
  @keyframes gm-spin { to { transform: rotate(360deg); } }

  .gm-countdown-num {
    font-size: clamp(72px, 20vw, 120px); font-weight: 900;
    color: #00ddb4; letter-spacing: -0.04em;
    line-height: 1; margin: 8px 0 16px;
    text-shadow: 0 0 40px rgba(0,221,180,0.5);
    animation: gm-pop 0.35s ease;
  }
  @keyframes gm-pop { from { transform: scale(1.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  #gm-live-hud {
    position: fixed; top: 12px; right: 14px; z-index: 8888;
    background: rgba(13,16,23,0.92); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
    padding: 10px 16px; display: flex; align-items: center; gap: 10px;
    font-family: "Manrope","Segoe UI",sans-serif;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  }
  .gm-hud-label {
    font-size: 9px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.1em; color: #6e7fa0; display: block;
  }
  .gm-hud-val {
    font-size: 20px; font-weight: 900; letter-spacing: -0.02em; color: #eef1ff; display: block;
  }
  .gm-hud-you-col, .gm-hud-opp-col { display: flex; flex-direction: column; align-items: center; }
  .gm-hud-you-col .gm-hud-val { color: #00ddb4; }
  .gm-hud-sep { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.25); }

  #gm-conn-badge {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 8888;
    min-width: 230px;
    max-width: min(460px, calc(100vw - 24px));
    background: rgba(13,16,23,0.92);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    padding: 8px 10px;
    font-family: "Manrope","Segoe UI",sans-serif;
    box-shadow: 0 4px 24px rgba(0,0,0,0.45);
    backdrop-filter: blur(8px);
  }

  #gm-conn-badge .gm-conn-label {
    display: block;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #93a2c5;
  }

  #gm-conn-badge .gm-conn-url {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 800;
    color: #e7eeff;
    word-break: break-all;
  }

  #gm-conn-badge .gm-conn-state {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    font-weight: 700;
    color: #9fb2d8;
  }

  #gm-conn-badge.gm-status-on {
    border-color: rgba(0,221,180,0.55);
    box-shadow: 0 4px 24px rgba(0,221,180,0.22);
  }

  #gm-conn-badge.gm-status-on .gm-conn-state { color: #00ddb4; }

  #gm-conn-badge.gm-status-loading {
    border-color: rgba(255,198,71,0.45);
  }

  #gm-conn-badge.gm-status-loading .gm-conn-state { color: #ffc647; }

  #gm-conn-badge.gm-status-off {
    border-color: rgba(255,107,107,0.42);
  }

  #gm-conn-badge.gm-status-off .gm-conn-state { color: #ff8383; }
  `;

  let config = null;
  let overlayEl = null;

  // Modes: single | hotseat | live | tournament
  let activeMode = null;
  let phase = 'pick';
  let p1Score = 0;

  // Live mode state
  let socket = null;
  let socketBaseUrl = window.location.origin;
  let roomCode = null;
  let myPlayerIndex = null;
  let opponentScore = null;
  let scoreInterval = null;
  let liveHudEl = null;
  let connBadgeEl = null;

  // Tournament state
  let tournamentSize = 4;
  let tournamentDevice = 'same';
  let tournamentRemote = false;
  let tournamentPlayers = [];
  let tournamentRoundPlayers = [];
  let tournamentNextPlayers = [];
  let tournamentRound = 1;
  let tournamentMatchIndex = 0;
  let tournamentMatch = null;

  const isServerMode = window.location.protocol !== 'file:';

  function readSubscription(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      return null;
    }
  }

  function isSubscriptionActive(sub) {
    if (!sub || typeof sub !== 'object') return false;
    const status = String(sub.status || '').toLowerCase();
    return status !== 'cancelled' && status !== 'locked' && status !== 'expired';
  }

  function getActivePlan() {
    const studentSub = readSubscription('sp_student_subscription');
    if (isSubscriptionActive(studentSub) && studentSub.plan) {
      return String(studentSub.plan);
    }

    const teacherSub = readSubscription('sp_teacher_subscription');
    if (isSubscriptionActive(teacherSub) && teacherSub.plan) {
      return String(teacherSub.plan);
    }

    return 'free';
  }

  function isPaidPlanForModes(plan) {
    return plan === 'student_elite' ||
      plan === 'student_premium' ||
      plan === 'pro' ||
      plan === 'school';
  }

  function modeRequiresPaid(mode) {
    return mode === 'hotseat' || mode === 'tournament' || mode === 'live';
  }

  function isTeacherContext() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('teacher') === '1') return true;
    const role = String(localStorage.getItem('sp_user_role') || '').toLowerCase();
    return role === 'teacher';
  }

  function getUpgradeUrlByRole() {
    const returnTo = encodeURIComponent(window.location.href);
    if (isTeacherContext()) {
      return 'onboarding-payment.html?role=teacher&source=mode-picker&returnTo=' + returnTo;
    }
    return 'studentpayment.html?source=mode-picker&return=' + returnTo;
  }

  function getModeUpgradeMessage(mode) {
    const pretty = mode === 'hotseat'
      ? 'Multiplayer'
      : mode === 'tournament'
        ? 'Tournament'
        : 'Live 2-Player';

    if (isTeacherContext()) {
      return pretty + ' is a paid feature.\n\nUpgrade to Teacher Pro or School Premium to unlock multiplayer game modes.\n\nGo to plans now?';
    }

    return pretty + ' is a paid feature.\n\nUpgrade to Elite or Premium to unlock multiplayer game modes.\n\nGo to plans now?';
  }

  function showPaidGateForMode(mode) {
    const go = window.confirm(getModeUpgradeMessage(mode));
    if (go) {
      window.location.href = getUpgradeUrlByRole();
    }
  }

  function injectStyles() {
    if (document.getElementById('gm-styles')) return;
    const s = document.createElement('style');
    s.id = 'gm-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'gm-overlay';
    document.body.appendChild(overlayEl);
    renderPickMode();
  }

  function mountOrAutoLaunch() {
    const params = new URLSearchParams(window.location.search);
    const fromUpload = params.get('source') === 'upload';
    const preStyle = fromUpload ? (localStorage.getItem('slidePlayPlayStyle') || '') : '';
    const prePlayers = fromUpload ? tryParseJson(localStorage.getItem('slidePlayPlayers'), []) : [];
    const activePlan = getActivePlan();

    if (!fromUpload || !preStyle) {
      mount();
      return;
    }

    // We have a pre-selected play style — skip the overlay
    overlayEl = document.createElement('div');
    overlayEl.id = 'gm-overlay';
    overlayEl.className = 'gm-hidden';
    document.body.appendChild(overlayEl);

    if (preStyle === 'solo') {
      activeMode = 'single';
      safeStart();
    } else if (preStyle === 'multiplayer') {
      if (!isPaidPlanForModes(activePlan)) {
        renderPickMode();
        showPaidGateForMode('hotseat');
        return;
      }
      activeMode = 'hotseat';
      // Build player name list — show a quick turn-ready screen for P1
      const playerNames = prePlayers.length >= 2 ? prePlayers : ['Player 1', 'Player 2'];
      // Store names for hotseat rotation
      config._playerNames = playerNames;
      config._playerIndex = 0;
      renderHotseatPreLaunch(playerNames);
    } else if (preStyle === 'tournament') {
      if (!isPaidPlanForModes(activePlan)) {
        renderPickMode();
        showPaidGateForMode('tournament');
        return;
      }
      activeMode = 'tournament';
      const playerNames = prePlayers.length >= 2 ? prePlayers : ['Player 1', 'Player 2'];
      config._playerNames = playerNames;
      config._playerIndex = 0;
      renderHotseatPreLaunch(playerNames);
    } else {
      // Unknown style — fall back to overlay
      overlayEl.classList.remove('gm-hidden');
      renderPickMode();
    }
  }

  function renderHotseatPreLaunch(playerNames) {
    const firstName = playerNames[0] || 'Player 1';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <span class="gm-turn-tag">${activeMode === 'tournament' ? '🏆 TOURNAMENT' : '👥 MULTIPLAYER'} · ${playerNames.length} Players</span>
        <h2><span>${firstName}</span>, you're up!</h2>
        <p class="gm-sub">Pass the device after each round. Highest score wins.</p>
        <div class="gm-score-row" id="gm-all-players-row">
          ${playerNames.map((n, i) => `
            <div class="gm-score-box${i === 0 ? ' gm-winner' : ''}">
              <div class="gm-sname">${n}</div>
              <div class="gm-sval" style="font-size:18px">–</div>
            </div>`).join('')}
        </div>
        <button class="gm-btn-primary" id="gm-hotseat-start" type="button">🎮 Start Round</button>
      </div>`;
    overlayEl.querySelector('#gm-hotseat-start').addEventListener('click', () => {
      p1Score = 0;
      phase = 'p1';
      overlayEl.classList.add('gm-hidden');
      safeStart();
    });
  }

  function tryParseJson(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch (_) { return fallback; }
  }

  function getApiBase() {
    const fromStorage = localStorage.getItem('slideplay_api_base');
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim().replace(/\/$/, '');
    }
    return window.location.origin;
  }

  function getPlayerCountForMode() {
    if (activeMode === 'single') return 1;
    if (activeMode === 'live') return 2;
    if (activeMode === 'hotseat' || activeMode === 'tournament') {
      const names = Array.isArray(config?._playerNames) ? config._playerNames : [];
      return Math.max(2, names.length || 0);
    }
    return 1;
  }

  function recordGameplay(score) {
    const uid = String(localStorage.getItem('sp_user_uid') || '').trim();
    const email = String(localStorage.getItem('sp_user_email') || '').trim().toLowerCase();
    if (!uid && !email) return;

    const payload = {
      uid,
      email,
      displayName: String(localStorage.getItem('sp_user_name') || email || 'Player').trim(),
      role: String(localStorage.getItem('sp_user_role') || 'student').toLowerCase(),
      gameType: String(config?.gameLabel || document.title || 'game'),
      gameMode: activeMode === 'single' ? 'solo' : String(activeMode || 'solo'),
      playerCount: getPlayerCountForMode(),
      totalScore: Number(score || 0),
      winnerScore: Number(score || 0),
    };

    fetch(getApiBase() + '/api/gameplay/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  function safeReset() {
    if (config && typeof config.resetFn === 'function') config.resetFn();
  }

  function safeStart() {
    if (config && typeof config.startFn === 'function') config.startFn();
  }

  function mountConnectionBadge() {
    if (connBadgeEl) return;
    connBadgeEl = document.createElement('div');
    connBadgeEl.id = 'gm-conn-badge';
    document.body.appendChild(connBadgeEl);
  }

  function setConnectionBadge(status, url, note) {
    mountConnectionBadge();
    const normalizedStatus = status || 'loading';
    const normalizedUrl = url || 'unresolved';
    const normalizedNote = note || '';

    connBadgeEl.className = `gm-status-${normalizedStatus}`;
    connBadgeEl.innerHTML = `
      <span class="gm-conn-label">Game Server</span>
      <span class="gm-conn-url">${normalizedUrl}</span>
      <span class="gm-conn-state">${normalizedStatus.toUpperCase()}${normalizedNote ? ` • ${normalizedNote}` : ''}</span>`;
  }

  function hideConnectionBadge() {
    if (connBadgeEl) {
      connBadgeEl.remove();
      connBadgeEl = null;
    }
  }

  function loadSocketIO(cb) {
    if (window.io) {
      setConnectionBadge('loading', socketBaseUrl, 'using cached Socket.IO client');
      cb();
      return;
    }

    const candidates = [window.location.origin];

    const host = window.location.hostname;
    const localHosts = ['localhost', '127.0.0.1'];
    const preferredHost = localHosts.includes(host) ? host : 'localhost';
    const alternateHost = preferredHost === 'localhost' ? '127.0.0.1' : 'localhost';

    const fallbackBases = [
      `http://${preferredHost}:3000`,
      `http://${alternateHost}:3000`,
      `http://${preferredHost}:3001`,
      `http://${alternateHost}:3001`
    ];

    fallbackBases.forEach((base) => {
      if (!candidates.includes(base)) {
        candidates.push(base);
      }
    });

    setConnectionBadge('loading', candidates[0], 'probing server candidates');

    function tryLoad(index) {
      if (index >= candidates.length) {
        setConnectionBadge('off', 'none', 'server unreachable');
        showError('Could not reach game server. Start the Socket.IO server (port 3000 or 3001), then reload.');
        return;
      }

      const base = candidates[index];
      const s = document.createElement('script');
      s.src = base + '/socket.io/socket.io.js';
      s.onload = () => {
        socketBaseUrl = base;
        setConnectionBadge('loading', base, 'socket client loaded');
        cb();
      };
      s.onerror = () => {
        s.remove();
        tryLoad(index + 1);
      };
      document.head.appendChild(s);
    }

    tryLoad(0);
  }

  function connectSocket() {
    if (socket && socket.connected) return;
    setConnectionBadge('loading', socketBaseUrl, 'connecting');
    socket = window.io(socketBaseUrl, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setConnectionBadge('on', socketBaseUrl, 'connected');
    });

    socket.on('disconnect', (reason) => {
      setConnectionBadge('off', socketBaseUrl, reason || 'disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionBadge('off', socketBaseUrl, 'connect error');
    });

    socket.on('room-created', ({ code }) => {
      roomCode = code;
      if (activeMode === 'tournament' && tournamentRemote) {
        renderTournamentRemoteWaiting(code);
      } else {
        renderWaitingForP2(code);
      }
    });

    socket.on('room-ready', ({ playerIndex, code }) => {
      myPlayerIndex = playerIndex;
      roomCode = code;
      if (activeMode === 'tournament' && tournamentRemote) {
        renderTournamentRemoteCountdown();
      } else {
        renderLiveCountdown();
      }
    });

    socket.on('join-error', ({ message }) => {
      const errEl = document.getElementById('gm-join-error');
      if (errEl) errEl.textContent = message;
    });

    socket.on('opponent-score', ({ score }) => {
      opponentScore = score;
      updateLiveHud();
    });

    socket.on('opponent-done', ({ score }) => {
      opponentScore = score;
      updateLiveHud();
    });

    socket.on('game-results', ({ p1, p2 }) => {
      stopScorePolling();
      const myScore = myPlayerIndex === 1 ? p1 : p2;
      const oppScore = myPlayerIndex === 1 ? p2 : p1;
      if (activeMode === 'tournament' && tournamentRemote) {
        renderTournamentRemoteChampion(myScore, oppScore);
      } else {
        renderLiveResults(myScore, oppScore);
      }
    });

    socket.on('opponent-disconnected', () => {
      stopScorePolling();
      removeLiveHud();
      overlayEl.classList.remove('gm-hidden');
      overlayEl.innerHTML = `
        <div class="gm-card">
          <h2>Opponent <span>Left</span></h2>
          <p class="gm-sub">Your opponent disconnected from the game.</p>
          <button class="gm-btn-primary" id="gm-back" type="button">Back to Menu</button>
        </div>`;
      overlayEl.querySelector('#gm-back').addEventListener('click', () => {
        if (activeMode === 'tournament' && tournamentRemote) {
          renderTournamentSetup();
        } else {
          renderPickMode();
        }
      });
    });
  }

  function showError(msg) {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Connection <span>Error</span></h2>
        <p class="gm-sub">${msg}</p>
        <button class="gm-btn-primary" id="gm-back" type="button">Back</button>
      </div>`;
    overlayEl.querySelector('#gm-back').addEventListener('click', renderPickMode);
  }

  function resetTournamentState() {
    tournamentRemote = false;
    tournamentPlayers = [];
    tournamentRoundPlayers = [];
    tournamentNextPlayers = [];
    tournamentRound = 1;
    tournamentMatchIndex = 0;
    tournamentMatch = null;
  }

  function renderPickMode() {
    phase = 'pick';
    activeMode = null;
    roomCode = null;
    myPlayerIndex = null;
    opponentScore = null;
    removeLiveHud();
    stopScorePolling();
    hideConnectionBadge();
    resetTournamentState();
    overlayEl.classList.remove('gm-hidden');
    const activePlan = getActivePlan();
    const paidForModes = isPaidPlanForModes(activePlan);

    const liveBtn = isServerMode
      ? `<button class="gm-mode-btn ${paidForModes ? '' : 'gm-locked'}" data-mode="live" type="button">
           <span class="gm-mi">&#127760;</span>
           <strong>Live 2-Player</strong>
           <small>2 devices at once</small>
           ${paidForModes ? '' : '<span class="gm-lock-pill">Elite+</span>'}
         </button>`
      : '';

    overlayEl.innerHTML = `
      <div class="gm-card gm-card-pick">
        <button class="gm-close" id="gm-close" type="button" aria-label="Close">&times;</button>
        <div class="gm-game-label">${String(config.gameLabel || 'Game').toUpperCase()}</div>
        <h2>How do you want to play?</h2>
        <p class="gm-sub">Choose a game mode before launching</p>
        <div class="gm-modes">
          <button class="gm-mode-btn" data-mode="single" type="button">
            <span class="gm-mi">&#127918;</span>
            <strong>Solo</strong>
            <small>Play alone at your own pace</small>
          </button>
          <button class="gm-mode-btn ${paidForModes ? '' : 'gm-locked'}" data-mode="hotseat" type="button">
            <span class="gm-mi">&#128101;</span>
            <strong>Multiplayer</strong>
            <small>Take turns with friends, best score wins</small>
            ${paidForModes ? '' : '<span class="gm-lock-pill">Elite+</span>'}
          </button>
          <button class="gm-mode-btn ${paidForModes ? '' : 'gm-locked'}" data-mode="tournament" type="button">
            <span class="gm-mi">&#127942;</span>
            <strong>Tournament</strong>
            <small>Bracket competition, leaderboard finale</small>
            ${paidForModes ? '' : '<span class="gm-lock-pill">Premium</span>'}
          </button>
          ${liveBtn}
        </div>
        <button class="gm-btn-primary" id="gm-confirm" type="button" disabled>Start</button>
      </div>`;

    overlayEl.querySelector('#gm-close').addEventListener('click', () => {
      activeMode = 'single';
      overlayEl.classList.add('gm-hidden');
    });

    overlayEl.querySelectorAll('.gm-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (modeRequiresPaid(mode) && !paidForModes) {
          showPaidGateForMode(mode);
          return;
        }
        overlayEl.querySelectorAll('.gm-mode-btn').forEach((b) => b.classList.remove('gm-selected'));
        btn.classList.add('gm-selected');
        activeMode = mode;
        overlayEl.querySelector('#gm-confirm').disabled = false;
      });
    });

    overlayEl.querySelector('#gm-confirm').addEventListener('click', () => {
      if (!activeMode) return;
      if (activeMode === 'single') {
        overlayEl.classList.add('gm-hidden');
      } else if (activeMode === 'hotseat') {
        renderTurnReady(1, null);
      } else if (activeMode === 'live') {
        loadSocketIO(() => {
          connectSocket();
          renderRoomScreen();
        });
      } else if (activeMode === 'tournament') {
        renderTournamentSetup();
      }
    });
  }

  function renderRoomScreen() {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Live <span>2-Player</span></h2>
        <p class="gm-sub">Both players play at the same time on separate devices or browser tabs.</p>
        <div class="gm-modes">
          <button class="gm-mode-btn" id="gm-create-btn" type="button">
            <span class="gm-mi">&#10133;</span>
            <strong>Create Room</strong>
            <small>Get a code to share</small>
          </button>
          <button class="gm-mode-btn" id="gm-join-btn" type="button">
            <span class="gm-mi">&#128279;</span>
            <strong>Join Room</strong>
            <small>Enter a friend's code</small>
          </button>
        </div>
        <button class="gm-btn-secondary" id="gm-back" type="button">Back</button>
      </div>`;

    overlayEl.querySelector('#gm-create-btn').addEventListener('click', () => {
      socket.emit('create-room', { gameLabel: config.gameLabel });
    });
    overlayEl.querySelector('#gm-join-btn').addEventListener('click', () => renderJoinScreen(renderRoomScreen));
    overlayEl.querySelector('#gm-back').addEventListener('click', renderPickMode);
  }

  function renderWaitingForP2(code) {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Room <span>Created</span></h2>
        <p class="gm-sub">Share this code with your friend:</p>
        <div class="gm-code-display" title="Tap to select">${code}</div>
        <p class="gm-code-hint">Tap the code to select and copy it</p>
        <div class="gm-waiting-row">
          <span class="gm-spinner"></span>
          <span>Waiting for opponent to join...</span>
        </div>
        <button class="gm-btn-secondary" id="gm-cancel" type="button">Cancel</button>
      </div>`;
    overlayEl.querySelector('#gm-cancel').addEventListener('click', renderPickMode);
  }

  function renderJoinScreen(backRenderer) {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Join <span>Room</span></h2>
        <p class="gm-sub">Enter the 4-character code from your friend's screen.</p>
        <input id="gm-code-input" class="gm-code-input" type="text"
          maxlength="4" placeholder="XXXX"
          autocomplete="off" autocapitalize="characters" spellcheck="false">
        <p id="gm-join-error" class="gm-join-error"></p>
        <button class="gm-btn-primary" id="gm-join-submit" type="button">Join</button>
        <button class="gm-btn-secondary" id="gm-back" type="button">Back</button>
      </div>`;

    const input = overlayEl.querySelector('#gm-code-input');
    input.focus();
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
    overlayEl.querySelector('#gm-join-submit').addEventListener('click', doJoin);
    overlayEl.querySelector('#gm-back').addEventListener('click', backRenderer || renderRoomScreen);

    function doJoin() {
      const code = input.value.trim().toUpperCase();
      const errEl = document.getElementById('gm-join-error');
      if (code.length < 4) {
        if (errEl) errEl.textContent = 'Please enter the full 4-character code.';
        return;
      }
      if (errEl) errEl.textContent = '';
      socket.emit('join-room', { code });
    }
  }

  function renderLiveCountdown() {
    const tag = myPlayerIndex === 1 ? 'Player 1' : 'Player 2';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-turn-tag">${tag}</div>
        <h2>Get <span>Ready</span></h2>
        <p class="gm-sub">Both players connected. Starting simultaneously...</p>
        <div class="gm-countdown-num" id="gm-countdown">3</div>
      </div>`;

    let n = 3;
    const el = overlayEl.querySelector('#gm-countdown');
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = String(n);
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      } else {
        el.textContent = 'GO';
        clearInterval(tick);
        setTimeout(() => {
          overlayEl.classList.add('gm-hidden');
          mountLiveHud();
          startScorePolling();
          safeStart();
        }, 700);
      }
    }, 900);
  }

  function renderWaitingForResult() {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Round <span>Over</span></h2>
        <p class="gm-sub">Waiting for your opponent to finish...</p>
        <div class="gm-waiting-row">
          <span class="gm-spinner"></span>
          <span>Almost there...</span>
        </div>
      </div>`;
  }

  function renderLiveResults(myScore, oppScore) {
    removeLiveHud();
    phase = 'result';
    overlayEl.classList.remove('gm-hidden');

    const iWon = myScore > oppScore;
    const isDraw = myScore === oppScore;
    const me1 = myPlayerIndex === 1;
    const box1Score = me1 ? myScore : oppScore;
    const box2Score = me1 ? oppScore : myScore;
    const box1Label = me1 ? 'You' : 'Opponent';
    const box2Label = me1 ? 'Opponent' : 'You';
    const box1Wins = box1Score > box2Score;
    const box2Wins = box2Score > box1Score;

    let resultLine;
    if (isDraw) {
      resultLine = '<div class="gm-result-line gm-draw">It is a Draw</div>';
    } else {
      resultLine = `<div class="gm-result-line gm-win"><span>${iWon ? 'You Win' : 'Opponent Wins'}</span></div>`;
    }

    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Game <span>Results</span></h2>
        ${resultLine}
        <div class="gm-score-row">
          <div class="gm-score-box ${box1Wins ? 'gm-winner' : ''}">
            <div class="gm-sname">${box1Label}</div>
            <div class="gm-sval">${box1Score}</div>
          </div>
          <div class="gm-score-box ${box2Wins ? 'gm-winner' : ''}">
            <div class="gm-sname">${box2Label}</div>
            <div class="gm-sval">${box2Score}</div>
          </div>
        </div>
        <button class="gm-btn-primary" id="gm-rematch" type="button">Play Again</button>
        <button class="gm-btn-secondary" id="gm-newroom" type="button">New Room</button>
        <button class="gm-btn-secondary" id="gm-changemode" type="button">Change Mode</button>
      </div>`;

    overlayEl.querySelector('#gm-rematch').addEventListener('click', () => {
      opponentScore = null;
      socket.emit('create-room', { gameLabel: config.gameLabel });
    });
    overlayEl.querySelector('#gm-newroom').addEventListener('click', () => {
      opponentScore = null;
      renderRoomScreen();
    });
    overlayEl.querySelector('#gm-changemode').addEventListener('click', () => {
      if (socket) { socket.disconnect(); socket = null; }
      renderPickMode();
    });
  }

  function renderTournamentRemoteRoomScreen() {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Tournament <span>Live Final</span></h2>
        <p class="gm-sub">Use separate devices. Create or join a room, then both players compete at the same time. Winner is champion.</p>
        <div class="gm-modes">
          <button class="gm-mode-btn" id="gm-create-btn" type="button">
            <span class="gm-mi">&#10133;</span>
            <strong>Create Room</strong>
            <small>Host final match</small>
          </button>
          <button class="gm-mode-btn" id="gm-join-btn" type="button">
            <span class="gm-mi">&#128279;</span>
            <strong>Join Room</strong>
            <small>Enter room code</small>
          </button>
        </div>
        <button class="gm-btn-secondary" id="gm-back" type="button">Back</button>
      </div>`;

    overlayEl.querySelector('#gm-create-btn').addEventListener('click', () => {
      socket.emit('create-room', { gameLabel: `${config.gameLabel} Tournament` });
    });
    overlayEl.querySelector('#gm-join-btn').addEventListener('click', () => renderJoinScreen(renderTournamentRemoteRoomScreen));
    overlayEl.querySelector('#gm-back').addEventListener('click', renderTournamentSetup);
  }

  function renderTournamentRemoteWaiting(code) {
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Tournament <span>Room</span></h2>
        <p class="gm-sub">Share this code with your opponent:</p>
        <div class="gm-code-display" title="Tap to select">${code}</div>
        <p class="gm-code-hint">Tap the code to select and copy it</p>
        <div class="gm-waiting-row">
          <span class="gm-spinner"></span>
          <span>Waiting for opponent to join...</span>
        </div>
        <button class="gm-btn-secondary" id="gm-cancel" type="button">Cancel</button>
      </div>`;
    overlayEl.querySelector('#gm-cancel').addEventListener('click', renderTournamentRemoteRoomScreen);
  }

  function renderTournamentRemoteCountdown() {
    const tag = myPlayerIndex === 1 ? 'Player 1' : 'Player 2';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-turn-tag">${tag}</div>
        <div class="gm-round-pill">Tournament Final</div>
        <h2>Final <span>Starts Now</span></h2>
        <p class="gm-sub">Both finalists connected. Starting simultaneously...</p>
        <div class="gm-countdown-num" id="gm-countdown">3</div>
      </div>`;

    let n = 3;
    const el = overlayEl.querySelector('#gm-countdown');
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = String(n);
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      } else {
        el.textContent = 'GO';
        clearInterval(tick);
        setTimeout(() => {
          overlayEl.classList.add('gm-hidden');
          mountLiveHud();
          startScorePolling();
          safeStart();
        }, 700);
      }
    }, 900);
  }

  function renderTournamentRemoteChampion(myScore, oppScore) {
    removeLiveHud();
    phase = 'champion';
    overlayEl.classList.remove('gm-hidden');

    const draw = myScore === oppScore;
    const iWon = myScore > oppScore;
    let resultText = draw
      ? 'Final tied. Replay to decide champion.'
      : `${iWon ? 'You are' : 'Opponent is'} the tournament champion.`;

    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Tournament Finished</div>
        <h2>${draw ? 'Final <span>Tied</span>' : '<span>Champion</span> Decided'}</h2>
        <p class="gm-sub">${resultText}</p>
        <div class="gm-score-row">
          <div class="gm-score-box ${myScore > oppScore ? 'gm-winner' : ''}">
            <div class="gm-sname">You</div>
            <div class="gm-sval">${myScore}</div>
          </div>
          <div class="gm-score-box ${oppScore > myScore ? 'gm-winner' : ''}">
            <div class="gm-sname">Opponent</div>
            <div class="gm-sval">${oppScore}</div>
          </div>
        </div>
        <button class="gm-btn-primary" id="gm-replay-final" type="button">Replay Final</button>
        <button class="gm-btn-secondary" id="gm-new-tournament" type="button">Tournament Setup</button>
        <button class="gm-btn-secondary" id="gm-change-mode" type="button">Change Mode</button>
      </div>`;

    overlayEl.querySelector('#gm-replay-final').addEventListener('click', () => {
      opponentScore = null;
      renderTournamentRemoteRoomScreen();
    });
    overlayEl.querySelector('#gm-new-tournament').addEventListener('click', renderTournamentSetup);
    overlayEl.querySelector('#gm-change-mode').addEventListener('click', renderPickMode);
  }

  function renderTurnReady(playerNum, prevScore) {
    phase = playerNum === 1 ? 'p1' : 'p2';
    overlayEl.classList.remove('gm-hidden');

    const p1Block = prevScore !== null
      ? `<div class="gm-score-row">
           <div class="gm-score-box">
             <div class="gm-sname">Player 1 Score</div>
             <div class="gm-sval">${prevScore}</div>
           </div>
         </div>`
      : '';

    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-turn-tag">Player ${playerNum} of 2</div>
        <h2>Player <span>${playerNum}</span>, you are up</h2>
        <p class="gm-sub">Hand the device to Player ${playerNum}. Press Play when ready.</p>
        ${p1Block}
        <button class="gm-btn-primary" id="gm-turnstart" type="button">Play</button>
      </div>`;

    overlayEl.querySelector('#gm-turnstart').addEventListener('click', () => {
      overlayEl.classList.add('gm-hidden');
      if (playerNum === 2) safeReset();
      safeStart();
    });
  }

  function renderHotseatResult(p1, p2) {
    phase = 'result';
    overlayEl.classList.remove('gm-hidden');

    const p1Wins = p1 > p2;
    const p2Wins = p2 > p1;
    const draw = p1 === p2;

    let resultLine;
    if (draw) {
      resultLine = '<div class="gm-result-line gm-draw">It is a Draw</div>';
    } else {
      resultLine = `<div class="gm-result-line gm-win"><span>Player ${p1Wins ? 1 : 2}</span> Wins</div>`;
    }

    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Round <span>Results</span></h2>
        ${resultLine}
        <div class="gm-score-row">
          <div class="gm-score-box ${p1Wins ? 'gm-winner' : ''}">
            <div class="gm-sname">Player 1</div>
            <div class="gm-sval">${p1}</div>
          </div>
          <div class="gm-score-box ${p2Wins ? 'gm-winner' : ''}">
            <div class="gm-sname">Player 2</div>
            <div class="gm-sval">${p2}</div>
          </div>
        </div>
        <button class="gm-btn-primary" id="gm-rematch" type="button">Play Again</button>
        <button class="gm-btn-secondary" id="gm-changemode" type="button">Change Mode</button>
      </div>`;

    overlayEl.querySelector('#gm-rematch').addEventListener('click', () => renderTurnReady(1, null));
    overlayEl.querySelector('#gm-changemode').addEventListener('click', renderPickMode);
  }

  function renderTournamentSetup() {
    phase = 'tournament-setup';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <h2>Tournament <span>Setup</span></h2>
        <p class="gm-sub">Choose device mode and bracket setup. Winners keep advancing until one champion remains.</p>
        <div class="gm-size-row">
          <button class="gm-size-btn ${tournamentDevice === 'same' ? 'gm-selected' : ''}" data-device="same" type="button">Same Device</button>
          <button class="gm-size-btn ${tournamentDevice === 'different' ? 'gm-selected' : ''}" data-device="different" type="button">Different Devices</button>
        </div>
        <div class="gm-size-row">
          <button class="gm-size-btn ${tournamentSize === 4 ? 'gm-selected' : ''}" data-size="4" type="button" ${tournamentDevice === 'different' ? 'disabled' : ''}>4 Players</button>
          <button class="gm-size-btn ${tournamentSize === 8 ? 'gm-selected' : ''}" data-size="8" type="button" ${tournamentDevice === 'different' ? 'disabled' : ''}>8 Players</button>
        </div>
        <p class="gm-sub" id="gm-tourney-note" style="margin-top:-8px;">
          ${tournamentDevice === 'same'
            ? 'Same device supports full 4/8-player elimination bracket.'
            : 'Different devices runs a live 2-player tournament final.'}
        </p>
        <button class="gm-btn-primary" id="gm-start-tournament" type="button">Start Tournament</button>
        <button class="gm-btn-secondary" id="gm-back" type="button">Back</button>
      </div>`;

    overlayEl.querySelectorAll('[data-device]').forEach((btn) => {
      btn.addEventListener('click', () => {
        tournamentDevice = btn.dataset.device || 'same';
        renderTournamentSetup();
      });
    });

    overlayEl.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.size) return;
        tournamentSize = Number(btn.dataset.size || 4);
        overlayEl.querySelectorAll('[data-size]').forEach((b) => b.classList.remove('gm-selected'));
        btn.classList.add('gm-selected');
      });
    });

    overlayEl.querySelector('#gm-start-tournament').addEventListener('click', startTournament);
    overlayEl.querySelector('#gm-back').addEventListener('click', renderPickMode);
  }

  function startTournament() {
    resetTournamentState();

    if (tournamentDevice === 'different') {
      if (!isServerMode) {
        showError('Different-device tournament needs the app running on the server URL.');
        return;
      }
      tournamentRemote = true;
      tournamentPlayers = ['Player 1', 'Player 2'];
      tournamentRound = 1;
      loadSocketIO(() => {
        connectSocket();
        renderTournamentRemoteRoomScreen();
      });
      return;
    }

    for (let i = 1; i <= tournamentSize; i += 1) {
      tournamentPlayers.push(`Player ${i}`);
    }
    tournamentRound = 1;
    startTournamentRound();
  }

  function startTournamentRound() {
    if (tournamentPlayers.length === 1) {
      renderTournamentChampion(tournamentPlayers[0]);
      return;
    }
    tournamentRoundPlayers = tournamentPlayers.slice();
    tournamentNextPlayers = [];
    tournamentMatchIndex = 0;
    renderTournamentMatchStart();
  }

  function renderTournamentMatchStart() {
    const playerA = tournamentRoundPlayers[tournamentMatchIndex];
    const playerB = tournamentRoundPlayers[tournamentMatchIndex + 1];
    tournamentMatch = { a: playerA, b: playerB, aScore: 0, bScore: 0 };
    phase = 'tourney-p1';

    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Round ${tournamentRound}</div>
        <div class="gm-turn-tag">Match ${(tournamentMatchIndex / 2) + 1}</div>
        <h2>${playerA} <span>vs</span> ${playerB}</h2>
        <p class="gm-sub">${playerA} plays first. Winner advances to the next round.</p>
        <button class="gm-btn-primary" id="gm-tourney-start-p1" type="button">Start ${playerA}</button>
      </div>`;

    overlayEl.querySelector('#gm-tourney-start-p1').addEventListener('click', () => {
      overlayEl.classList.add('gm-hidden');
      safeReset();
      safeStart();
    });
  }

  function renderTournamentSecondTurn() {
    if (!tournamentMatch) return;
    phase = 'tourney-p2';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Round ${tournamentRound}</div>
        <div class="gm-turn-tag">${tournamentMatch.b} Turn</div>
        <h2>${tournamentMatch.b}, <span>you are up</span></h2>
        <p class="gm-sub">${tournamentMatch.a} scored ${tournamentMatch.aScore}. Beat that to advance.</p>
        <button class="gm-btn-primary" id="gm-tourney-start-p2" type="button">Start ${tournamentMatch.b}</button>
      </div>`;

    overlayEl.querySelector('#gm-tourney-start-p2').addEventListener('click', () => {
      overlayEl.classList.add('gm-hidden');
      safeReset();
      safeStart();
    });
  }

  function renderTournamentMatchResult() {
    if (!tournamentMatch) return;
    phase = 'tourney-result';
    overlayEl.classList.remove('gm-hidden');

    const draw = tournamentMatch.aScore === tournamentMatch.bScore;

    if (draw) {
      overlayEl.innerHTML = `
        <div class="gm-card">
          <div class="gm-round-pill">Round ${tournamentRound}</div>
          <h2>Match <span>Tied</span></h2>
          <p class="gm-sub">${tournamentMatch.a} and ${tournamentMatch.b} are tied at ${tournamentMatch.aScore}. Replay this match.</p>
          <button class="gm-btn-primary" id="gm-tie-replay" type="button">Replay Match</button>
        </div>`;
      overlayEl.querySelector('#gm-tie-replay').addEventListener('click', renderTournamentMatchStart);
      return;
    }

    const winner = tournamentMatch.aScore > tournamentMatch.bScore ? tournamentMatch.a : tournamentMatch.b;
    const aWins = winner === tournamentMatch.a;
    tournamentNextPlayers.push(winner);

    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Round ${tournamentRound}</div>
        <h2><span>${winner}</span> Advances</h2>
        <div class="gm-score-row">
          <div class="gm-score-box ${aWins ? 'gm-winner' : ''}">
            <div class="gm-sname">${tournamentMatch.a}</div>
            <div class="gm-sval">${tournamentMatch.aScore}</div>
          </div>
          <div class="gm-score-box ${!aWins ? 'gm-winner' : ''}">
            <div class="gm-sname">${tournamentMatch.b}</div>
            <div class="gm-sval">${tournamentMatch.bScore}</div>
          </div>
        </div>
        <button class="gm-btn-primary" id="gm-next-match" type="button">Continue</button>
      </div>`;

    overlayEl.querySelector('#gm-next-match').addEventListener('click', () => {
      tournamentMatchIndex += 2;
      if (tournamentMatchIndex < tournamentRoundPlayers.length) {
        renderTournamentMatchStart();
      } else {
        tournamentPlayers = tournamentNextPlayers.slice();
        tournamentRound += 1;
        renderTournamentRoundSummary();
      }
    });
  }

  function renderTournamentRoundSummary() {
    const playersText = tournamentPlayers.join(', ');
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Round Complete</div>
        <h2>Next <span>Round</span></h2>
        <p class="gm-sub">Advancing players: ${playersText}</p>
        <button class="gm-btn-primary" id="gm-start-next-round" type="button">Start Round ${tournamentRound}</button>
      </div>`;

    overlayEl.querySelector('#gm-start-next-round').addEventListener('click', startTournamentRound);
  }

  function renderTournamentChampion(champion) {
    phase = 'champion';
    overlayEl.classList.remove('gm-hidden');
    overlayEl.innerHTML = `
      <div class="gm-card">
        <div class="gm-round-pill">Tournament Finished</div>
        <h2><span>${champion}</span> is Champion</h2>
        <p class="gm-sub">All rounds complete. One overall winner remains.</p>
        <button class="gm-btn-primary" id="gm-new-tournament" type="button">New Tournament</button>
        <button class="gm-btn-secondary" id="gm-change-mode" type="button">Change Mode</button>
      </div>`;

    overlayEl.querySelector('#gm-new-tournament').addEventListener('click', renderTournamentSetup);
    overlayEl.querySelector('#gm-change-mode').addEventListener('click', renderPickMode);
  }

  function mountLiveHud() {
    removeLiveHud();
    liveHudEl = document.createElement('div');
    liveHudEl.id = 'gm-live-hud';
    liveHudEl.innerHTML = `
      <div class="gm-hud-you-col">
        <span class="gm-hud-label">You</span>
        <span class="gm-hud-val" id="gm-hud-you">0</span>
      </div>
      <span class="gm-hud-sep">vs</span>
      <div class="gm-hud-opp-col">
        <span class="gm-hud-label">Opponent</span>
        <span class="gm-hud-val" id="gm-hud-opp">-</span>
      </div>`;
    document.body.appendChild(liveHudEl);
  }

  function updateLiveHud() {
    const youEl = document.getElementById('gm-hud-you');
    const oppEl = document.getElementById('gm-hud-opp');
    if (youEl && config.getScore) youEl.textContent = String(config.getScore());
    if (oppEl) oppEl.textContent = opponentScore !== null ? String(opponentScore) : '-';
  }

  function removeLiveHud() {
    if (liveHudEl) { liveHudEl.remove(); liveHudEl = null; }
  }

  function startScorePolling() {
    stopScorePolling();
    if (!config.getScore || !socket) return;
    scoreInterval = setInterval(() => {
      const s = config.getScore();
      socket.emit('score-update', { code: roomCode, score: s });
      updateLiveHud();
    }, 1200);
  }

  function stopScorePolling() {
    if (scoreInterval) { clearInterval(scoreInterval); scoreInterval = null; }
  }

  window.GameModes = {
    /**
     * @param {{ gameLabel: string, startFn: Function, resetFn: Function, getScore?: () => number }} cfg
     */
    init(cfg) {
      config = cfg;
      injectStyles();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountOrAutoLaunch);
      } else {
        mountOrAutoLaunch();
      }
    },

    /**
     * Call when the current game round ends.
     * @param {number} score
     */
    roundEnd(score) {
      if (!config) return;

      if (activeMode === 'hotseat') {
        if (phase === 'p1') {
          p1Score = score;
          renderTurnReady(2, p1Score);
        } else if (phase === 'p2') {
          recordGameplay(Math.max(Number(p1Score) || 0, Number(score) || 0));
          renderHotseatResult(p1Score, score);
        }
      } else if (activeMode === 'live') {
        recordGameplay(score);
        stopScorePolling();
        updateLiveHud();
        if (socket) socket.emit('round-end', { code: roomCode, score });
        renderWaitingForResult();
      } else if (activeMode === 'tournament') {
        if (tournamentRemote) {
          recordGameplay(score);
          stopScorePolling();
          updateLiveHud();
          if (socket) socket.emit('round-end', { code: roomCode, score });
          renderWaitingForResult();
          return;
        }
        if (!tournamentMatch) return;
        if (phase === 'tourney-p1') {
          tournamentMatch.aScore = score;
          renderTournamentSecondTurn();
        } else if (phase === 'tourney-p2') {
          tournamentMatch.bScore = score;
          recordGameplay(Math.max(Number(tournamentMatch.aScore) || 0, Number(tournamentMatch.bScore) || 0));
          renderTournamentMatchResult();
        }
      } else if (activeMode === 'single') {
        recordGameplay(score);
      }
    }
  };
}());
