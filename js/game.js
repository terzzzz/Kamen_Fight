const CHARGE_TIMES = {
  'A': 800,   // Defense: 0.8s
  'D': 1300,  // Offense: 1.3s
  'W': 2000,  // Air/Buffs: 2.0s
  'S': 2600   // Energy/Specials: 2.6s
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
  gameState.roundCounter = 1;

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
    consecutiveHitsLanded: 0,
    isFainted: false,
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

  if (splashScreen && splashRound && splashNames) {
    // Reworded from "ROUND 1" to "GET READY FOR THE FIGHT!"
    splashRound.textContent = "GET READY FOR THE FIGHT!";
    splashNames.textContent = `${gameState.p1.name} VS ${gameState.p2.name}`;
    splashScreen.hidden = false;

    setTimeout(() => {
      splashScreen.hidden = true;
      startRoundCountdown();
    }, 2200);
  } else {
    startRoundCountdown();
  }
}

function startRoundCountdown() {
  gameState.roundPhase = 'INPUT';
  resetTurnInputState();
  updateHUD();

  // Re-sync dynamic idle states (idle, faint, or mid-air)
  updateCharacterMedia('p1', 'IDLE');
  updateCharacterMedia('p2', 'IDLE');

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
  if (typeof selectCPUMove === 'function') {
    return selectCPUMove(cpuPlayer, opponentPlayer, gameState.movesData) || 'D+J';
  }
  const availableKeys = Object.keys(gameState.movesData);
  return availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'D+J';
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();

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
  if (!gameState.input.heldDirection || gameState.roundPhase !== 'INPUT') return;

  let duration = CHARGE_TIMES[gameState.input.heldDirection];
  
  if (gameState.p1.activeBuffs.some(b => b.id === 'charge_speed')) {
    duration = duration * 0.75;
  }

  const elapsed = Date.now() - gameState.input.chargeStartTime;
  gameState.input.currentPercent = Math.min(100, Math.floor((elapsed / duration) * 100));

  const fillEl = document.getElementById('p1-charge-fill');
  if (fillEl) {
    fillEl.style.width = `${gameState.input.currentPercent}%`;
    fillEl.textContent = `${gameState.input.currentPercent}%`;
  }

  const statusEl = document.getElementById('charge-status-display');
  if (statusEl) {
    statusEl.textContent = `CHARGING [${gameState.input.heldDirection}]: ${gameState.input.currentPercent}%`;
    statusEl.style.color = gameState.input.currentPercent >= 100 ? '#00ffcc' : '#ffcc00';
  }
}

function resetCharge() {
  clearInterval(gameState.input.chargeInterval);
  gameState.input.heldDirection = null;
  gameState.input.currentPercent = 0;

  const fillEl = document.getElementById('p1-charge-fill');
  if (fillEl) {
    fillEl.style.width = '0%';
    fillEl.textContent = '0%';
  }

  const statusEl = document.getElementById('charge-status-display');
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
    btn.onmousedown = () => {
      const key = btn.id.replace('key-', '');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: key }));
    };
    btn.onmouseup = () => {
      const key = btn.id.replace('key-', '');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: key }));
    };
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

// Helper to determine longest playing video duration dynamically
function getLongestVideoDurationMs() {
  const v1 = document.getElementById('p1-video');
  const v2 = document.getElementById('p2-video');

  const getDur = (v) => {
    if (!v || isNaN(v.duration) || v.duration <= 0) return 2.5;
    return v.duration;
  };

  const maxSeconds = Math.max(getDur(v1), getDur(v2), 2.5);
  return Math.ceil(maxSeconds * 1000);
}

