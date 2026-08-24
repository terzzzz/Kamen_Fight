/**
 * Kamen Rider Ichigo AI Decision Engine
 * Path: js/vs/ichigo_cpu.js
 * 3-Turn Lookahead Engine with Reaction Delays, 8s Round Timer Constraints & Guarding Mechanics
 */

function selectIchigoCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  // 1. CALCULATE TIME REMAINING & CPU THINKING DELAY
  const ROUND_TIME_LIMIT = 8.0; // 8 Seconds Max per Round
  let currentRoundTime = (typeof gameState !== 'undefined' && gameState.roundTimeRemaining !== undefined)
    ? gameState.roundTimeRemaining
    : ROUND_TIME_LIMIT;

  // Simulate human-like CPU reaction/thinking delay (0.4s to 1.0s after round starts)
  let cpuThinkingDelay = 0.4 + (Math.random() * 0.6);
  let availableChargeTime = Math.max(0, currentRoundTime - cpuThinkingDelay);

  // 100% Charge takes 2.5 seconds (0.025s per 1% charge)
  let maxAchievableCharge = Math.min(100, Math.floor((availableChargeTime / 2.5) * 100));

  // 2. FILTER AFFORDABLE MOVES
  const affordableKeys = Object.keys(movesData).filter(key => {
    const m = movesData[key];
    return m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  let selectedMoveKey = 'D+J';

  // --- EASY DIFFICULTY ---
  if (difficulty === 'easy') {
    if (Math.random() < 0.60) {
      selectedMoveKey = affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
    } else {
      selectedMoveKey = getIchigoSimple1TurnChoice(cpuPlayer, opponentPlayer, movesData, affordableKeys);
    }
  } 
  // --- HARD DIFFICULTY: PREDICTIVE/REACTIVE GUARD OVERRIDE ---
  else if (difficulty === 'hard') {
    const opponentMoveKey = gameState.p1SelectedMoveKey || (gameState.input ? gameState.input.selectedMoveKey : null);
    let guardChosen = false;

    if (opponentMoveKey && !opponentMoveKey.startsWith('A+') && opponentMoveKey !== 'DO_NOTHING') {
      const oppButton = opponentMoveKey.split('+')[1];
      if (opponentMoveKey.startsWith('S') && cpuPlayer.chi >= 0 && movesData['A+I'] && Math.random() < 0.85) {
        selectedMoveKey = 'A+I';
        guardChosen = true;
      } else if (oppButton && movesData[`A+${oppButton}`] && Math.random() < 0.80) {
        selectedMoveKey = `A+${oppButton}`;
        guardChosen = true;
      }
    }

    if (!guardChosen) {
      selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'hard', maxAchievableCharge);
    }
  } 
  // --- NORMAL DIFFICULTY ---
  else {
    selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'normal', maxAchievableCharge);
  }

  // ENFORCE CHARGE TARGET CAPPED BY 8s TIMER CONSTRAINT
  setCPUChargeTarget(cpuPlayer, selectedMoveKey, maxAchievableCharge);

  return selectedMoveKey;
}

/**
 * Assigns charge targets capped by maximum achievable charge before 8s timer expires
 */
function setCPUChargeTarget(cpuPlayer, moveKey, maxAchievableCharge) {
  let desiredCharge = 100;

  if (moveKey === 'A+I') {
    desiredCharge = 100;
  } else if (moveKey.startsWith('A+')) {
    desiredCharge = 15; // Fast matching guard lock-in
  } else if (moveKey.startsWith('S') || moveKey === 'W+I' || moveKey === 'W+K') {
    desiredCharge = 100;
  } else if (moveKey.startsWith('D')) {
    desiredCharge = 90 + Math.floor(Math.random() * 11);
  }

  // FORCE CHARGE CAP BASED ON REMAINING TIMER TIME
  cpuPlayer.activeChargePercent = Math.min(desiredCharge, maxAchievableCharge);
}

