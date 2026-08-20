const CHARGE_TIMES = {
  'A': 800,   // Defense
  'D': 1300,  // Offense
  'W': 2000,  // Air/Buffs
  'S': 2600   // Energy/Specials
};

const DO_NOTHING_MOVE = {
  name: "Do Nothing",
  type: "IDLE",
  chiCost: 0,
  baseDamage: 0,
  hitChance: 100,
  video: "idle.mp4"
};

let gameState = {
  roundCounter: 1,
  roundPhase: 'IDLE',
  turnTimerSeconds: 5,
  timerInterval: null,
  movesData: {},
  p1: null,
  p2: null,
  p2AlwaysIdle: false, // Test/Dummy Mode Toggle Flag (Key '0')
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

async function startBattle(config) {
  try {
    const response = await fetch('data/moves.json');
    gameState.movesData = await response.json();
  } catch (err) {
    console.warn("Could not load moves.json, using fallback data.");
  }

  gameState.p1 = createPlayerState(config.p1Rider, config.p1IsCPU);
  gameState.p2 = createPlayerState(config.p2Rider, config.p2IsCPU);
  gameState.p2AlwaysIdle = false;
  gameState.roundCounter = 1;

  const battleScreen = document.getElementById('battle-screen');
  if (battleScreen) battleScreen.hidden = false;

  bindKeyboardInputs();
  bindCommandButtons();
  updateHUD();

  updateCharacterMedia('p1', 'IDLE');
  updateCharacterMedia('p2', 'IDLE');

  triggerMatchTransition();
}

function createPlayerState(riderConfig, isCPU) {
  return {
    ...riderConfig,
    isCPU: isCPU,
    lp: riderConfig.maxLp || 1050,
    chi: 10,
    maxChi: 16,
    faintMeter: 0,               // 100 Point Faint Meter
    tookCleanHitThisRound: false, // Tracks if a clean hit was suffered this round
    isFainted: false,
    willBeFaintedNextRound: false,
    airborneTicks: 0,
    activeChargePercent: 100,
    activeBuffs: []
  };
}

function triggerMatchTransition() {
  gameState.roundPhase = 'TRANSITION';
  const splashScreen = document.getElementById('match-transition-screen');
  const splashRound = document.getElementById('splash-round-text');
  const splashNames = document.getElementById('splash-names-text');

  if (splashScreen) {
    if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";
    if (splashNames) splashNames.textContent = `${gameState.p1.name} VS ${gameState.p2.name}`;
    splashScreen.hidden = false;

    setTimeout(() => {
      splashScreen.hidden = true;
      startRoundCountdown();
    }, 2200);
  } else {
    startRoundCountdown();
  }
}

function triggerFloatingNumber(slotKey, amount, isHeal = false) {
  const hudEl = document.querySelector(`.${slotKey}-hud`);
  if (!hudEl) return;

  const roundedAmount = Math.round(amount);
  if (roundedAmount <= 0) return;

  const popup = document.createElement('div');
  popup.className = `damage-popup ${isHeal ? 'heal' : 'damage'}`;
  popup.textContent = isHeal ? `+${roundedAmount}` : `-${roundedAmount}`;

  hudEl.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 1200);
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
      player.faintMeter = 0; // Reset counter to 0 upon entering faint state
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
    confirmPlayerAction('DO_NOTHING');
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

  gameState.timerInterval = setInterval(() => {
    if (gameState.roundPhase !== 'INPUT') return;

    gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

    if (gameState.turnTimerSeconds <= 0) {
      clearInterval(gameState.timerInterval);

      if (!gameState.input.isConfirmed && !gameState.p1.isCPU) {
        confirmPlayerAction('DO_NOTHING');
      }
      executeTurnResolutionPhase();
    }
  }, 1000);
}

function getCPUMoveChoice(cpuPlayer, opponentPlayer) {
  if (cpuPlayer.isFainted || gameState.p2AlwaysIdle) return 'DO_NOTHING';
  if (typeof selectCPUMove === 'function') {
    return selectCPUMove(cpuPlayer, opponentPlayer, gameState.movesData) || 'D+J';
  }
  const availableKeys = Object.keys(gameState.movesData);
  return availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'D+J';
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();

    // Toggle P2 Dummy Mode with Key '0'
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
      confirmPlayerAction(`${gameState.input.heldDirection}+${key}`);
    }
  });

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

