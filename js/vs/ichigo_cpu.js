/**
 * Kamen Rider Ichigo AI Decision Engine
 * Specialized 3-Turn Lookahead Engine with Stance Stacking & Faint Prioritization
 */

function selectIchigoCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const affordableKeys = Object.keys(movesData).filter(key => {
    const m = movesData[key];
    return m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  // --- EASY DIFFICULTY ---
  // High randomness (60% random choice), basic 1-turn evaluation, no advanced stance stacking
  if (difficulty === 'easy') {
    if (Math.random() < 0.60) {
      return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
    }
    return getIchigoSimple1TurnChoice(cpuPlayer, opponentPlayer, movesData, affordableKeys);
  }

  // --- HARD DIFFICULTY: PREDICTIVE GUARD OVERRIDE ---
  // If opponent is locked in with an offensive move, attempt direct matching guard A+X or Windmill Guard A+I
  if (difficulty === 'hard') {
    const opponentMoveKey = gameState.p1SelectedMoveKey || (gameState.input ? gameState.input.selectedMoveKey : null);
    if (opponentMoveKey && !opponentMoveKey.startsWith('A+') && opponentMoveKey !== 'DO_NOTHING') {
      const oppButton = opponentMoveKey.split('+')[1];
      if (opponentMoveKey.startsWith('S') && cpuPlayer.chi >= 0 && movesData['A+I'] && Math.random() < 0.85) {
        return 'A+I'; // Windmill Guard against heavy specials
      }
      if (oppButton && movesData[`A+${oppButton}`] && Math.random() < 0.80) {
        return `A+${oppButton}`; // Direct button matching guard
      }
    }
  }

  // --- NORMAL & HARD DIFFICULTY: 3-TURN EV SEARCH ---
  const sequenceEvaluations = runIchigo3TurnSearch(cpuPlayer, opponentPlayer, movesData, affordableKeys);

  if (sequenceEvaluations.length === 0) return 'D+J';

  // Group paths by distinct starting move (m1) and take max EV per starting move
  const bestPerStartMove = {};
  sequenceEvaluations.forEach(item => {
    if (!bestPerStartMove[item.firstMove] || item.totalEV > bestPerStartMove[item.firstMove].totalEV) {
      bestPerStartMove[item.firstMove] = item;
    }
  });

  const sortedDistinctMoves = Object.values(bestPerStartMove).sort((a, b) => b.totalEV - a.totalEV);

  if (sortedDistinctMoves.length === 1) return sortedDistinctMoves[0].firstMove;

  // --- DIFFICULTY SELECTION ROUTING ---
  if (difficulty === 'hard') {
    // HARD: 90% optimal top move, 10% second best for mixup
    return Math.random() < 0.90 ? sortedDistinctMoves[0].firstMove : sortedDistinctMoves[1].firstMove;
  } else {
    // NORMAL: 50/50 weighted roll between Top 2 starting moves
    return Math.random() < 0.50 ? sortedDistinctMoves[0].firstMove : sortedDistinctMoves[1].firstMove;
  }
}

/**
 * Depth-3 Tree Search evaluating 3-move sequences (m1 -> m2 -> m3)
 */
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

  // LEVEL 1
  for (const m1Key of affordableKeys) {
    const m1 = movesData[m1Key];
    const s1 = simulateIchigoStateTransition(START_CHI, OPP_LP, CPU_LP, START_FOCUS, START_AIRBORNE, START_FAINT, m1Key, m1, OPP_AVG_DMG, OPP_CHI);

    if (s1.isLethal) {
      sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + 500, path: [m1Key] });
      continue;
    }

    // LEVEL 2
    for (const m2Key of validMoves) {
      const m2 = movesData[m2Key];
      if ((m2.chiCost || 0) > s1.chi) continue;

      const s2 = simulateIchigoStateTransition(s1.chi, s1.oppLp, CPU_LP, s1.focus, s1.airborne, s1.faint, m2Key, m2, OPP_AVG_DMG, OPP_CHI);

      if (s2.isLethal) {
        sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + s2.ev + 300, path: [m1Key, m2Key] });
        continue;
      }

      // LEVEL 3
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

/**
 * State Transition Engine for Ichigo
 */
function simulateIchigoStateTransition(chi, oppLp, cpuLp, focus, airborne, faint, moveKey, move, oppAvgDmg, oppChi) {
  let nextChi = Math.min(16, chi - (move.chiCost || 0) + (moveKey.startsWith('D') ? 3 : 0));
  let nextFocus = moveKey === 'W+K' ? 2 : Math.max(0, focus - 1);
  let nextAirborne = moveKey === 'W+I' ? 2 : Math.max(0, airborne - 1);

  let baseDmg = move.baseDamage || 0;
  let hitRate = (move.hitChance || 80) / 100;
  let chargeFactor = 1.0; // Assume 100% charge baseline for EV planning

  // WEIGHTED DAMAGE (80% CLEAN HIT, 20% SCRATCH HIT)
  let weightedDmg = baseDmg * chargeFactor * hitRate * 0.84;

  // STANCE MULTIPLIERS
  if (focus > 0 && moveKey.startsWith('S')) weightedDmg *= 1.20;
  if (airborne > 0) weightedDmg *= 1.15;

  let ev = weightedDmg;

  // --- W+K (TYPHOON FOCUS) EVALUATION ---
  if (moveKey === 'W+K') {
    const expectedSpecialDmg = 296.18; // S+L baseline
    ev += (expectedSpecialDmg * 0.20 * 1.5);
    if (chi < 11) ev -= 80; // Solvency penalty if unable to execute follow-up special
  }

  // --- W+I (RIDER HIGH JUMP) EVALUATION ---
  if (moveKey === 'W+I') {
    ev += oppAvgDmg * 0.20 * 2; // Evasion savings over airborne duration
    if (chi < 12) ev -= 90; // Solvency penalty
  }

  // --- FAINT BUILDUP & STUN BONUS ---
  let isUtility = moveKey.startsWith('W') || move.type === 'DEFENSE';
  let faintGained = isUtility ? 0 : hitRate * (25 * 0.80 + 10 * 0.20); // ~22.0 Faint per landed strike
  let nextFaint = faint + faintGained;

  if (nextFaint >= 100 && faint < 100) {
    ev += 250; // MASSIVE STUN BONUS: Forces guaranteed stun window
  } else if (faint >= 75 && !isUtility) {
    ev += (faintGained * 2.5); // Priority bonus for offensive moves when close to threshold
  }

  // --- GENERAL UTILITY SAFEGUARDS ---
  if (isUtility) {
    if (faint >= 75) ev -= 150; // Force offensive moves when opponent is in stun range
    if (airborne > 0) ev -= 120; // Never cast utility moves while airborne
  }

  // Airborne evasion defense value
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

/**
 * Simplified 1-turn fallback evaluation for Easy difficulty
 */
function getIchigoSimple1TurnChoice(cpuPlayer, opponentPlayer, movesData, affordableKeys) {
  let bestKey = affordableKeys[0];
  let maxDmg = -1;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    const dmg = move.baseDamage || 0;
    if (dmg > maxDmg) {
      maxDmg = dmg;
      bestKey = key;
    }
  });

  return bestKey;
}
