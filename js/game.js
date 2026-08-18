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
  hitChance: 100
};

let gameState = {
  turnCounter: 1,
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
  const response = await fetch('data/moves.json');
  gameState.movesData = await response.json();

  gameState.p1 = createPlayerState(config.p1Rider, config.p1IsCPU);
  gameState.p2 = createPlayerState(config.p2Rider, config.p2IsCPU);

  bindKeyboardInputs();
  bindCommandButtons();
  startTurnCountdown();
  updateHUD();
}

function createPlayerState(riderConfig, isCPU) {
  return {
    ...riderConfig,
    isCPU: isCPU,
    lp: riderConfig.maxLp,
    chi: 10,
    consecutiveHitsLanded: 0,
    isFainted: false,
    airborneTicks: 0,
    atkBuff: 1.0,
    currentFormKey: riderConfig.activeForm || 'base'
  };
}

function startTurnCountdown() {
  clearInterval(gameState.timerInterval);
  gameState.turnTimerSeconds = 5;
  document.getElementById('turn-timer').textContent = `TIME: ${gameState.turnTimerSeconds}s`;

  gameState.timerInterval = setInterval(() => {
    gameState.turnTimerSeconds--;
    document.getElementById('turn-timer').textContent = `TIME: ${gameState.turnTimerSeconds}s`;

    if (gameState.turnTimerSeconds <= 0) {
      clearInterval(gameState.timerInterval);
      
      // Fallback to "DO NOTHING" if no action locked in
      if (!gameState.input.isConfirmed && !gameState.p1.isCPU) {
        confirmPlayerAction('DO_NOTHING');
      }
      executeTurnCycle();
    }
  }, 1000);
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();

    // Light up corresponding UI button element on key press
    const keyEl = document.getElementById(`key-${key}`);
    if (keyEl) keyEl.classList.add('active');

    if (gameState.p1.isCPU || gameState.input.isConfirmed || gameState.p1.isFainted) return;

    // 1. Directional Hold Engine (A, D, W, S)
    if (['A', 'D', 'W', 'S'].includes(key)) {
      if (gameState.input.heldDirection !== key) {
        resetCharge();
        gameState.input.heldDirection = key;
        gameState.input.chargeStartTime = Date.now();
        gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);
      }
    }

    // 2. Action Triggering (J, K, L, I)
    if (['J', 'K', 'L', 'I'].includes(key)) {
      // Ignore key press completely if % charge is 0 or direction not held
      if (!gameState.input.heldDirection || gameState.input.currentPercent <= 0) {
        return;
      }

      // Execute lock-in if fully charged to 100%
      if (gameState.input.currentPercent >= 100) {
        confirmPlayerAction(`${gameState.input.heldDirection}+${key}`);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toUpperCase();

    // Turn off lighting FX
    const keyEl = document.getElementById(`key-${key}`);
    if (keyEl) keyEl.classList.remove('active');

    if (key === gameState.input.heldDirection && !gameState.input.isConfirmed) {
      resetCharge(); // Instant 0% reset on direction release
    }
  });
}

function updateChargeProgress() {
  if (!gameState.input.heldDirection) return;

  const duration = CHARGE_TIMES[gameState.input.heldDirection];
  const elapsed = Date.now() - gameState.input.chargeStartTime;

  gameState.input.currentPercent = Math.min(100, Math.floor((elapsed / duration) * 100));

  const fillEl = document.getElementById('p1-charge-fill');
  fillEl.style.width = `${gameState.input.currentPercent}%`;
  fillEl.textContent = `${gameState.input.currentPercent}%`;
}

function resetCharge() {
  clearInterval(gameState.input.chargeInterval);
  gameState.input.heldDirection = null;
  gameState.input.currentPercent = 0;

  const fillEl = document.getElementById('p1-charge-fill');
  fillEl.style.width = '0%';
  fillEl.textContent = '0%';
}

function confirmPlayerAction(moveKey) {
  gameState.input.isConfirmed = true;
  gameState.input.selectedMoveKey = moveKey;
  gameState.input.lockInTime = gameState.turnTimerSeconds;
  clearInterval(gameState.input.chargeInterval);

  const flagEl = document.getElementById('p1-action-flag');
  flagEl.hidden = false;
  flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : 'ACTION!';
}

