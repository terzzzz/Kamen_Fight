// SAFE GLOBAL DECLARATIONS (Prevents ES6 redeclaration SyntaxError)
var CHARGE_TIMES = CHARGE_TIMES || {
  'A': 800,   // Defense
  'D': 1300,  // Offense
  'W': 2000,  // Air/Buffs
  'S': 2600   // Energy/Specials
};

var DO_NOTHING_MOVE = DO_NOTHING_MOVE || {
  name: "Do Nothing",
  type: "IDLE",
  chiCost: 0,
  baseDamage: 0,
  hitChance: 100,
  video: "idle.mp4"
};

var FAINT_CONFIG = FAINT_CONFIG || {
  HIT_BUILDUP: 25,       // Faint meter added per clean hit
  ROUND_RECOVERY: 13,    // Points recovered per round if NOT hurt
  FAINT_THRESHOLD: 100   // Faint meter max limit
};

let gameState = {
  roundCounter: 1,
  roundPhase: 'IDLE',
  turnTimerSeconds: 5,
  timerInterval: null,
  p1Moves: {},
  p2Moves: {},
  videoCache: {}, // Memory cache for preloaded MP4 blobs
  p1: null,
  p2: null,
  p2AlwaysIdle: false, // Dummy Mode Toggle (Key '0')
  canContinueFromGameOver: false,
  p2SelectedMoveKey: null,
  p2LockInTime: 0,
  p2IsConfirmed: false,
  p2ActiveChargePercent: 100,
  input: {
    heldDirection: null,
    chargeStartTime: 0,
    currentPercent: 0,
    isConfirmed: false,
    selectedMoveKey: null,
    lockInTime: 0,
    chargeInterval: null
  }
};

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return DO_NOTHING_MOVE;
  const moves = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  return (moves && moves[moveKey]) || DO_NOTHING_MOVE;
}

async function startBattle(config) {
  const p1RiderId = (config.p1Rider && config.p1Rider.id) || 'ichigo';
  const p2RiderId = (config.p2Rider && config.p2Rider.id) || 'ichigo';

  try {
    const response = await fetch('data/moves.json');
    const fullRoster = await response.json();
    
    gameState.p1Moves = fullRoster[p1RiderId] || fullRoster['ichigo'] || {};
    gameState.p2Moves = fullRoster[p2RiderId] || fullRoster['ichigo'] || {};
  } catch (err) {
    console.warn("Could not load moves.json, using fallback data.");
    gameState.p1Moves = {};
    gameState.p2Moves = {};
  }

  gameState.p1 = createPlayerState(config.p1Rider, config.p1IsCPU);
  gameState.p2 = createPlayerState(config.p2Rider, config.p2IsCPU);
  gameState.p2AlwaysIdle = false;
  gameState.roundCounter = 1;
  gameState.canContinueFromGameOver = false;

  const battleScreen = document.getElementById('battle-screen');
  if (battleScreen) battleScreen.hidden = false;

  const splashScreen = document.getElementById('match-transition-screen');
  const splashRound = document.getElementById('splash-round-text');
  const splashNames = document.getElementById('splash-names-text');

  if (splashScreen) {
    if (splashRound) splashRound.textContent = "PRELOADING ASSETS...";
    if (splashNames) splashNames.textContent = `${gameState.p1.name} VS ${gameState.p2.name}`;
    splashScreen.hidden = false;
  }

  bindKeyboardInputs();
  bindCommandButtons();
  updateHUD();

  await preloadRiderVideos(p1RiderId, gameState.p1Moves);
  if (p1RiderId !== p2RiderId) {
    await preloadRiderVideos(p2RiderId, gameState.p2Moves);
  }

  updateCharacterMedia('p1', 'IDLE');
  updateCharacterMedia('p2', 'IDLE');

  if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";

  setTimeout(() => {
    if (splashScreen) splashScreen.hidden = true;
    startRoundCountdown();
  }, 1800);
}

function createPlayerState(riderConfig, isCPU) {
  return {
    ...riderConfig,
    isCPU: isCPU,
    lp: riderConfig.maxLp || 1050,
    chi: 10,
    maxChi: 16,
    faintMeter: 0,
    tookCleanHitThisRound: false,
    isFainted: false,
    willBeFaintedNextRound: false,
    airborneTicks: 0,
    activeChargePercent: 100,
    activeBuffs: []
  };
}

