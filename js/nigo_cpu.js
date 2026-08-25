/**
 * Nigo CPU Decision Engine (3-Turn Lookahead / Heavy Power Brawler)
 * Path: js/nigo_cpu.js
 */

function selectNigoCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const moveKeys = Object.keys(availableMoves);
  const isOpponentLocked = gameState.input && gameState.input.isConfirmed;
  const oppMoveKey = gameState.input ? gameState.input.selectedMoveKey : null;

  // 1. EASY DIFFICULTY: RANDOM SELECTION
  if (difficulty === 'easy') {
    return moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  // 2. NORMAL DIFFICULTY: GREEDY EVALUATION
  if (difficulty === 'normal') {
    let bestKey = 'D+J';
    let maxDmg = -1;

    moveKeys.forEach(key => {
      const move = availableMoves[key];
      const baseDmg = move.baseDamage || 0;
      if (baseDmg > maxDmg) {
        maxDmg = baseDmg;
        bestKey = key;
      }
    });
    setNigoChargeTarget(cpuPlayer, bestKey, opponentPlayer);
    return bestKey;
  }

  // 3. HARD DIFFICULTY: TACTICAL EVALUATION TREE
  let bestMoveKey = 'D+J';
  let highestEV = -9999;

  moveKeys.forEach(mKey1 => {
    const move1 = availableMoves[mKey1];
    if ((move1.chiCost || 0) > cpuPlayer.chi) return;

    let ev = evaluateNigoMoveScore(cpuPlayer, opponentPlayer, mKey1, move1, isOpponentLocked, oppMoveKey);

    if (ev > highestEV) {
      highestEV = ev;
      bestMoveKey = mKey1;
    }
  });

  setNigoChargeTarget(cpuPlayer, bestMoveKey, opponentPlayer);
  return bestMoveKey;
}

/**
 * Evaluates tactical expected value (EV) for Nigo's unique moveset
 */
/**
 * Evaluates tactical expected value (EV) for Nigo's unique moveset
 */
function evaluateNigoMoveScore(cpu, opp, mKey1, move1, isOppLocked, oppMoveKey) {
  let score = move1.baseDamage || 0;

  const hasPowerFocus = cpu.activeBuffs && cpu.activeBuffs.some(b => b.id === 'power_focus');
  const hasRedShutter = cpu.activeBuffs && cpu.activeBuffs.some(b => b.id === 'red_shutter');
  const isAirborne = cpu.airborneTicks > 0;

  // A. POWER FOCUS (W+K) & PHYSICAL ATTACK SYNERGY (+30% D-ATK)
  // Higher weight on D-moves since Nigo's physical loop out-damages unbuffed low-tier S moves
  if (mKey1 === 'W+K' && !hasPowerFocus && cpu.chi >= 1) {
    score += 130; // Increased setup priority for Power Focus
  }
  if (hasPowerFocus && mKey1.startsWith('D')) {
    score += (move1.baseDamage || 0) * 0.45; // Increased bonus to lean into heavy physical loops
  }

  // B. RIDER POWER JUMP (W+I) & AIRBORNE FINISHER SYNERGY (+15% HIT / +15% ATK)
  if (mKey1 === 'W+I' && !isAirborne && cpu.chi >= 6) {
    score += 85;
  }
  if (isAirborne && mKey1.startsWith('S')) {
    score += 90; // Moderated bonus to reflect lower S-move base damage
  }

  // C. TYPHOON RED SHUTTER (W+J) TANKING (-15% DMG)
  if (mKey1 === 'W+J' && !hasRedShutter && opp.chi >= 6) {
    score += 110;
  }

  // D. BATTLE CRY (W+L) FAINT RECOVERY LOGIC
  if (mKey1 === 'W+L') {
    if (cpu.faintMeter >= 75) {
      score += 200;
    } else if (cpu.faintMeter >= 50 && cpu.chi >= 5) {
      score += 70;
    } else {
      score -= 100;
    }
  }

  // E. REACTION GUARDING IF OPPONENT IS LOCKED
  if (isOppLocked && oppMoveKey && !oppMoveKey.startsWith('A+') && oppMoveKey !== 'DO_NOTHING') {
    if (mKey1.startsWith('A+')) {
      score += 130;
    }
  }

  // F. CHI BUILDING PRIORITY
  if (mKey1.startsWith('D')) {
    score += 25; // Physical moves build +2 or +3 Chi
  }

  return score;
}

/**
 * Sets Target Charge Percentage for Nigo (Speed Tuning vs Player Habits)
 */
function setNigoChargeTarget(cpuPlayer, moveKey, opponentPlayer) {
  let target = 100;

  if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (moveKey.startsWith('D')) {
    let playerDCharge = 88;
    if (window.globalAIKnowledge && window.globalAIKnowledge.playerProfiles) {
      const profile = window.globalAIKnowledge.playerProfiles[opponentPlayer.id || 'human'];
      if (profile && profile.avgCharge && profile.avgCharge.D) {
        playerDCharge = profile.avgCharge.D;
      }
    }
    target = Math.max(65, playerDCharge - (3 + Math.floor(Math.random() * 3)));
  } else {
    target = 100;
  }

  cpuPlayer.activeChargePercent = target;
}
