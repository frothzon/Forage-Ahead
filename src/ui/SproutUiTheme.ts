export const SPROUT_UI_CSS = `
  :root {
    --ui-scale: 2;
    --sl-text-dark: #3b2316;
    --sl-text-med: #5c3a24;
    --sl-text-muted: #7a5438;
    --sl-text-light: #fff6e5;
    --sl-text-gold: #ffe066;
    --sl-accent-green: #2c6e31;
    --sl-accent-red: #9e2a35;
  }

  .px-icon {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    object-fit: contain;
    flex-shrink: 0;
  }

  .sl-font-display {
    font-family: 'SproutLandsDisplay', 'SproutLandsUI', monospace, sans-serif;
  }

  .sl-font-compact {
    font-family: 'SproutLandsCompact', 'SproutLandsUI', monospace, sans-serif;
  }

  .sl-pixel-text {
    font-family: 'SproutLandsUI', 'SproutLandsDisplay', monospace;
    -webkit-font-smoothing: none;
    font-smooth: never;
  }

  .hud-panel-wood {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/panels/panel_wood_tan.png');
    border-image-slice: 4 4 8 4 fill;
    border-image-width: calc(4px * var(--ui-scale)) calc(4px * var(--ui-scale)) calc(8px * var(--ui-scale)) calc(4px * var(--ui-scale));
    border-image-repeat: stretch;
    border-width: calc(4px * var(--ui-scale)) calc(4px * var(--ui-scale)) calc(8px * var(--ui-scale)) calc(4px * var(--ui-scale));
    background: transparent;
    color: var(--sl-text-dark);
    box-shadow: 0 6px 18px rgba(16, 10, 4, 0.45);
    image-rendering: pixelated;
  }

  .hud-panel {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/docks/tray_med_enclosed.png');
    border-image-slice: 5 5 7 5 fill;
    border-image-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    border-image-repeat: stretch;
    border-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    background: transparent;
    color: var(--sl-text-dark);
    text-shadow: 0 1px 0 rgba(255, 246, 229, 0.72);
    box-shadow: 0 6px 18px rgba(16, 10, 4, 0.45);
    image-rendering: pixelated;
  }

  .hud-panel-inset {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/docks/tray_dark_enclosed.png');
    border-image-slice: 5 5 7 5 fill;
    border-image-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    border-image-repeat: stretch;
    border-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    background: transparent;
    color: var(--sl-text-light);
    text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109, 0 2px 3px rgba(0, 0, 0, 0.55);
    image-rendering: pixelated;
  }

  .hud-dock-light {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/docks/tray_light_enclosed.png');
    border-image-slice: 5 5 7 5 fill;
    border-image-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    border-image-repeat: stretch;
    border-width: calc(5px * var(--ui-scale)) calc(5px * var(--ui-scale)) calc(7px * var(--ui-scale)) calc(5px * var(--ui-scale));
    background: transparent;
    color: var(--sl-text-dark);
    text-shadow: 0 1px 0 rgba(255, 246, 229, 0.72);
    image-rendering: pixelated;
  }

  .sl-frame-wood {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/frames/backdrop_a1.png');
    border-image-slice: 7 7 7 7 fill;
    border-image-width: 14px 14px 14px 14px;
    border-width: 7px;
    background: transparent;
    image-rendering: pixelated;
  }

  .sl-frame-wood-dark {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/frames/backdrop_c1.png');
    border-image-slice: 7 7 7 7 fill;
    border-image-width: 14px 14px 14px 14px;
    border-width: 7px;
    background: transparent;
    image-rendering: pixelated;
  }

  .sl-frame-big {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/frames/backdrop_big1.png');
    border-image-slice: 19 19 19 19 fill;
    border-image-width: 24px 24px 24px 24px;
    border-width: 14px;
    background: transparent;
    image-rendering: pixelated;
  }

  .hud-btn {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_light_normal.png');
    border-image-slice: 4 4 6 4 fill;
    border-image-width: 8px 8px 12px 8px;
    border-image-repeat: stretch;
    border-width: 5px 7px 8px 7px;
    background: transparent;
    color: var(--sl-text-dark);
    font-family: 'SproutLandsUI', monospace, sans-serif;
    -webkit-font-smoothing: none;
    font-smooth: never;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    image-rendering: pixelated;
    transition: filter 90ms ease, transform 70ms ease;
    text-shadow: 0 1px 0 rgba(255, 250, 235, 0.55);
  }
  .hud-btn:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .hud-btn:active:not(:disabled),
  .hud-btn.is-pressed {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_light_pressed.png');
    border-image-slice: 3 4 4 4 fill;
    border-image-width: 6px 8px 8px 8px;
    transform: translateY(2px);
  }
  .hud-btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    filter: grayscale(0.35);
  }
  .hud-btn.primary {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_white_normal.png');
    color: #214f26;
  }
  .hud-btn.primary:active:not(:disabled) {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_white_pressed.png');
    border-image-slice: 3 4 4 4 fill;
    border-image-width: 6px 8px 8px 8px;
  }
  .hud-btn.gold,
  .hud-btn.tan {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_tan_normal.png');
    color: #3b2316;
  }
  .hud-btn.gold:active:not(:disabled),
  .hud-btn.tan:active:not(:disabled) {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_tan_pressed.png');
    border-image-slice: 3 4 4 4 fill;
    border-image-width: 6px 8px 8px 8px;
  }
  .hud-btn.danger {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_dark_normal.png');
    color: #ffd8dc;
    text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109, 0 1px 2px rgba(0, 0, 0, 0.55);
  }
  .hud-btn.danger:active:not(:disabled) {
    border-image-source: url('assets/sprout_ui/buttons/rect_wide_dark_pressed.png');
    border-image-slice: 3 4 4 4 fill;
    border-image-width: 6px 8px 8px 8px;
  }

  .sl-icon-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    background-color: transparent;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    image-rendering: pixelated;
    cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sl-icon-btn:hover:not(:disabled) { filter: brightness(1.07); }
  .sl-icon-btn:active:not(:disabled) { transform: translateY(1px); }

  .bar-track {
    width: 148px;
    height: 16px;
    border-style: solid;
    border-image-source: url('assets/sprout_ui/bars/bar_frame_empty_lg.png');
    border-image-slice: 3 4 3 4 fill;
    border-image-width: 4px 6px 4px 6px;
    border-width: 3px 5px;
    background: transparent;
    image-rendering: pixelated;
    overflow: hidden;
    position: relative;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.48), 0 1px 0 rgba(255, 246, 229, 0.22);
  }
  .bar-fill {
    height: 100%;
    position: relative;
    z-index: 1;
    transition: width 120ms ease, filter 120ms ease;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36), inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  }
  .bar-fill::after {
    content: '';
    position: absolute;
    top: 1px;
    right: 0;
    bottom: 1px;
    width: 2px;
    background: rgba(255, 255, 240, 0.55);
    pointer-events: none;
  }
  .bar-ghost {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 0;
    background: linear-gradient(90deg, rgba(255, 245, 200, 0.9), rgba(255, 196, 86, 0.95));
    transition: width 380ms cubic-bezier(0.22, 1, 0.36, 1) 200ms;
    pointer-events: none;
  }
  .bar-track.bar-hit {
    animation: hpBarShake 180ms ease-out;
  }
  .bar-fill.hp-hit-flash {
    animation: hpHitFlash 180ms ease-out;
  }
  .bar-fill.hp-heal-pulse {
    animation: hpHealPulse 340ms ease-out;
  }
  .bar-fill.hp-low-pulse {
    animation: hpLowHeartbeat 1.05s ease-in-out infinite;
  }
  #hud-hp-heart.heart-low-pulse {
    animation: hpHeartPulse 1.05s ease-in-out infinite;
  }
  @keyframes hpBarShake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-2px); }
    50% { transform: translateX(2px); }
    75% { transform: translateX(-1px); }
  }
  @keyframes hpHitFlash {
    0% { filter: brightness(2.2) saturate(0.4); }
    100% { filter: brightness(1) saturate(1); }
  }
  @keyframes hpHealPulse {
    0% { filter: brightness(1.55) drop-shadow(0 0 4px rgba(130, 235, 106, 0.85)); }
    100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
  }
  @keyframes hpLowHeartbeat {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.28) drop-shadow(0 0 4px rgba(255, 72, 88, 0.75)); }
  }
  @keyframes hpHeartPulse {
    0%, 100% { transform: scale(1); }
    35% { transform: scale(1.22); }
    65% { transform: scale(0.95); }
  }
  @keyframes modalSpringPop {
    0% { transform: scale(0.985); opacity: 0.86; }
    65% { transform: scale(1.003); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes tabSoftJiggle {
    0% { transform: translateY(1px) scale(1.015, 0.985); }
    55% { transform: translateY(2px) scale(0.996, 1.004); }
    100% { transform: translateY(2px) scale(1); }
  }
  @keyframes hotbarPop {
    0% { transform: translateY(-3px) scale(0.92); }
    60% { transform: translateY(-4px) scale(1.1); }
    100% { transform: translateY(-3px) scale(1); }
  }
  @keyframes raritySheen {
    0%, 72% { transform: translateX(-140%) rotate(25deg); opacity: 0; }
    78% { opacity: 0.55; }
    100% { transform: translateX(180%) rotate(25deg); opacity: 0; }
  }
  @keyframes craftPopJuice {
    0% { transform: translate(-50%, 6px) scale(0.35); opacity: 0; }
    18% { transform: translate(-50%, -14px) scale(1.22); opacity: 1; }
    32% { transform: translate(-50%, -18px) scale(0.94); opacity: 1; }
    46% { transform: translate(-50%, -22px) scale(1.04); opacity: 1; }
    78% { transform: translate(-50%, -36px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -56px) scale(0.88); opacity: 0; }
  }
  @keyframes craftSparkleOut {
    0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1.1); opacity: 0; }
  }
  .craft-pop-fx {
    position: fixed;
    z-index: 12000;
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 7px;
    border-radius: 10px;
    background: linear-gradient(180deg, #3c2617 0%, #24160d 100%);
    border: 2px solid #f7c95c;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 214, 102, 0.55);
    color: #fff6da;
    font-weight: 900;
    font-size: 13px;
    white-space: nowrap;
    animation: craftPopJuice 1150ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .craft-pop-fx .craft-pop-plus {
    color: #ffe066;
    font-size: 14px;
    text-shadow: 0 1px 0 #1b1109, 0 0 8px rgba(255, 224, 102, 0.7);
  }
  .craft-pop-spark {
    position: fixed;
    z-index: 11999;
    pointer-events: none;
    color: #ffe066;
    font-size: 11px;
    font-weight: 900;
    text-shadow: 0 0 6px #ffcf40;
    animation: craftSparkleOut 620ms ease-out forwards;
  }
  .bar-fill.hp { background-image: url('assets/sprout_ui/bars/bar_fill_red.png'); }
  .bar-fill.en { background-image: url('assets/sprout_ui/bars/bar_fill_green.png'); }
  .bar-fill.xp { background-image: url('assets/sprout_ui/bars/bar_fill_blue.png'); }

  .sl-range {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    background: url('assets/sprout_ui/controls/slider_h_track_thick.png') no-repeat center / 100% 100%;
    outline: none;
    image-rendering: pixelated;
  }
  .sl-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 16px;
    background: url('assets/sprout_ui/controls/slider_h_thumb_light.png') no-repeat center / 100% 100%;
    cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_holding_2x.png') 8 8, grab;
    border: none;
    image-rendering: pixelated;
  }

  .ledger-body::-webkit-scrollbar,
  .sl-scroll::-webkit-scrollbar {
    width: 16px;
    height: 16px;
  }
  .ledger-body::-webkit-scrollbar-track,
  .sl-scroll::-webkit-scrollbar-track {
    background: url('assets/sprout_ui/controls/scrollbar_v_track_thick.png') no-repeat center / 10px calc(100% - 8px);
    image-rendering: pixelated;
  }
  .ledger-body::-webkit-scrollbar-thumb,
  .sl-scroll::-webkit-scrollbar-thumb {
    border-style: solid;
    border-image-source: url('assets/sprout_ui/controls/scrollbar_v_thumb_med.png');
    border-image-slice: 4 4 5 4 fill;
    border-image-width: 8px 8px 10px 8px;
    border-width: 4px;
    background: transparent;
    image-rendering: pixelated;
    min-height: 36px;
  }
  .ledger-body::-webkit-scrollbar-thumb:hover,
  .sl-scroll::-webkit-scrollbar-thumb:hover {
    border-image-source: url('assets/sprout_ui/controls/scrollbar_v_thumb_light.png');
  }
  .ledger-body::-webkit-scrollbar-thumb:active,
  .sl-scroll::-webkit-scrollbar-thumb:active {
    border-image-source: url('assets/sprout_ui/controls/scrollbar_v_thumb_dark.png');
  }
  .ledger-body::-webkit-scrollbar-corner,
  .sl-scroll::-webkit-scrollbar-corner {
    background: transparent;
  }
`;