function startRoundCountdown() {
  gameState.roundPhase = 'INPUT';
  resetTurnInputState();

  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (!player) return;

    if (player.willBeFaintedNextRound) {
      player.isFainted = true;
      player.willBeFaintedNextRound = false;
      player.faintMeter = 0;
    }

    const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
    const statusEl = document.getElementById(`${slot}-status`);

    if (player.isFainted) {
      if (stunOverlay) stunOverlay.hidden = false;
      if (statusEl) statusEl.textContent = 'FAINTED';
    } else if (slot === 'p2' && gameState.p2AlwaysIdle) {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'DUMMY (IDLE)';
    } else {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'NORMAL';
    }
  });

  updateHUD();
  setSideBoxesBlank(false);
  hideCenterScreen();

  updateCharacterMedia('p1', 'IDLE');
  updateCharacterMedia('p2', 'IDLE');

  if (gameState.p1 && gameState.p1.isFainted && !gameState.p1.isCPU) {
    confirmPlayerAction('DO_NOTHING', 'p1');
  }
  if (gameState.p2 && gameState.p2.isFainted && !gameState.p2.isCPU) {
    confirmPlayerAction('DO_NOTHING', 'p2');
  }

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.textContent = `ROUND ${gameState.roundCounter}: READY!`;
  }

  setTimeout(() => {
    if (gameState.roundPhase === 'INPUT' && battleMsg) {
      battleMsg.hidden = true;
    }
  }, 1200);

  clearInterval(gameState.timerInterval);
  gameState.turnTimerSeconds = 5;

  const timerEl = document.getElementById('turn-timer');
  if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

  // Schedule automated CPU actions with realistic thinking delay (0.8s - 1.5s)
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (player && player.isCPU && !player.isFainted) {
      if (slot === 'p2' && gameState.p2AlwaysIdle) return;

      const thinkDelay = Math.floor(Math.random() * 700 + 800);
      setTimeout(() => {
        if (gameState.roundPhase !== 'INPUT') return;
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const moveKey = getCPUMoveChoice(player, gameState[oppSlot], slot);
        player.activeChargePercent = moveKey === 'DO_NOTHING' ? 0 : Math.floor(Math.random() * 26 + 75);
        confirmPlayerAction(moveKey, slot);
        simulateCPUButtonPress(moveKey);
      }, thinkDelay);
    }
  });

  gameState.timerInterval = setInterval(() => {
    if (gameState.roundPhase !== 'INPUT') return;

    gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

    if (gameState.turnTimerSeconds <= 0) {
      clearInterval(gameState.timerInterval);

      if (!gameState.input.isConfirmed && !gameState.p1.isCPU) {
        confirmPlayerAction('DO_NOTHING', 'p1');
      }
      if (!gameState.p2IsConfirmed && !gameState.p2.isCPU) {
        confirmPlayerAction('DO_NOTHING', 'p2');
      }
      executeTurnResolutionPhase();
    }
  }, 1000);
}

function returnToCharSelect() {
  gameState.roundPhase = 'IDLE';
  gameState.canContinueFromGameOver = false;

  ['p1', 'p2'].forEach(slot => {
    const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
    if (stunOverlay) stunOverlay.hidden = true;
  });

  const battleScreen = document.getElementById('battle-screen');
  if (battleScreen) battleScreen.hidden = true;

  const selectScreen = document.getElementById('vs-select-screen');
  if (selectScreen) selectScreen.hidden = false;

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) battleMsg.hidden = true;

  if (typeof stopBattleBGM === 'function') stopBattleBGM();
  if (typeof playSelectionBGM === 'function') playSelectionBGM();

  if (typeof vsSelectionState !== 'undefined') {
    vsSelectionState.step = 1;
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
  }
}

function bindKeyboardInputs() {
  const handleContinue = () => {
    if (gameState.roundPhase === 'GAME_OVER' && gameState.canContinueFromGameOver) {
      returnToCharSelect();
    }
  };

  window.addEventListener('keydown', (e) => {
    if (gameState.roundPhase === 'GAME_OVER') {
      handleContinue();
      return;
    }

    const key = e.key.toUpperCase();

    if (e.key === '0') {
      gameState.p2AlwaysIdle = !gameState.p2AlwaysIdle;
      const statusEl = document.getElementById('p2-status');
      
      if (statusEl) {
        if (gameState.p2AlwaysIdle) {
          statusEl.textContent = 'DUMMY (IDLE)';
          statusEl.style.color = '#ffcc00';
        } else {
          statusEl.textContent = gameState.p2 && gameState.p2.isFainted ? 'FAINTED' : 'NORMAL';
          statusEl.style.color = '#00ffcc';
        }
      }
      return;
    }

    const keyEl = document.getElementById(`key-${key}`);
    if (keyEl) keyEl.classList.add('active');

    if (gameState.roundPhase !== 'INPUT' || gameState.p1.isCPU || gameState.input.isConfirmed || gameState.p1.isFainted) return;

    if (['A', 'D', 'W', 'S'].includes(key)) {
      if (gameState.input.heldDirection !== key) {
        resetCharge();
        gameState.input.heldDirection = key;
        gameState.input.chargeStartTime = Date.now();
        gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);
      }
    }

    if (['J', 'K', 'L', 'I'].includes(key)) {
      if (!gameState.input.heldDirection) return;
      confirmPlayerAction(`${gameState.input.heldDirection}+${key}`, 'p1');
    }
  });

  window.addEventListener('click', handleContinue);

  window.addEventListener('keyup', (e) => {
    const key = e.key.toUpperCase();

    const keyEl = document.getElementById(`key-${key}`);
    if (keyEl) keyEl.classList.remove('active');

    if (key === gameState.input.heldDirection && !gameState.input.isConfirmed) {
      resetCharge();
    }
  });
}