function run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, difficulty, maxAchievableCharge) {
  const sequenceEvaluations = runIchigo3TurnSearch(cpuPlayer, opponentPlayer, movesData, affordableKeys, maxAchievableCharge);
  if (sequenceEvaluations.length === 0) return 'D+J';

  const bestPerStartMove = {};
  sequenceEvaluations.forEach(item => {
    if (!bestPerStartMove[item.firstMove] || item.totalEV > bestPerStartMove[item.firstMove].totalEV) {
      bestPerStartMove[item.firstMove] = item;
    }
  });

  const sortedDistinctMoves = Object.values(bestPerStartMove).sort((a, b) => b.totalEV - a.totalEV);
  if (sortedDistinctMoves.length === 1) return sortedDistinctMoves[0].firstMove;

  if (difficulty === 'hard') {
    return Math.random() < 0.90 ? sortedDistinctMoves[0].firstMove : sortedDistinctMoves[1].firstMove;
  } else {
    return Math.random() < 0.50 ? sortedDistinctMoves[0].firstMove : sortedDistinctMoves[1].firstMove;
  }
}

function runIchigo3TurnSearch(cpuPlayer, opponentPlayer, movesData, affordableKeys, maxAchievableCharge) {
  const START_CHI = cpuPlayer.chi || 0;
  const OPP_LP = opponentPlayer.lp || 1050;
  const CPU_LP = cpuPlayer.lp || 1050;
  const OPP_AVG_DMG = 175;

  const activeBuffs = cpuPlayer.activeBuffs || [];
  const START_FOCUS = activeBuffs.some(b => b.id === 'focus' || b.id === 'power_focus') ? 2 : 0;
  const START_AIRBORNE = cpuPlayer.airborneTicks || 0;
  const START_FAINT = opponentPlayer.faintMeter || 0;
  const OPP_CHI = opponentPlayer.chi || 0;

  const validMoves = Object.keys(movesData).filter(k => !k.startsWith('A+'));
  const sequenceEvaluations = [];

  for (const m1Key of affordableKeys) {
    const m1 = movesData[m1Key];
    // Evaluate turn 1 under time-capped charge constraints (maxAchievableCharge)
    const s1 = simulateIchigoStateTransition(START_CHI, OPP_LP, CPU_LP, START_FOCUS, START_AIRBORNE, START_FAINT, m1Key, m1, OPP_AVG_DMG, OPP_CHI, maxAchievableCharge);

    if (s1.isLethal) {
      sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + 500, path: [m1Key] });
      continue;
    }

    for (const m2Key of validMoves) {
      const m2 = movesData[m2Key];
      if ((m2.chiCost || 0) > s1.chi) continue;

      // Turns 2 & 3 assume normal 100% full turn charge availability
      const s2 = simulateIchigoStateTransition(s1.chi, s1.oppLp, CPU_LP, s1.focus, s1.airborne, s1.faint, m2Key, m2, OPP_AVG_DMG, OPP_CHI, 100);

      if (s2.isLethal) {
        sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + s2.ev + 300, path: [m1Key, m2Key] });
        continue;
      }

      for (const m3Key of validMoves) {
        const m3 = movesData[m3Key];
        if ((m3.chiCost || 0) > s2.chi) continue;

        const s3 = simulateIchigoStateTransition(s2.chi, s2.oppLp, CPU_LP, s2.focus, s2.airborne, s2.faint, m3Key, m3, OPP_AVG_DMG, OPP_CHI, 100);
        const pathTotalEV = s1.ev + s2.ev + s3.ev;

        sequenceEvaluations.push({ firstMove: m1Key, totalEV: pathTotalEV, path: [m1Key, m2Key, m3Key] });
      }
    }
  }

  return sequenceEvaluations;
}

