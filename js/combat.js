// FAINT SYSTEM FALLBACK CONFIG
const FAINT_CFG = typeof FAINT_CONFIG !== 'undefined' ? FAINT_CONFIG : {
  FAINT_THRESHOLD: 100,
  HIT_BUILDUP: 25,
  ROUND_RECOVERY: 13
};

// BATTLE INITIALIZATION WITH THREE-STAGE LOADING LIFECYCLE
async function startBattle(matchConfig) {
  if (!window.gameState) window.gameState = {};
  gameState.matchConfig = matchConfig;
  if (!gameState.videoCache) gameState.videoCache = {};

  const transitionScreen = document.getElementById('match-transition-screen');
  const splashNames = document.getElementById('splash-names-text');
  const splashRound = document.getElementById('splash-round-text');

  // 1. Fetch Move Sets for Selected Riders
  try {
    const res = await fetch('data/moves.json');
    if (res.ok) {
      const allMoves = await res.json();
      gameState.p1Moves = allMoves[matchConfig.p1Rider.id] || allMoves['ichigo'] || FALLBACK_ICHIGO_MOVES;
      gameState.p2Moves = allMoves[matchConfig.p2Rider.id] || allMoves['ichigo'] || FALLBACK_ICHIGO_MOVES;
    }
  } catch (e) {
    console.warn("Could not load moves.json, using fallbacks.");
    gameState.p1Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
    gameState.p2Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
  }

  // 2. Instantiate Player Objects
  const p1Rider = matchConfig.p1Rider || { id: 'ichigo', name: 'Kamen Rider Ichigo', maxLp: 1050 };
  const p2Rider = matchConfig.p2Rider || { id: 'nigo', name: 'Kamen Rider Nigo', maxLp: 1200 };

  let p1MaxLp = p1Rider.maxLp || 1050;
  if (matchConfig.p1IsCPU && matchConfig.p1Difficulty === 'hard') p1MaxLp = Math.floor(p1MaxLp * 1.30);

  let p2MaxLp = p2Rider.maxLp || 1200;
  if (matchConfig.p2IsCPU && matchConfig.p2Difficulty === 'hard') p2MaxLp = Math.floor(p2MaxLp * 1.30);

  gameState.p1 = {
    id: p1Rider.id,
    name: p1Rider.name,
    isCPU: matchConfig.p1IsCPU,
    maxLp: p1MaxLp,
    lp: p1MaxLp,
    chi: 10,
    maxChi: 16,
    faintMeter: 0,
    activeBuffs: [],
    airborneTicks: 0,
    activeChargePercent: 100,
    isFainted: false,
    tookCleanHitThisRound: false
  };

  gameState.p2 = {
    id: p2Rider.id,
    name: p2Rider.name,
    isCPU: matchConfig.p2IsCPU,
    maxLp: p2MaxLp,
    lp: p2MaxLp,
    chi: 10,
    maxChi: 16,
    faintMeter: 0,
    activeBuffs: [],
    airborneTicks: 0,
    activeChargePercent: 100,
    isFainted: false,
    tookCleanHitThisRound: false
  };

  gameState.roundCounter = 1;

  // 3. STAGE A: PRELOADING SCREEN
  if (splashNames) splashNames.textContent = `${gameState.p1.name.toUpperCase()} VS ${gameState.p2.name.toUpperCase()}`;
  if (splashRound) splashRound.textContent = "PRELOADING ASSETS...";
  if (transitionScreen) transitionScreen.hidden = false;

  if (typeof preloadRiderVideos === 'function') {
    await Promise.all([
      preloadRiderVideos(p1Rider.id, gameState.p1Moves),
      preloadRiderVideos(p2Rider.id, gameState.p2Moves)
    ]);
  }

  // 4. STAGE B: "GET READY FOR THE FIGHT!" MATCHUP SPLASH
  if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";
  await new Promise(resolve => setTimeout(resolve, 1800));

  // 5. STAGE C: LAUNCH BATTLE SCREEN
  if (transitionScreen) transitionScreen.hidden = true;

  const battleScreen = document.getElementById('battle-screen');
  if (battleScreen) battleScreen.hidden = false;

  updateHUD();

  if (typeof updateCharacterMedia === 'function') {
    updateCharacterMedia('p1', 'IDLE');
    updateCharacterMedia('p2', 'IDLE');
  }

  if (typeof startRoundCountdown === 'function') {
    startRoundCountdown();
  }
}