function bindCommandButtons() {
  // Support on-screen clicks for controller elements if needed
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

function executeTurnCycle() {
  let p1Time = gameState.input.lockInTime || 0;
  let p2Time = gameState.p2.isCPU ? Math.floor(Math.random() * 4 + 1) : (gameState.p2LockInTime || 0);

  let p1MoveKey = gameState.input.selectedMoveKey || 'DO_NOTHING';
  let p2MoveKey = gameState.p2.isCPU 
    ? selectCPUMove(gameState.p2, gameState.p1, gameState.movesData) 
    : (gameState.p2SelectedMoveKey || 'DO_NOTHING');

  let p1Move = p1MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p1MoveKey] || DO_NOTHING_MOVE);
  let p2Move = p2MoveKey === 'DO_NOTHING' ? DO_NOTHING_MOVE : (gameState.movesData[p2MoveKey] || DO_NOTHING_MOVE);

  // Deduct CHI Costs
  gameState.p1.chi = Math.max(0, gameState.p1.chi - p1Move.chiCost);
  gameState.p2.chi = Math.max(0, gameState.p2.chi - p2Move.chiCost);

  // Charge CHI Action
  if (p1MoveKey === 'S+J') gameState.p1.chi = Math.min(20, gameState.p1.chi + (gameState.p1.chiRegen || 5));
  if (p2MoveKey === 'S+J') gameState.p2.chi = Math.min(20, gameState.p2.chi + (gameState.p2.chiRegen || 5));

  // Form Transformations
  if (p1MoveKey === 'W+J' && gameState.p1.forms) cycleRiderForm(gameState.p1);
  if (p2MoveKey === 'W+J' && gameState.p2.forms) cycleRiderForm(gameState.p2);

  // Handle Airborne Timers
  handleAirborneState(gameState.p1, p1MoveKey);
  handleAirborneState(gameState.p2, p2MoveKey);

  // Initiative Logic with Defensive Priority & P1 Tie-Breaker
  let p1IsDefensive = p1Move.type === 'DEFENSE';
  let p2IsDefensive = p2Move.type === 'DEFENSE';
  let p1GoesFirst = false;

  if (p1IsDefensive && !p2IsDefensive) {
    p1GoesFirst = false; // Defensive skill executes AFTER opponent's attack
  } else if (!p1IsDefensive && p2IsDefensive) {
    p1GoesFirst = true;  // Opponent is defending, P1 attacks first
  } else {
    // Both attacking or both defending/doing nothing:
    // Higher remaining timer goes first. On tie, default to Player 1
    if (p1Time === p2Time) {
      p1GoesFirst = true;
    } else {
      p1GoesFirst = p1Time > p2Time;
    }
  }

  // Assign Attacker/Defender Roles
  let attacker1 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let defender1 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;

  let attacker2 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let defender2 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;

  // Execute First Action
  let hit1Landed = resolveAttack(attacker1, defender1, move1, move2);

  // Execute Second Action (Canceled if interrupted by faster clean melee hit)
  let hit2Landed = false;
  if (!hit1Landed || move1.type !== 'MELEE') {
    hit2Landed = resolveAttack(attacker2, defender2, move2, move1);
  }

  // Faint Mechanics Processing
  updateFaintTracker(attacker1, defender1, hit1Landed, p1GoesFirst ? 'p2' : 'p1');
  updateFaintTracker(attacker2, defender2, hit2Landed, p1GoesFirst ? 'p1' : 'p2');

  // Items Lifecycle
  if (typeof checkItemSpawn === 'function') checkItemSpawn(gameState.turnCounter);
  if (typeof resolveItemPickup === 'function') {
    resolveItemPickup(p1GoesFirst ? hit1Landed : hit2Landed, p1GoesFirst ? hit2Landed : hit1Landed, gameState.p1, gameState.p2);
  }

  // Cleanup Turn
  gameState.turnCounter++;
  resetTurnState();
  updateHUD();

  if (gameState.p1.lp > 0 && gameState.p2.lp > 0) {
    startTurnCountdown();
  }
}

function resetTurnState() {
  resetCharge();
  gameState.input.isConfirmed = false;
  gameState.input.selectedMoveKey = null;
  gameState.input.lockInTime = 0;
  document.getElementById('p1-action-flag').hidden = true;
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

function cycleRiderForm(player) {
  const formKeys = Object.keys(player.forms);
  let nextIndex = (formKeys.indexOf(player.currentFormKey) + 1) % formKeys.length;
  player.currentFormKey = formKeys[nextIndex];
}

function resolveAttack(attacker, defender, atkMove, defMove) {
  if (atkMove.type !== 'MELEE' && atkMove.type !== 'PROJECTILE' && atkMove.type !== 'FINISHER') return false;

  let rolledHit = Math.random() * 100 < atkMove.hitChance;
  if (!rolledHit) return false;

  let damageRatio = 1.0;
  if (defMove.type === 'DEFENSE') {
    let success = Math.random() * 100 < (defMove.successChance || 80);
    if (success) {
      damageRatio = defMove.damageTakenRatio || 0.2;
      if (defMove.chiGainOnSuccess) defender.chi = Math.min(20, defender.chi + defMove.chiGainOnSuccess);
    }
  }

  let finalDmg = Math.floor((atkMove.baseDamage || 0) * attacker.atkBuff * damageRatio);
  defender.lp = Math.max(0, defender.lp - finalDmg);
  attacker.atkBuff = 1.0;
  return finalDmg > 0;
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
  document.getElementById(`${slotKey}-stun-overlay`).hidden = false;
  document.getElementById(`${slotKey}-status`).textContent = 'FAINTED (5s)';

  setTimeout(() => {
    targetPlayer.isFainted = false;
    document.getElementById(`${slotKey}-stun-overlay`).hidden = true;
    document.getElementById(`${slotKey}-status`).textContent = 'NORMAL';
  }, 5000);
}

function updateHUD() {
  document.getElementById('p1-lp').textContent = gameState.p1.lp;
  document.getElementById('p1-chi').textContent = gameState.p1.chi;
  document.getElementById('p2-lp').textContent = gameState.p2.lp;
  document.getElementById('p2-chi').textContent = gameState.p2.chi;
  document.getElementById('turn-display').textContent = `TURN ${gameState.turnCounter}`;
}