function simulateIchigoStateTransition(chi, oppLp, cpuLp, focus, airborne, faint, moveKey, move, oppAvgDmg, oppChi, currentChargeCap = 100) {
  let nextChi = Math.min(16, chi - ((move && move.chiCost) || 0) + (moveKey.startsWith('D') ? 3 : 0));
  let nextFocus = moveKey === 'W+K' ? 2 : Math.max(0, focus - 1);
  let nextAirborne = moveKey === 'W+I' ? 2 : Math.max(0, airborne - 1);

  // CHARGE FACTOR BASED ON REAL TIME CAP
  let effectiveCharge = Math.min(100, currentChargeCap);
  let chargeRatio = effectiveCharge / 100;
  let chargeFactor = Math.sqrt(0.5 + (0.5 * chargeRatio));

  let baseDmg = (move && move.baseDamage) || 0;
  let hitRate = ((move && move.hitChance) || 80) / 100;
  let weightedDmg = baseDmg * chargeFactor * hitRate * 0.84;

  if (focus > 0 && moveKey.startsWith('S')) weightedDmg *= 1.20;
  if (airborne > 0) weightedDmg *= 1.15;

  let ev = weightedDmg;

  // --- W+K (TYPHOON FOCUS) ---
  if (moveKey === 'W+K') {
    ev += (296.18 * 0.20 * 1.5);
    if (chi < 11) ev -= 80;
  }

  // --- W+I (RIDER HIGH JUMP) WITH TAKEOFF INSTABILITY PENALTY ---
  if (moveKey === 'W+I') {
    let takeoffInstability = 1.8 - (0.8 * chargeRatio);
    ev += (oppAvgDmg * 0.20 * 2); // Evasion savings
    
    // Penalize rushing a jump under timer pressure (low charge = high takeoff vulnerability)
    if (chargeRatio < 1.0) {
      ev -= (oppAvgDmg * (takeoffInstability - 1.0));
    }
    if (chi < 12) ev -= 90;
  }

  // --- A+ GUARDS (EXACT COMBAT.JS CHARGE SCALING) ---
  if (moveKey.startsWith('A+')) {
    if (faint >= 100) {
      ev = 0;
    } else {
      const guardChargeFactor = Math.sqrt(0.5 + (0.5 * chargeRatio));
      const effectiveGuardChance = 0.70 * guardChargeFactor;

      if (moveKey === 'A+I') {
        ev = oppAvgDmg * 1.0 * effectiveGuardChance;
      } else {
        const damageSaved = oppAvgDmg * 0.70 * effectiveGuardChance;
        const chiGainEV = 2 * 20 * effectiveGuardChance;
        ev = damageSaved + chiGainEV;
      }

      if (cpuLp <= 250) {
        ev *= 1.50;
      }
    }
  }

  // --- FAINT BUILDUP & STUN BONUS ---
  let isUtility = moveKey.startsWith('W') || (move && move.type === 'DEFENSE');
  let faintGained = isUtility ? 0 : hitRate * (25 * 0.80 + 10 * 0.20);
  let nextFaint = faint + faintGained;

  if (nextFaint >= 100 && faint < 100) {
    ev += 250;
  } else if (faint >= 75 && !isUtility) {
    ev += (faintGained * 2.5);
  }

  if (isUtility) {
    if (faint >= 75) ev -= 150;
    if (airborne > 0) ev -= 120;
  }

  if (airborne > 0) {
    ev += oppAvgDmg * 0.20;
  }

  let remainingLp = oppLp - weightedDmg;
  return {
    chi: nextChi,
    oppLp: remainingLp,
    focus: nextFocus,
    airborne: nextAirborne,
    faint: nextFaint,
    ev: ev,
    isLethal: remainingLp <= 0
  };
}

function getIchigoSimple1TurnChoice(cpuPlayer, opponentPlayer, movesData, affordableKeys) {
  let bestKey = affordableKeys[0];
  let maxDmg = -1;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    const dmg = (move && move.baseDamage) || 0;
    if (dmg > maxDmg) {
      maxDmg = dmg;
      bestKey = key;
    }
  });

  return bestKey;
}