// GET CPU MOVE CHOICE FILTERED BY AFFORDABLE CHI & DIFFICULTY
function getCPUMoveChoice(cpuPlayer, opponentPlayer, playerKey = 'p2') {
  if (cpuPlayer.isFainted || (playerKey === 'p2' && gameState.p2AlwaysIdle)) return 'DO_NOTHING';

  let movesData = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  if (!movesData || Object.keys(movesData).length === 0) {
    movesData = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
  }

  const difficulty = playerKey === 'p1' 
    ? (gameState.matchConfig?.p1Difficulty || 'normal') 
    : (gameState.matchConfig?.p2Difficulty || 'normal');

  let chosenKey = null;
  if (typeof selectCPUMove === 'function') {
    chosenKey = selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty);
  }

  if (chosenKey && movesData[chosenKey] && typeof movesData[chosenKey] === 'object') {
    const moveCost = movesData[chosenKey].chiCost || 0;
    if (moveCost <= cpuPlayer.chi) {
      return chosenKey;
    }
  }

  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length > 0) {
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  return 'D+J';
}

// FLOATING POPUP GENERATORS
function triggerFloatingNumber(slotKey, amount, isHeal = false) {
  const container = document.getElementById(`${slotKey}-box`) || document.querySelector(`.${slotKey}-hud`);
  if (!container) return;

  const roundedAmount = Math.round(amount);
  if (roundedAmount <= 0) return;

  const popup = document.createElement('div');
  popup.className = `damage-popup ${isHeal ? 'heal' : 'damage'}`;
  popup.textContent = isHeal ? `+${roundedAmount}` : `-${roundedAmount}`;

  container.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 2500);
}

function triggerFloatingText(slotKey, text, customClass = '') {
  const container = document.getElementById(`${slotKey}-box`) || document.querySelector(`.${slotKey}-hud`);
  if (!container) return;

  const popup = document.createElement('div');
  popup.className = `damage-popup ${customClass}`;
  popup.textContent = text;

  container.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 2500);
}

// BUFF & AIRBORNE STATE MANAGEMENT
function applyBuff(player, buffId, label, buffType, durationRounds) {
  if (!player.activeBuffs) player.activeBuffs = [];
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
  if (!player.activeBuffs) return;
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

    if (player.activeBuffs) {
      player.activeBuffs.forEach(b => {
        const tag = document.createElement('div');
        tag.className = `buff-tag ${b.type}`;
        tag.textContent = `${b.label} (${b.roundsLeft}R)`;
        tray.appendChild(tag);
      });
    }
  });
}

function handleAirborneState(player, moveKey, move) {
  if (move && move.grantsAirborne) {
    player.airborneTicks = move.grantsAirborne;
  } else if (player.airborneTicks > 0) {
    if (move && move.forcesLanding) {
      player.airborneTicks = 0;
    } else {
      player.airborneTicks--;
    }
  }
  renderBuffTrays();
}

function setSideBoxesBlank(isBlank) {
  const p1Box = document.getElementById('p1-box');
  const p2Box = document.getElementById('p2-box');
  if (p1Box) p1Box.classList.toggle('blanked', isBlank);
  if (p2Box) p2Box.classList.toggle('blanked', isBlank);
}

