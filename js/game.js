const CHARGE_TIMES = {
  'A': 800,   // Defense: 0.8s
  'D': 1300,  // Offense: 1.3s
  'W': 2000,  // Air/Buffs: 2.0s
  'S': 2600   // Energy/Specials: 2.6s
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
      // Timeout default fallback to Guard if no action confirmed
      if (!gameState.input.isConfirmed && !gameState.p1.isCPU) {
        confirmPlayerAction('A+J');
      }
      executeTurnCycle();
    }
  }, 1000);
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    if (gameState.p1.isCPU || gameState.input.isConfirmed || gameState.p1.isFainted) return;

    const key = e.key.toUpperCase();

    // Directional Hold Engine (A, D, W, S)
    if (['A', 'D', 'W', 'S'].includes(key)) {
      if (gameState.input.heldDirection !== key) {
        resetCharge(); // Instant 0% reset on direction switch
        gameState.input.heldDirection = key;
        gameState.input.chargeStartTime = Date.now();
        gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);
      }
    }

    // Action Triggering (J, K, L, I) when 100% Charged
    if (['J', 'K', 'L', 'I'].includes(key) && gameState.input.heldDirection) {
      if (gameState.input.currentPercent >= 100) {
        confirmPlayerAction(`${gameState.input.heldDirection}+${key}`);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toUpperCase();
    if (key === gameState.input.heldDirection && !gameState.input.isConfirmed) {
      resetCharge(); // Instant 0% reset on button release
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
  clearInterval(gameState.input.chargeInterval);

  document.getElementById('p1-action-flag').hidden = false;
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.cmd-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      if (gameState.p1.isCPU || gameState.p1.isFainted || gameState.input.isConfirmed) return;
      const cmd = btn.getAttribute('data-cmd');
      confirmPlayerAction(cmd);
    };
  });
}

function executeTurnCycle() {
  let p1MoveKey = gameState.p1.isCPU
    ? selectCPUMove(gameState.p1, gameState.p2, gameState.movesData)
    : (gameState.input.selectedMoveKey || 'A+J');

  let p2MoveKey = selectCPUMove(gameState.p2, gameState.p1, gameState.movesData);

  let p1Move = gameState.movesData[p1MoveKey] || gameState.movesData['A+J'];
  let p2Move = gameState.movesData[p2MoveKey] || gameState.movesData['A+J'];

  // Deduct CHI Costs
  gameState.p1.chi = Math.max(0, gameState.p1.chi - p1Move.chiCost);
  gameState.p2.chi = Math.max(0, gameState.p2.chi - p2Move.chiCost);

  // Charge CHI Action
  if (p1MoveKey === 'S+J') gameState.p1.chi = Math.min(20, gameState.p1.chi + gameState.p1.chiRegen);
  if (p2MoveKey === 'S+J') gameState.p2.chi = Math.min(20, gameState.p2.chi + gameState.p2.chiRegen);

  // Form Transformations
  if (p1MoveKey === 'W+J' && gameState.p1.forms) cycleRiderForm(gameState.p1);
  if (p2MoveKey === 'W+J' && gameState.p2.forms) cycleRiderForm(gameState.p2);

  // Handle Airborne Timers
  handleAirborneState(gameState.p1, p1MoveKey);
  handleAirborneState(gameState.p2, p2MoveKey);

  // Resolve Damage
  let p1Hit = resolveAttack(gameState.p1, gameState.p2, p1Move, p2Move);
  let p2Hit = resolveAttack(gameState.p2, gameState.p1, p2Move, p1Move);

  // Track Faint Mechanics
  updateFaintTracker(gameState.p1, gameState.p2, p1Hit, 'p2');
  updateFaintTracker(gameState.p2, gameState.p1, p2Hit, 'p1');

  // Items Lifecycle
  checkItemSpawn(gameState.turnCounter);
  resolveItemPickup(p1Hit && !p2Hit, p2Hit && !p1Hit, gameState.p1, gameState.p2);

  // Turn Cleanup & Reset Input State
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
    let success = Math.random() * 100 < defMove.successChance;
    if (success) {
      damageRatio = defMove.damageTakenRatio;
      if (defMove.chiGainOnSuccess) defender.chi = Math.min(20, defender.chi + defMove.chiGainOnSuccess);
    }
  }

  let finalDmg = Math.floor(atkMove.baseDamage * attacker.atkBuff * damageRatio);
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