function updateChargeProgress() {
  if (!gameState.input.heldDirection || gameState.roundPhase !== 'INPUT' || (gameState.p1 && gameState.p1.isFainted)) return;

  let duration = CHARGE_TIMES[gameState.input.heldDirection];
  
  if (gameState.p1 && gameState.p1.activeBuffs && gameState.p1.activeBuffs.some(b => b.id === 'charge_speed')) {
    duration = duration * 0.75;
  }

  const elapsed = Date.now() - gameState.input.chargeStartTime;
  gameState.input.currentPercent = Math.min(100, Math.floor((elapsed / duration) * 100));

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill') || document.querySelector('.charge-fill');
  if (fillEl) {
    fillEl.style.width = `${gameState.input.currentPercent}%`;
    fillEl.textContent = `${gameState.input.currentPercent}%`;
  }

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = `CHARGING [${gameState.input.heldDirection}]: ${gameState.input.currentPercent}%`;
    statusEl.style.color = gameState.input.currentPercent >= 100 ? '#00ffcc' : '#ffcc00';
  }
}

function resetCharge() {
  clearInterval(gameState.input.chargeInterval);
  gameState.input.heldDirection = null;
  gameState.input.currentPercent = 0;

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill') || document.querySelector('.charge-fill');
  if (fillEl) {
    fillEl.style.width = '0%';
    fillEl.textContent = '0%';
  }

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = 'HOLD DIRECTION TO CHARGE';
    statusEl.style.color = '#00ffcc';
  }
}

function confirmPlayerAction(moveKey, playerKey = 'p1') {
  const player = gameState[playerKey];
  if (!player) return;

  if (moveKey !== 'DO_NOTHING') {
    const move = getMoveForPlayer(playerKey, moveKey);
    const chiCost = move.chiCost || 0;

    if (player.chi < chiCost) {
      triggerFloatingText(playerKey, 'NOT ENOUGH CHI!', 'miss');

      const statusEl = playerKey === 'p1' 
        ? (document.getElementById('charge-status-display') || document.getElementById('charge-status'))
        : document.getElementById('p2-charge-status-display');

      if (statusEl) {
        statusEl.textContent = `NOT ENOUGH CHI FOR ${move.name.toUpperCase()}! (NEEDS ${chiCost} CHI)`;
        statusEl.style.color = '#ff0055';
      }
      return;
    }
  }

  if (playerKey === 'p1') {
    gameState.input.isConfirmed = true;
    gameState.input.selectedMoveKey = moveKey;
    gameState.input.lockInTime = gameState.turnTimerSeconds;
    gameState.p1.activeChargePercent = Math.max(10, gameState.p1.activeChargePercent || gameState.input.currentPercent || 100);
    clearInterval(gameState.input.chargeInterval);

    const flagEl = document.getElementById('p1-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p1.activeChargePercent}%!`;
    }
  } else if (playerKey === 'p2') {
    gameState.p2IsConfirmed = true;
    gameState.p2SelectedMoveKey = moveKey;
    gameState.p2LockInTime = gameState.turnTimerSeconds;
    gameState.p2.activeChargePercent = Math.max(10, gameState.p2.activeChargePercent || 100);

    const flagEl = document.getElementById('p2-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p2.activeChargePercent}%!`;
    }
  }

  // Trigger turn resolution immediately when both inputs are locked
  checkBothPlayersLocked();
}

function checkBothPlayersLocked() {
  const p1Ready = gameState.p1.isCPU || gameState.input.isConfirmed || gameState.p1.isFainted;
  const p2Ready = gameState.p2.isCPU || gameState.p2IsConfirmed || gameState.p2.isFainted || gameState.p2AlwaysIdle;

  if (p1Ready && p2Ready && gameState.roundPhase === 'INPUT') {
    clearInterval(gameState.timerInterval);
    setTimeout(() => {
      if (gameState.roundPhase === 'INPUT') {
        executeTurnResolutionPhase();
      }
    }, 400);
  }
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.pad-btn');
  buttons.forEach(btn => {
    const key = btn.id.replace('key-', '');

    const handlePressDown = (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: key }));
    };

    const handlePressUp = (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keyup', { key: key }));
    };

    btn.onmousedown = handlePressDown;
    btn.onmouseup = handlePressUp;

    btn.addEventListener('touchstart', handlePressDown, { passive: false });
    btn.addEventListener('touchend', handlePressUp, { passive: false });
    btn.addEventListener('touchcancel', handlePressUp, { passive: false });
  });
}

function simulateCPUButtonPress(moveKey) {
  if (moveKey === 'DO_NOTHING') return;
  const parts = moveKey.split('+');
  parts.forEach(k => {
    const keyEl = document.getElementById(`key-${k}`);
    if (keyEl) {
      keyEl.classList.add('active');
      setTimeout(() => keyEl.classList.remove('active'), 1200);
    }
  });
}

function resetTurnInputState() {
  resetCharge();
  gameState.input.isConfirmed = false;
  gameState.input.selectedMoveKey = null;
  gameState.input.lockInTime = 0;
  gameState.p2IsConfirmed = false;
  gameState.p2SelectedMoveKey = null;
  gameState.p2LockInTime = 0;

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}