function confirmPlayerAction(moveKey) {
  gameState.input.isConfirmed = true;
  gameState.input.selectedMoveKey = moveKey;
  gameState.input.lockInTime = gameState.turnTimerSeconds;
  gameState.p1.activeChargePercent = Math.max(10, gameState.input.currentPercent);
  clearInterval(gameState.input.chargeInterval);

  const flagEl = document.getElementById('p1-action-flag');
  if (flagEl) {
    flagEl.hidden = false;
    flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p1.activeChargePercent}%!`;
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

function applyBuff(player, buffId, label, buffType, durationRounds) {
  player.activeBuffs = player.activeBuffs.filter(b => b.id !== buffId);
  player.activeBuffs.push({
    id: buffId,
    label: label,
    type: buffType,
    roundsLeft: durationRounds
  });
  renderBuffTrays();
}

function processRoundBuffs(player) {
  player.activeBuffs.forEach(b => b.roundsLeft--);
  player.activeBuffs = player.activeBuffs.filter(b => b.roundsLeft > 0);
  renderBuffTrays();
}

function renderBuffTrays() {
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    const tray = document.getElementById(`${slot}-buff-tray`);
    if (!tray || !player) return;

    tray.innerHTML = '';
    player.activeBuffs.forEach(b => {
      const tag = document.createElement('div');
      tag.className = `buff-tag ${b.type}`;
      tag.textContent = `${b.label} (${b.roundsLeft}R)`;
      tray.appendChild(tag);
    });
  });
}

function setSideBoxesBlank(isBlank) {
  const p1Box = document.getElementById('p1-box');
  const p2Box = document.getElementById('p2-box');
  if (p1Box) p1Box.classList.toggle('blanked', isBlank);
  if (p2Box) p2Box.classList.toggle('blanked', isBlank);
}

function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null) {
  return new Promise((resolve) => {
    const centerBox = document.getElementById('center-box');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label');
    if (!centerBox || !centerVid) return resolve();

    const player = gameState[playerKey];
    if (!player) return resolve();

    if (actionLabel) {
      actionLabel.textContent = actionName ? `${player.name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

    centerBox.hidden = false;
    centerVid.muted = true;
    centerVid.playsInline = true;

    centerVid.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);

    const isIchigo = player.id === 'ichigo';
    const isUnmirrored = videoFile.includes('windmill_guard') || videoFile.includes('combo_kick');
    const sourceFacingLeft = isIchigo && !isUnmirrored;

    const shouldFlip = playerKey === 'p1' ? sourceFacingLeft : !sourceFacingLeft;
    centerVid.style.transform = shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';

    let resolved = false;
    let fallbackTimer = null;

    const cleanUpAndResolve = () => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      centerVid.removeEventListener('ended', cleanUpAndResolve);
      centerVid.removeEventListener('error', cleanUpAndResolve);

      centerBox.hidden = true;
      if (actionLabel) actionLabel.hidden = true;
      resolve();
    };

    centerVid.addEventListener('ended', cleanUpAndResolve);
    centerVid.addEventListener('error', cleanUpAndResolve);

    const videoUrl = `assets/videos/${player.id}/${videoFile}`;
    centerVid.src = videoUrl;
    centerVid.load();

    centerVid.play().catch(() => cleanUpAndResolve());

    fallbackTimer = setTimeout(cleanUpAndResolve, maxDurationMs || 8000);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box');
  if (centerBox) centerBox.hidden = true;
}

