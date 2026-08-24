/**
 * Kamen Rider Ichigo AI Decision Engine
 * Path: js/vs/ichigo_cpu.js
 * Specialized 3-Turn Lookahead Engine with Exact Guarding Mechanics & Stance Stacking
 */

function selectIchigoCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

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
  // --- HARD DIFFICULTY: PREDICTIVE / REACTIVE GUARD OVERRIDE ---
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
      selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'hard');
    }
  } 
  // --- NORMAL DIFFICULTY ---
  else {
    selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'normal');
  }

  // ENFORCE CHARGE PERCENTAGE BASED ON MOVE CATEGORY & GUARD MECHANICS
  setCPUChargeTarget(cpuPlayer, selectedMoveKey);

  return selectedMoveKey;
}

/**
 * Assigns optimal charge targets matching combat.js resolution scaling
 */
function setCPUChargeTarget(cpuPlayer, moveKey) {
  if (moveKey === 'A+I') {
    // Windmill Guard requires 100% charge for max 70% block chance
    cpuPlayer.activeChargePercent = 100;
  } else if (moveKey.startsWith('A+')) {
    // Matching Guards (A+J, A+K, A+L) trade slight chance for speed priority (15% lock-in)
    cpuPlayer.activeChargePercent = 15;
  } else if (moveKey.startsWith('S') || moveKey === 'W+I' || moveKey === 'W+K') {
    // Heavy Specials, Jumps, and Power Buffs ALWAYS target 100% Charge
    cpuPlayer.activeChargePercent = 100;
  } else if (moveKey.startsWith('D')) {
    // Physical Attacks charge to 90-100%
    cpuPlayer.activeChargePercent = 90 + Math.floor(Math.random() * 11);
  } else {
    cpuPlayer.activeChargePercent = 100;
  }
}

function run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, difficulty) {
  const sequenceEvaluations = runIchigo3TurnSearch(cpuPlayer, opponentPlayer, movesData, affordableKeys);
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

function runIchigo3TurnSearch(cpuPlayer, opponentPlayer, movesData, affordableKeys) {
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
    const s1 = simulateIchigoStateTransition(START_CHI, OPP_LP, CPU_LP, START_FOCUS, START_AIRBORNE, START_FAINT, m1Key, m1, OPP_AVG_DMG, OPP_CHI);

    if (s1.isLethal) {
      sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + 500, path: [m1Key] });
      continue;
    }

    for (const m2Key of validMoves) {
      const m2 = movesData[m2Key];
      if ((m2.chiCost || 0) > s1.chi) continue;

      const s2 = simulateIchigoStateTransition(s1.chi, s1.oppLp, CPU_LP, s1.focus, s1.airborne, s1.faint, m2Key, m2, OPP_AVG_DMG, OPP_CHI);

      if (s2.isLethal) {
        sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + s2.ev + 300, path: [m1Key, m2Key] });
        continue;
      }

      for (const m3Key of validMoves) {
        const m3 = movesData[m3Key];
        if ((m3.chiCost || 0) > s2.chi) continue;

        const s3 = simulateIchigoStateTransition(s2.chi, s2.oppLp, CPU_LP, s2.focus, s2.airborne, s2.faint, m3Key, m3, OPP_AVG_DMG, OPP_CHI);
        const pathTotalEV = s1.ev + s2.ev + s3.ev;

        sequenceEvaluations.push({ firstMove: m1Key, totalEV: pathTotalEV, path: [m1Key, m2Key, m3Key] });
      }
    }
  }

  return sequenceEvaluations;
}

function simulateIchigoStateTransition(chi, oppLp, cpuLp, focus, airborne, faint, moveKey, move, oppAvgDmg, oppChi) {
  let nextChi = Math.min(16, chi - ((move && move.chiCost) || 0) + (moveKey.startsWith('D') ? 3 : 0));
  let nextFocus = moveKey === 'W+K' ? 2 : Math.max(0, focus - 1);
  let nextAirborne = moveKey === 'W+I' ? 2 : Math.max(0, airborne - 1);

  let baseDmg = (move && move.baseDamage) || 0;
  let hitRate = ((move && move.hitChance) || 80) / 100;
  let weightedDmg = baseDmg * hitRate * 0.84; // 80% clean hit + 20% scratch hit

  if (focus > 0 && moveKey.startsWith('S')) weightedDmg *= 1.20;
  if (airborne > 0) weightedDmg *= 1.15;

  let ev = weightedDmg;

  // --- W+K (TYPHOON FOCUS) ---
  if (moveKey === 'W+K') {
    ev += (296.18 * 0.20 * 1.5);
    if (chi < 11) ev -= 80;
  }

  // --- W+I (RIDER HIGH JUMP) ---
  if (moveKey === 'W+I') {
    ev += oppAvgDmg * 0.20 * 2;
    if (chi < 12) ev -= 90;
  }

  // --- A+ GUARDS (EXACT COMBAT.JS CHARGE SCALING) ---
  if (moveKey.startsWith('A+')) {
    if (faint >= 100) {
      ev = 0; // Opponent fainted; guard yields zero value
    } else {
      const guardChargePercent = moveKey === 'A+I' ? 100 : 15;
      const guardChargeRatio = guardChargePercent / 100;
      const guardChargeFactor = Math.sqrt(0.5 + (0.5 * guardChargeRatio));
      const effectiveGuardChance = 0.70 * guardChargeFactor; // ~0.70 for A+I, ~0.5308 for A+J/K/L

      if (moveKey === 'A+I') {
        ev = oppAvgDmg * 1.0 * effectiveGuardChance; // Blocks 100% damage on success
      } else {
        const damageSaved = oppAvgDmg * 0.70 * effectiveGuardChance; // Blocks 70% damage on success
        const chiGainEV = 2 * 20 * effectiveGuardChance; // +2 Chi reward valued at 20 EV/Chi
        ev = damageSaved + chiGainEV;
      }

      if (cpuLp <= 250) {
        ev *= 1.50; // High urgency survival multiplier when low LP
      }
    }
  }

  // --- FAINT BUILDUP & STUN BONUS ---
  let isUtility = moveKey.startsWith('W') || (move && move.type === 'DEFENSE');
  let faintGained = isUtility ? 0 : hitRate * (25 * 0.80 + 10 * 0.20);
  let nextFaint = faint + faintGained;

  if (nextFaint >= 100 && faint < 100) {
    ev += 250; // MASSIVE STUN TRIGGER BONUS
  } else if (faint >= 75 && !isUtility) {
    ev += (faintGained * 2.5);
  }

  // --- UTILITY SAFEGUARDS ---
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
