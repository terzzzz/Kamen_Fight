
let gameState = {
  turnCounter: 1,
  movesData: {},
  p1: null,
  p2: null
};

async function startBattle(config) {
  const response = await fetch('data/moves.json');
  gameState.movesData = await response.json();

  gameState.p1 = createPlayerState(config.p1Rider, config.p1IsCPU);
  gameState.p2 = createPlayerState(config.p2Rider, config.p2IsCPU);

  updateHUD();
  bindCommandButtons();

  if (gameState.p1.isCPU && gameState.p2.isCPU) {
    runAutoMatchLoop();
  }
}

function createPlayerState(riderConfig, isCPU) {
  return {
    ...riderConfig,
    isCPU: isCPU,
    lp: riderConfig.maxLp,
    chi: 10, // Max 20 CHI system; starts at 10 CHI
    consecutiveHitsLanded: 0,
    isFainted: false,
    faintTimer: null,
    airborneTicks: 0,
    atkBuff: 1.0,
    currentFormKey: riderConfig.activeForm || 'base'
  };
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.cmd-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.getAttribute('data-cmd');
      if (gameState.p1.isCPU || gameState.p1.isFainted) return;
      executeTurn(cmd);
    };
  });
}

function executeTurn(p1Cmd) {
  let p1MoveKey = gameState.p1.isCPU ? selectCPUMove(gameState.p1, gameState.p2, gameState.movesData) : p1Cmd;
  let p2MoveKey = selectCPUMove(gameState.p2, gameState.p1, gameState.movesData);

  let p1Move = gameState.movesData[p1MoveKey];
  let p2Move = gameState.movesData[p2MoveKey];

  // CHI Deduction
  gameState.p1.chi -= p1Move.chiCost;
  gameState.p2.chi -= p2Move.chiCost;

  // Charge Action Handling
  if (p1MoveKey === 'S+J') gameState.p1.chi = Math.min(20, gameState.p1.chi + gameState.p1.chiRegen);
  if (p2MoveKey === 'S+J') gameState.p2.chi = Math.min(20, gameState.p2.chi + gameState.p2.chiRegen);

  // Form Swap Command (RX Transformation)
  if (p1MoveKey === 'W+J' && gameState.p1.forms) cycleRiderForm(gameState.p1);
  if (p2MoveKey === 'W+J' && gameState.p2.forms) cycleRiderForm(gameState.p2);

  // Airborne Timer Evaluation
  handleAirborneState(gameState.p1, p1MoveKey);
  handleAirborneState(gameState.p2, p2MoveKey);

  // Resolution Math
  let p1Hit = resolveAttack(gameState.p1, gameState.p2, p1Move, p2Move);
  let p2Hit = resolveAttack(gameState.p2, gameState.p1, p2Move, p1Move);

  // Fainted State Triggers (3 Consecutive Landed Hits)
  updateFaintTracker(gameState.p1, gameState.p2, p1Hit, 'p2');
  updateFaintTracker(gameState.p2, gameState.p1, p2Hit, 'p1');

  // Center Item Lifecycle
  checkItemSpawn(gameState.turnCounter);
  resolveItemPickup(p1Hit && !p2Hit, p2Hit && !p1Hit, gameState.p1, gameState.p2);

  gameState.turnCounter++;
  updateHUD();
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
  attacker.atkBuff = 1.0; // Reset consumable buff
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

function runAutoMatchLoop() {
  let interval = setInterval(() => {
    if (gameState.p1.lp <= 0 || gameState.p2.lp <= 0) {
      clearInterval(interval);
      return;
    }
    executeTurn(null);
  }, 2000);
}