function executeTurnResolutionPhase() {
  gameState.roundPhase = 'RESOLUTION';

  let p1Time = gameState.p1.isCPU ? Math.floor(Math.random() * 4 + 1) : (gameState.input.lockInTime || 0);
  let p2Time = gameState.p2.isCPU ? Math.floor(Math.random() * 4 + 1) : (gameState.p2LockInTime || 0);

  let p1MoveKey = gameState.p1.isCPU
    ? getCPUMoveChoice(gameState.p1, gameState.p2)
    : (gameState.input.selectedMoveKey || 'DO_NOTHING');

  let p2MoveKey = gameState.p2.isCPU 
    ? getCPUMoveChoice(gameState.p2, gameState.p1) 
    : (gameState.p2SelectedMoveKey || 'DO_NOTHING');

  if (gameState.p1.isCPU) {
    gameState.p1.activeChargePercent = p1MoveKey === 'DO_NOTHING' ? 0 : Math.floor(Math.random() * 26 + 75);
    simulateCPUButtonPress(p1MoveKey);
  }
  if (gameState.p2.isCPU) {
    gameState.p2.activeChargePercent = p2MoveKey === 'DO_NOTHING' ? 0 : Math.floor(Math.random() * 26 + 75);
    simulateCPUButtonPress(p2MoveKey);
  }

  let p1Move = p1MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p1MoveKey] || DO_NOTHING_MOVE);
  let p2Move = p2MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p2MoveKey] || DO_NOTHING_MOVE);

  // Trigger Action Videos
  updateCharacterMedia('p1', p1Move.video || 'idle.mp4');
  updateCharacterMedia('p2', p2Move.video || 'idle.mp4');

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${gameState.p1.activeChargePercent}% ACC)<br>VS<br>P2: ${p2Move.name} (${gameState.p2.activeChargePercent}% ACC)`;
  }

  // Deduct CHI Costs
  gameState.p1.chi = Math.max(0, gameState.p1.chi - p1Move.chiCost);
  gameState.p2.chi = Math.max(0, gameState.p2.chi - p2Move.chiCost);

  // Apply Utility Buffs
  if (p1MoveKey === 'W+J') applyBuff(gameState.p1, 'charge_speed', 'CHG SPEED +25%', 'speed', 2);
  if (p2MoveKey === 'W+J') applyBuff(gameState.p2, 'charge_speed', 'CHG SPEED +25%', 'speed', 2);

  if (p1MoveKey === 'W+K') applyBuff(gameState.p1, 'focus', 'S-ATK +20%', 'attack', 2);
  if (p2MoveKey === 'W+K') applyBuff(gameState.p2, 'focus', 'S-ATK +20%', 'attack', 2);

  handleAirborneState(gameState.p1, p1MoveKey);
  handleAirborneState(gameState.p2, p2MoveKey);

  let p1IsDefensive = p1Move.type === 'DEFENSE';
  let p2IsDefensive = p2Move.type === 'DEFENSE';
  let p1GoesFirst = false;

  if (p1IsDefensive && !p2IsDefensive) {
    p1GoesFirst = false;
  } else if (!p1IsDefensive && p2IsDefensive) {
    p1GoesFirst = true;
  } else {
    p1GoesFirst = p1Time >= p2Time;
  }

  let attacker1 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let defender1 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;
  let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;
  let defKey1 = p1GoesFirst ? 'p2' : 'p1';

  let attacker2 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let defender2 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;
  let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;
  let defKey2 = p1GoesFirst ? 'p1' : 'p2';

  let hit1Landed = resolveAttack(attacker1, defender1, move1, key1, move2, defKey1);
  let hit2Landed = false;

  if (!hit1Landed || move1.type !== 'MELEE') {
    hit2Landed = resolveAttack(attacker2, defender2, move2, key2, move1, defKey2);
  }

  if (hit1Landed && key1.startsWith('D')) attacker1.chi = Math.min(16, attacker1.chi + 3);
  if (hit2Landed && key2.startsWith('D')) attacker2.chi = Math.min(16, attacker2.chi + 3);

  updateFaintTracker(attacker1, defender1, hit1Landed, defKey1);
  updateFaintTracker(attacker2, defender2, hit2Landed, defKey2);

  updateHUD();

  // Wait for the longest playing video to finish before proceeding to next round
  setTimeout(() => {
    const dynamicWaitTime = getLongestVideoDurationMs();

    setTimeout(() => {
      if (battleMsg) battleMsg.hidden = true;

      processRoundBuffs(gameState.p1);
      processRoundBuffs(gameState.p2);

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
    }, dynamicWaitTime);
  }, 200);
}

function resolveAttack(attacker, defender, atkMove, atkMoveKey, defMove, defenderKey) {
  if (atkMove.type !== 'MELEE' && atkMove.type !== 'PROJECTILE' && atkMove.type !== 'SPECIAL' && atkMove.type !== 'FINISHER' && atkMove.type !== 'PHYSICAL') return false;

  const atkChargeRatio = (attacker.activeChargePercent || 100) / 100;
  const defChargeRatio = (defender.activeChargePercent || 100) / 100;

  let effectiveHitChance = (atkMove.hitChance || 80) * atkChargeRatio;
  let rolledHit = Math.random() * 100 < effectiveHitChance;
  if (!rolledHit) return false;

  let damageRatio = 1.0;

  if (defMove.type === 'DEFENSE') {
    const atkButton = atkMoveKey ? atkMoveKey.split('+')[1] : null;

    if (defMove.key === 'A+I' || defMove.name === 'Windmill Guard') {
      let effectiveCounterChance = 70 * defChargeRatio;
      if (atkMove.unblockable) {
        damageRatio = 1.0;
      } else if (Math.random() * 100 < effectiveCounterChance) {
        damageRatio = 0.0;
      }
    } else if (defMove.key === `A+${atkButton}` || defMove.name.includes('Guard')) {
      let effectiveHighBlockChance = 20 * defChargeRatio;
      let rolledHighBlock = Math.random() * 100 < effectiveHighBlockChance;
      damageRatio = rolledHighBlock ? 0.20 : 0.70;
    }
  }

  let sSkillMultiplier = (atkMoveKey && atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus')) ? 1.20 : 1.0;
  let baseDamage = atkMove.baseDamage || 0;
  let finalDmg = Math.floor(baseDamage * sSkillMultiplier * damageRatio);

  defender.lp = Math.max(0, defender.lp - finalDmg);

  if (finalDmg > 0) {
    if (atkMoveKey && atkMoveKey.startsWith('D')) {
      updateCharacterMedia(defenderKey, 'hit_physical.mp4');
    } else {
      updateCharacterMedia(defenderKey, 'hit.mp4');
    }
  } else if (defMove.type === 'DEFENSE' && defMove.video) {
    updateCharacterMedia(defenderKey, defMove.video);
  }

  return finalDmg > 0;
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

  // Continuous looping for stance videos; single-run for actions
  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const videoUrl = `assets/videos/${riderId}/${fileName}`;

  if (videoEl.getAttribute('src') !== videoUrl) {
    videoEl.src = videoUrl;
  }
  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;
  videoEl.currentTime = 0;
  videoEl.play().catch(() => {});

  if (playerKey === 'p2') {
    videoEl.classList.add('mirrored');
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

function updateFaintTracker(attacker, defender, hitLanded, defenderSlot) {
  if (hitLanded) {
    attacker.consecutiveHitsLanded++;
    if (attacker.consecutiveHitsLanded >= 3 && !defender.isFainted) {
      triggerFaint(defender, defenderSlot);
      attacker.consecutiveHitsLanded = 0;
    }
  } else {
    attacker.consecutiveHitsLanded = 0;
  }
}

function triggerFaint(targetPlayer, slotKey) {
  targetPlayer.isFainted = true;
  const stunOverlay = document.getElementById(`${slotKey}-stun-overlay`);
  const statusEl = document.getElementById(`${slotKey}-status`);

  if (stunOverlay) stunOverlay.hidden = false;
  if (statusEl) statusEl.textContent = 'FAINTED (5s)';

  updateCharacterMedia(slotKey, 'faint.mp4');

  setTimeout(() => {
    targetPlayer.isFainted = false;
    if (stunOverlay) stunOverlay.hidden = true;
    if (statusEl) statusEl.textContent = 'NORMAL';
    updateCharacterMedia(slotKey, 'IDLE');
  }, 5000);
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

  const turnDisp = document.getElementById('turn-display');
  if (turnDisp) turnDisp.textContent = `ROUND ${gameState.roundCounter}`;
}