// MAIN SEQUENTIAL RESOLUTION PHASE
async function executeTurnResolutionPhase() {
  gameState.roundPhase = 'RESOLUTION';

  let p1Time = gameState.p1.isCPU ? Math.floor(Math.random() * 4 + 1) : (gameState.input.lockInTime || 0);
  let p2Time = gameState.p2.isCPU ? Math.floor(Math.random() * 4 + 1) : (gameState.p2LockInTime || 0);

  let p1MoveKey = gameState.p1.isCPU
    ? getCPUMoveChoice(gameState.p1, gameState.p2)
    : (gameState.input.selectedMoveKey || 'DO_NOTHING');

  let p2MoveKey = gameState.p2AlwaysIdle
    ? 'DO_NOTHING'
    : (gameState.p2.isCPU 
        ? getCPUMoveChoice(gameState.p2, gameState.p1) 
        : (gameState.p2SelectedMoveKey || 'DO_NOTHING'));

  if (gameState.p1.isCPU) {
    gameState.p1.activeChargePercent = p1MoveKey === 'DO_NOTHING' ? 0 : Math.floor(Math.random() * 26 + 75);
    simulateCPUButtonPress(p1MoveKey);
  }
  if (gameState.p2.isCPU && !gameState.p2AlwaysIdle) {
    gameState.p2.activeChargePercent = p2MoveKey === 'DO_NOTHING' ? 0 : Math.floor(Math.random() * 26 + 75);
    simulateCPUButtonPress(p2MoveKey);
  } else if (gameState.p2AlwaysIdle) {
    gameState.p2.activeChargePercent = 0;
  }

  let p1Move = p1MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p1MoveKey] || DO_NOTHING_MOVE);
  let p2Move = p2MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p2MoveKey] || DO_NOTHING_MOVE);

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${gameState.p1.activeChargePercent}%) VS P2: ${p2Move.name} (${gameState.p2.activeChargePercent}%)`;
  }

  setSideBoxesBlank(true);

  if (p1MoveKey === 'W+J') applyBuff(gameState.p1, 'charge_speed', 'CHG SPEED +25%', 'speed', 2);
  if (p2MoveKey === 'W+J') applyBuff(gameState.p2, 'charge_speed', 'CHG SPEED +25%', 'speed', 2);
  if (p1MoveKey === 'W+K') applyBuff(gameState.p1, 'focus', 'S-ATK +20%', 'attack', 2);
  if (p2MoveKey === 'W+K') applyBuff(gameState.p2, 'focus', 'S-ATK +20%', 'attack', 2);

  handleAirborneState(gameState.p1, p1MoveKey);
  handleAirborneState(gameState.p2, p2MoveKey);

  // TURN PRIORITY CALCULATION (ACTION OVER IDLE PRIORITY)
  let p1IsIdle = p1MoveKey === 'DO_NOTHING';
  let p2IsIdle = p2MoveKey === 'DO_NOTHING';
  let p1GoesFirst = false;

  if (!p1IsIdle && p2IsIdle) {
    p1GoesFirst = true;
  } else if (p1IsIdle && !p2IsIdle) {
    p1GoesFirst = false;
  } else {
    let p1IsDefensive = p1Move.type === 'DEFENSE';
    let p2IsDefensive = p2Move.type === 'DEFENSE';

    if (p1IsDefensive && !p2IsDefensive) {
      p1GoesFirst = false;
    } else if (!p1IsDefensive && p2IsDefensive) {
      p1GoesFirst = true;
    } else {
      p1GoesFirst = p1Time >= p2Time;
    }
  }

  let attacker1 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let defender1 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;
  let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;
  let atkKey1 = p1GoesFirst ? 'p1' : 'p2';
  let defKey1 = p1GoesFirst ? 'p2' : 'p1';

  let attacker2 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let defender2 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;
  let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;
  let atkKey2 = p1GoesFirst ? 'p2' : 'p1';
  let defKey2 = p1GoesFirst ? 'p1' : 'p2';

  // STEP 1 EXECUTION
  let attack1Result = { hitLanded: false, isGlancing: false };
  if (move1.type === 'DEFENSE' && (move2.type === 'IDLE' || move2.type === 'BUFF')) {
    await playCenterVideo(atkKey1, move1.video || 'guard.mp4', move1.name, 1000);
  } else {
    await playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name);
    attack1Result = resolveAttack(attacker1, defender1, move1, key1, move2, key2, defKey1);
  }

  let hit1Landed = attack1Result.hitLanded;
  let isGlancing1 = attack1Result.isGlancing;

  if (hit1Landed && key1.startsWith('D')) attacker1.chi = Math.min(16, attacker1.chi + 3);
  updateHUD();

  // STEP 2 EXECUTION (Counter-punch allowed if P1 missed OR only landed a Glancing Scratch)
  if (defender2.lp > 0) {
    if (hit1Landed && !isGlancing1 && (move1.type === 'MELEE' || move1.type === 'PROJECTILE' || move1.type === 'SPECIAL' || move1.type === 'PHYSICAL')) {
      // Clean hit interrupts defender
      const hitVid = key1.startsWith('D') ? 'hit_physical.mp4' : 'hit.mp4';
      await playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
    } else {
      // Counter-attack proceeds if hit missed OR was only a 10% scratch
      attacker2.chi = Math.max(0, attacker2.chi - (move2.chiCost || 0));
      updateHUD();

      await playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name);
      let attack2Result = resolveAttack(attacker2, defender2, move2, key2, move1, key1, defKey2);

      if (attack2Result.hitLanded && key2.startsWith('D')) attacker2.chi = Math.min(16, attacker2.chi + 3);
      updateHUD();
    }
  }

  // --- ROUND CONCLUSION ---
  setTimeout(() => {
    hideCenterScreen();
    setSideBoxesBlank(false);

    if (battleMsg) battleMsg.hidden = true;

    processRoundBuffs(gameState.p1);
    processRoundBuffs(gameState.p2);

    ['p1', 'p2'].forEach(slot => {
      const player = gameState[slot];
      if (player) {
        // Reset faint state after a fainted round ends
        if (player.isFainted) {
          player.isFainted = false;
          player.faintMeter = 0;
        } else if (!player.tookCleanHitThisRound) {
          // Reduce 20 points if no clean hit taken this round
          player.faintMeter = Math.max(0, player.faintMeter - 20);
        }

        player.tookCleanHitThisRound = false; // Reset round flag
      }
    });

    updateHUD();

    if (gameState.p1.lp > 0 && gameState.p2.lp > 0) {
      gameState.roundCounter++;
      startRoundCountdown();
    } else {
      if (battleMsg) battleMsg.hidden = false;

      if (gameState.p1.lp <= 0 && gameState.p2.lp <= 0) {
        if (battleMsg) battleMsg.innerHTML = "DOUBLE KO!<br>DRAW MATCH!";
        updateCharacterMedia('p1', 'KO');
        updateCharacterMedia('p2', 'KO');
      } else if (gameState.p1.lp <= 0) {
        if (battleMsg) battleMsg.innerHTML = `KO!<br>${gameState.p2.name.toUpperCase()} WINS!`;
        updateCharacterMedia('p1', 'KO');
        updateCharacterMedia('p2', 'VICTORY');
      } else {
        if (battleMsg) battleMsg.innerHTML = `KO!<br>${gameState.p1.name.toUpperCase()} WINS!`;
        updateCharacterMedia('p1', 'VICTORY');
        updateCharacterMedia('p2', 'KO');
      }
    }
  }, 1000);
}

function resolveAttack(attacker, defender, atkMove, atkMoveKey, defMove, defMoveKey, defenderKey) {
  if (atkMove.type !== 'MELEE' && atkMove.type !== 'PROJECTILE' && atkMove.type !== 'SPECIAL' && atkMove.type !== 'FINISHER' && atkMove.type !== 'PHYSICAL') return { hitLanded: false, isGlancing: false };

  const atkChargeRatio = (attacker.activeChargePercent || 100) / 100;
  const defChargeRatio = (defender.activeChargePercent || 100) / 100;

  // JUMP EVASION: If defender is airborne, attacker's hit chance is reduced by 20%
  let jumpEvasionBonus = defender.airborneTicks > 0 ? 20 : 0;

  let rolledHit = false;
  if (defMove.type === 'IDLE' || defMoveKey === 'DO_NOTHING' || defMove.name === 'Do Nothing') {
    rolledHit = true;
  } else {
    let effectiveHitChance = Math.max(0, ((atkMove.hitChance || 80) * atkChargeRatio) - jumpEvasionBonus);
    rolledHit = Math.random() * 100 < effectiveHitChance;
  }

  if (!rolledHit) return { hitLanded: false, isGlancing: false };

  // GLANCING HIT ("SCRATCH") MECHANIC: 15% chance to deal only 10% damage without interrupting the opponent
  let isGlancing = Math.random() * 100 < 15; 

  let damageRatio = 1.0;
  if (defMove.type === 'DEFENSE') {
    const atkButton = atkMoveKey ? atkMoveKey.split('+')[1] : null;
    if (defMoveKey === 'A+I' || defMove.name === 'Windmill Guard') {
      let effectiveCounterChance = 70 * defChargeRatio;
      if (atkMove.unblockable) {
        damageRatio = 1.0;
      } else if (Math.random() * 100 < effectiveCounterChance) {
        damageRatio = 0.0;
      }
    } else if (defMoveKey === `A+${atkButton}` || defMove.name.includes('Guard')) {
      let effectiveHighBlockChance = 20 * defChargeRatio;
      let rolledHighBlock = Math.random() * 100 < effectiveHighBlockChance;
      damageRatio = rolledHighBlock ? 0.20 : 0.70;
    }
  }

  // JUMP ATTACK STRENGTH: If attacker is airborne, deal +15% damage multiplier
  let jumpAtkMultiplier = attacker.airborneTicks > 0 ? 1.15 : 1.0;
  let sSkillMultiplier = (atkMoveKey && atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus')) ? 1.20 : 1.0;
  
  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * sSkillMultiplier * jumpAtkMultiplier * damageRatio;

  // Reduce damage to 10% if it's a scratch/glancing hit
  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.10)) : Math.floor(calculatedDmg);

  if (finalDmg > 0) {
    defender.lp = Math.max(0, defender.lp - finalDmg);
    triggerFloatingNumber(defenderKey, finalDmg, false);

    // CLEAN HIT: +25 Points to Faint Meter | SCRATCH: +0 Points
    if (!isGlancing && !defender.isFainted && !defender.willBeFaintedNextRound) {
      defender.tookCleanHitThisRound = true;
      defender.faintMeter = Math.min(100, defender.faintMeter + 25);
      
      if (defender.faintMeter >= 100) {
        defender.willBeFaintedNextRound = true;
      }
    }
  }

  return { hitLanded: finalDmg > 0, isGlancing: isGlancing };
}

function updateCharacterMedia(playerKey, stateType) {
  const player = gameState[playerKey];
  if (!player) return;

  const videoEl = document.getElementById(`${playerKey}-video`);
  const spriteEl = document.getElementById(`${playerKey}-sprite`);
  if (!videoEl) return;

  let fileName = stateType;

  if (stateType === 'IDLE') {
    if (player.isFainted) {
      fileName = 'faint.mp4';
    } else if (player.airborneTicks > 0) {
      fileName = 'mid-air.mp4';
    } else {
      fileName = 'idle.mp4';
    }
  } else if (stateType === 'VICTORY' || stateType === 'victory') {
    fileName = Math.random() < 0.5 ? 'victory.mp4' : 'victory2.mp4';
  } else if (stateType === 'KO' || stateType === 'ko') {
    fileName = 'ko.mp4';
  }

  if (!fileName.endsWith('.mp4') && !fileName.endsWith('.webm')) {
    fileName += '.mp4';
  }

  const isIchigo = player.id === 'ichigo';
  const isUnmirrored = fileName.includes('windmill_guard') || fileName.includes('combo_kick');
  const sourceFacingLeft = isIchigo && !isUnmirrored;

  const shouldFlip = playerKey === 'p1' ? sourceFacingLeft : !sourceFacingLeft;
  videoEl.style.transform = shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';

  const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

  videoEl.muted = true;
  videoEl.playsInline = true;

  if (playerKey === 'p2') {
    videoEl.classList.toggle('p2-mirror-palette', isMirrorMatch);
  }

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const videoUrl = `assets/videos/${riderId}/${fileName}`;

  if (videoEl.dataset.currentFile !== videoUrl || videoEl.paused || videoEl.readyState === 0) {
    videoEl.dataset.currentFile = videoUrl;
    videoEl.src = videoUrl;
    videoEl.load();
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;

  const playPromise = videoEl.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {});
  }
}

function resetTurnInputState() {
  resetCharge();
  gameState.input.isConfirmed = false;
  gameState.input.selectedMoveKey = null;
  gameState.input.lockInTime = 0;
  const flagEl = document.getElementById('p1-action-flag');
  if (flagEl) flagEl.hidden = true;
}

function handleAirborneState(player, moveKey) {
  if (moveKey === 'W+I') {
    player.airborneTicks = 2;
  } else if (player.airborneTicks > 0) {
    const move = gameState.movesData[moveKey];
    if (move && move.forcesLanding) {
      player.airborneTicks = 0;
    } else {
      player.airborneTicks--;
    }
  }
}

function updateHUD() {
  if (gameState.p1) {
    const p1Name = document.getElementById('p1-name');
    const p1Lp = document.getElementById('p1-lp');
    const p1Chi = document.getElementById('p1-chi');
    if (p1Name) p1Name.textContent = gameState.p1.name;
    if (p1Lp) p1Lp.textContent = gameState.p1.lp;
    if (p1Chi) p1Chi.textContent = gameState.p1.chi;
  }

  if (gameState.p2) {
    const p2Name = document.getElementById('p2-name');
    const p2Lp = document.getElementById('p2-lp');
    const p2Chi = document.getElementById('p2-chi');
    if (p2Name) p2Name.textContent = gameState.p2.name;
    if (p2Lp) p2Lp.textContent = gameState.p2.lp;
    if (p2Chi) p2Chi.textContent = gameState.p2.chi;
  }

  // Render vertical faint meter fill height (0% to 100%)
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    const fillEl = document.getElementById(`${slot}-faint-fill`);
    if (fillEl && player) {
      fillEl.style.height = `${player.faintMeter}%`;
    }
  });

  const turnDisp = document.getElementById('turn-display');
  if (turnDisp) turnDisp.textContent = `ROUND ${gameState.roundCounter}`;
}