// HUD DISPLAY UPDATER
function updateHUD() {
  if (gameState.p1) {
    const p1Name = document.getElementById('p1-name');
    const p1Lp = document.getElementById('p1-lp');
    const p1Chi = document.getElementById('p1-chi');
    
    if (p1Name) p1Name.textContent = `[P1] ${gameState.p1.name}`;
    if (p1Lp) {
      p1Lp.textContent = `${gameState.p1.lp} / ${gameState.p1.maxLp}`;
    }
    if (p1Chi) {
      const maxChi = gameState.p1.maxChi || 16;
      const chiPct = Math.min(100, Math.max(0, (gameState.p1.chi / maxChi) * 100));
      p1Chi.innerHTML = `
        <span class="stat-value-large">${gameState.p1.chi}</span>
        <div class="chi-bar-track">
          <div class="chi-bar-fill" style="width: ${chiPct}%;"></div>
        </div>`;
    }
  }

  if (gameState.p2) {
    const p2Name = document.getElementById('p2-name');
    const p2Lp = document.getElementById('p2-lp');
    const p2Chi = document.getElementById('p2-chi');
    
    if (p2Name) p2Name.textContent = `[P2] ${gameState.p2.name}`;
    if (p2Lp) {
      p2Lp.textContent = `${gameState.p2.lp} / ${gameState.p2.maxLp}`;
    }
    if (p2Chi) {
      const maxChi = gameState.p2.maxChi || 16;
      const chiPct = Math.min(100, Math.max(0, (gameState.p2.chi / maxChi) * 100));
      p2Chi.innerHTML = `
        <span class="stat-value-large">${gameState.p2.chi}</span>
        <div class="chi-bar-track">
          <div class="chi-bar-fill" style="width: ${chiPct}%;"></div>
        </div>`;
    }
  }

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

// MAIN SEQUENTIAL RESOLUTION PHASE
async function executeTurnResolutionPhase() {
  gameState.roundPhase = 'RESOLUTION';

  let p1MoveKey = gameState.input ? gameState.input.selectedMoveKey : null;
  if (!p1MoveKey && gameState.p1.isCPU) {
    p1MoveKey = getCPUMoveChoice(gameState.p1, gameState.p2, 'p1');
  }
  if (!p1MoveKey) p1MoveKey = 'DO_NOTHING';

  let p2MoveKey = gameState.p2AlwaysIdle ? 'DO_NOTHING' : gameState.p2SelectedMoveKey;
  if (!p2MoveKey && gameState.p2.isCPU && !gameState.p2AlwaysIdle) {
    p2MoveKey = getCPUMoveChoice(gameState.p2, gameState.p1, 'p2');
  }
  if (!p2MoveKey) p2MoveKey = 'DO_NOTHING';

  let p1Time = (gameState.input && gameState.input.lockInTime) ? gameState.input.lockInTime : 1;
  let p2Time = gameState.p2LockInTime || 1;

  if (gameState.p1.isCPU && p1MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p1MoveKey);
  }
  if (gameState.p2.isCPU && !gameState.p2AlwaysIdle && p2MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p2MoveKey);
  }

  let p1Move = getMoveForPlayer('p1', p1MoveKey);
  let p2Move = getMoveForPlayer('p2', p2MoveKey);

  // Process Instant Utility Effects
  if (p1Move && p1Move.faintRecovery) {
    gameState.p1.faintMeter = Math.max(0, gameState.p1.faintMeter - p1Move.faintRecovery);
    triggerFloatingText('p1', `FAINT -${p1Move.faintRecovery}`, 'heal');
  }
  if (p2Move && p2Move.faintRecovery) {
    gameState.p2.faintMeter = Math.max(0, gameState.p2.faintMeter - p2Move.faintRecovery);
    triggerFloatingText('p2', `FAINT -${p2Move.faintRecovery}`, 'heal');
  }

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    const p1Charge = gameState.p1.activeChargePercent || 100;
    const p2Charge = gameState.p2.activeChargePercent || 100;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${p1Charge}%) VS P2: ${p2Move.name} (${p2Charge}%)`;
  }

  setSideBoxesBlank(true);

  let p1IsIdle = p1MoveKey === 'DO_NOTHING';
  let p2IsIdle = p2MoveKey === 'DO_NOTHING';
  let p1GoesFirst = false;

  let p1IsS = p1MoveKey.startsWith('S');
  let p2IsS = p2MoveKey.startsWith('S');
  let p1IsD = p1MoveKey.startsWith('D');
  let p2IsD = p2MoveKey.startsWith('D');

  if (!p1IsIdle && p2IsIdle) {
    p1GoesFirst = true;
  } else if (p1IsIdle && !p2IsIdle) {
    p1GoesFirst = false;
  } 
  else if (p1IsS && p2IsD) {
    p1GoesFirst = true;
  } else if (p1IsD && p2IsS) {
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

  if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
    if (move1.buff) applyBuff(attacker1, move1.buff.id, move1.buff.label, move1.buff.type, move1.buff.duration);
    handleAirborneState(attacker1, key1, move1);

    attacker1.chi = Math.max(0, attacker1.chi - (move1.chiCost || 0));
    updateHUD();

    if (move1.type === 'DEFENSE' && (move2.type === 'IDLE' || move2.type === 'BUFF' || move2.type === 'UTILITY')) {
      await playCenterVideo(atkKey1, move1.video || 'guard.mp4', move1.name, 1000, move1);
    } else {
      await playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name, null, move1);
      attack1Result = resolveAttack(attacker1, defender1, move1, key1, move2, key2, defKey1);
    }

    if (attack1Result.hitLanded && key1.startsWith('D')) {
      const chiGain = (key1 === 'D+J' || key1 === 'D+K') ? 2 : 3;
      attacker1.chi = Math.min(16, attacker1.chi + chiGain);
    }
    updateHUD();

    if (attack1Result.hitLanded && !attack1Result.isGlancing && (move1.type === 'MELEE' || move1.type === 'PROJECTILE' || move1.type === 'SPECIAL' || move1.type === 'PHYSICAL')) {
      const hitVid = key1.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
      await playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
    }
  }

  // STEP 2 EXECUTION (Cancelled immediately if defender2 was KO'd or Stunned in Step 1)
  if (defender2.lp > 0 && !defender2.isFainted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING') {
    if (move2.buff) applyBuff(attacker2, move2.buff.id, move2.buff.label, move2.buff.type, move2.buff.duration);
    handleAirborneState(attacker2, key2, move2);

    attacker2.chi = Math.max(0, attacker2.chi - (move2.chiCost || 0));
    updateHUD();

    await playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name, null, move2);
    let attack2Result = resolveAttack(attacker2, defender2, move2, key2, move1, key1, defKey2);

    if (attack2Result.hitLanded && key2.startsWith('D')) {
      const chiGain = (key2 === 'D+J' || key2 === 'D+K') ? 2 : 3;
      attacker2.chi = Math.min(16, attacker2.chi + chiGain);
    }
    updateHUD();

    if (attack2Result.hitLanded && !attack2Result.isGlancing && (move2.type === 'MELEE' || move2.type === 'PROJECTILE' || move2.type === 'SPECIAL' || move2.type === 'PHYSICAL')) {
      const hitVid = key2.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
      await playCenterVideo(defKey2, hitVid, 'TAKING DAMAGE');
    }
  } else if (defender2.isFainted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING') {
    triggerFloatingText(defKey1, 'INTERRUPTED!', 'scratch');
  }

  // ROUND CONCLUSION
  setTimeout(() => {
    hideCenterScreen();
    setSideBoxesBlank(false);

    if (battleMsg) battleMsg.hidden = true;

    processRoundBuffs(gameState.p1);
    processRoundBuffs(gameState.p2);

    ['p1', 'p2'].forEach(slot => {
      const player = gameState[slot];
      if (player) {
        if (player.isFainted) {
          player.isFainted = false;
          player.faintMeter = 0;
        } else if (!player.tookCleanHitThisRound) {
          player.faintMeter = Math.max(0, player.faintMeter - FAINT_CFG.ROUND_RECOVERY);
        }
        player.tookCleanHitThisRound = false;
      }
    });

    updateHUD();

    if (gameState.p1.lp > 0 && gameState.p2.lp > 0) {
      gameState.roundCounter++;
      if (typeof startRoundCountdown === 'function') {
        startRoundCountdown();
      }
    } else {
      gameState.roundPhase = 'GAME_OVER';
      if (battleMsg) battleMsg.hidden = false;

      ['p1', 'p2'].forEach(slot => {
        const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
        if (stunOverlay) stunOverlay.hidden = true;
      });

      let resultText = "";
      if (gameState.p1.lp <= 0 && gameState.p2.lp <= 0) {
        resultText = "DOUBLE KO!<br>DRAW MATCH!";
        updateCharacterMedia('p1', 'KO');
        updateCharacterMedia('p2', 'KO');
      } else if (gameState.p1.lp <= 0) {
        resultText = `KO!<br>P2 ${gameState.p2.name.toUpperCase()} WINS!`;
        updateCharacterMedia('p1', 'KO');
        updateCharacterMedia('p2', 'VICTORY');
      } else {
        resultText = `KO!<br>P1 ${gameState.p1.name.toUpperCase()} WINS!`;
        updateCharacterMedia('p1', 'VICTORY');
        updateCharacterMedia('p2', 'KO');
      }

      battleMsg.innerHTML = `${resultText}<br><span class="continue-prompt">PRESS ANY KEY TO CONTINUE</span>`;

      gameState.canContinueFromGameOver = false;
      setTimeout(() => {
        gameState.canContinueFromGameOver = true;
      }, 1000);
    }
  }, 1000);
}

// ATTACK RESOLUTION ENGINE
function resolveAttack(attacker, defender, atkMove, atkMoveKey, defMove, defMoveKey, defenderKey) {
  if (atkMove.type !== 'MELEE' && atkMove.type !== 'PROJECTILE' && atkMove.type !== 'SPECIAL' && atkMove.type !== 'FINISHER' && atkMove.type !== 'PHYSICAL') return { hitLanded: false, isGlancing: false };

  const atkChargeRatio = Math.max(0.5, (attacker.activeChargePercent || 100) / 100);
  const defChargeRatio = Math.max(0.5, (defender.activeChargePercent || 100) / 100);

  // 1. HIT & EVASION CALCULATION
  let baseHitChance = atkMove.hitChance || 80;
  let attackerHitBonus = (attacker.id === 'nigo' && attacker.airborneTicks > 0) ? 15 : 0;
  let defenderEvasionBonus = (defender.id === 'ichigo' && defender.airborneTicks > 0) ? 20 : 0;

  let rolledHit = false;
  if (defMove.type === 'IDLE' || defMoveKey === 'DO_NOTHING' || defMove.name === 'Do Nothing') {
    rolledHit = true;
  } else {
    let effectiveHitChance = Math.max(10, ((baseHitChance + attackerHitBonus) * atkChargeRatio) - defenderEvasionBonus);
    rolledHit = Math.random() * 100 < effectiveHitChance;
  }

  if (!rolledHit) {
    triggerFloatingText(defenderKey, 'MISS!!', 'miss');
    return { hitLanded: false, isGlancing: false };
  }

  let isGlancing = Math.random() * 100 < 15; 

  // 2. DEFENSE & GUARD RATIOS
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

  if (defender.activeBuffs && defender.activeBuffs.some(b => b.id === 'red_shutter')) {
    damageRatio *= 0.85; 
  }

  // 3. ATTACK MULTIPLIERS
  let isDOrS = atkMoveKey.startsWith('D') || atkMoveKey.startsWith('S');
  let typhoonMultiplier = (isDOrS && attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'typhoon' || b.id === 'typhoon_speed')) ? 1.25 : 1.0;

  let focusMultiplier = 1.0;
  if (attacker.activeBuffs) {
    if (atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus')) {
      focusMultiplier = 1.20;
    } else if (atkMoveKey.startsWith('D') && attacker.activeBuffs.some(b => b.id === 'power_focus')) {
      focusMultiplier = 1.30;
    }
  }

  let jumpAtkMultiplier = attacker.airborneTicks > 0 ? 1.15 : 1.0;
  
  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * typhoonMultiplier * focusMultiplier * jumpAtkMultiplier * damageRatio;

  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.10)) : Math.floor(calculatedDmg);

  if (isGlancing) {
    triggerFloatingText(defenderKey, 'Near-miss!!', 'scratch');
  }

  if (finalDmg > 0) {
    defender.lp = Math.max(0, defender.lp - finalDmg);

    if (isGlancing) {
      setTimeout(() => triggerFloatingNumber(defenderKey, finalDmg, false), 250);
    } else {
      triggerFloatingNumber(defenderKey, finalDmg, false);
    }

    if (!isGlancing && !defender.isFainted) {
      defender.tookCleanHitThisRound = true;
      defender.faintMeter = Math.min(FAINT_CFG.FAINT_THRESHOLD, defender.faintMeter + FAINT_CFG.HIT_BUILDUP);
      
      // INSTANT FAINT & STUN INTERRUPT
      if (defender.faintMeter >= FAINT_CFG.FAINT_THRESHOLD) {
        defender.isFainted = true;
        
        const stunOverlay = document.getElementById(`${defenderKey}-stun-overlay`);
        if (stunOverlay) stunOverlay.hidden = false;

        triggerFloatingText(defenderKey, 'STUNNED!!', 'scratch');
      }
    }
  }

  return { hitLanded: finalDmg > 0, isGlancing: isGlancing };
}
