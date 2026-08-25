/**
 * Kamen Rider Ichigo AI Decision Engine
 * Path: js/vs/ichigo_cpu.js
 * 3-Turn Lookahead Engine with Anti-Turtling Safeguards, Guard Faint Penalties & Dynamic Timing
 */

function getMatchTimingConfig() {
  const matchCfg = (typeof gameState !== 'undefined' && gameState.matchConfig) ? gameState.matchConfig : {};
  const sysCfg = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG : {};

  const baseRoundWindow = (typeof gameState !== 'undefined' && gameState.roundTimeLimit !== undefined)
    ? gameState.roundTimeLimit
    : (matchCfg.roundTimeLimit || sysCfg.ROUND_TIME_LIMIT || 8.0);

  const chargeTimeRequired = (typeof gameState !== 'undefined' && gameState.chargeTimeRequired !== undefined)
    ? gameState.chargeTimeRequired
    : (matchCfg.chargeTimeRequired || sysCfg.CHARGE_TIME_REQUIRED || 2.5);

  const extensionBonus = (typeof gameState !== 'undefined' && gameState.lateExtensionBonus !== undefined)
    ? gameState.lateExtensionBonus
    : (matchCfg.lateExtensionBonus || sysCfg.LATE_EXTENSION_BONUS || 1.0);

  const lateThreshold = (typeof gameState !== 'undefined' && gameState.lateDecisionThreshold !== undefined)
    ? gameState.lateDecisionThreshold
    : (matchCfg.lateDecisionThreshold || sysCfg.LATE_DECISION_THRESHOLD || (baseRoundWindow - 1.0));

  return { baseRoundWindow, chargeTimeRequired, extensionBonus, lateThreshold };
}

function selectIchigoCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const timing = getMatchTimingConfig();
  let cpuThinkingDelay = 0.4 + (Math.random() * 0.4);

  let humanLockedLate = (typeof gameState !== 'undefined' && gameState.input && gameState.input.isConfirmed && 
    (gameState.input.lockInTime > timing.lateThreshold || gameState.timeExtended));

  let bonusExtensionTime = humanLockedLate ? timing.extensionBonus : 0.0;
  let availableChargeTime = Math.max(0, (timing.baseRoundWindow + bonusExtensionTime) - cpuThinkingDelay);
  let maxAchievableCharge = Math.min(100, Math.floor((availableChargeTime / timing.chargeTimeRequired) * 100));

  // STRICT CHI CHECK FOR AFFORDABLE MOVES
  const affordableKeys = Object.keys(movesData).filter(key => {
    const m = movesData[key];
    return m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  let selectedMoveKey = 'D+J';

  if (difficulty === 'easy') {
    if (Math.random() < 0.60) {
      selectedMoveKey = affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
    } else {
      selectedMoveKey = getIchigoSimple1TurnChoice(cpuPlayer, opponentPlayer, movesData, affordableKeys);
    }
  } 
  else if (difficulty === 'hard') {
    const opponentMoveKey = gameState.p1SelectedMoveKey || (gameState.input ? gameState.input.selectedMoveKey : null);
    let guardChosen = false;

    if (opponentMoveKey && !opponentMoveKey.startsWith('A+') && opponentMoveKey !== 'DO_NOTHING') {
      const oppButton = opponentMoveKey.split('+')[1];
      const isOpponentSpecial = opponentMoveKey.startsWith('S');
      const isOpponentPhysical = opponentMoveKey.startsWith('D');

      const cpuStandardGuardSelfFaintRisk = (cpuPlayer.faintMeter || 0) >= 75;

      // 1. HIGH THREAT: Reactive Windmill Guard (A+I) or Matching Guard
      if (isOpponentSpecial) {
        const windmillMove = movesData['A+I'];
        const windmillCost = windmillMove ? (windmillMove.chiCost || 0) : 0;

        if (windmillMove && cpuPlayer.chi >= windmillCost && Math.random() < 0.85) {
          selectedMoveKey = 'A+I';
          guardChosen = true;
        } else if (oppButton && movesData[`A+${oppButton}`] && !cpuStandardGuardSelfFaintRisk && Math.random() < 0.80) {
          selectedMoveKey = `A+${oppButton}`;
          guardChosen = true;
        }
      } 
      // 2. LOW THREAT: Anti-Turtling Physical Guarding
      else if (isOpponentPhysical && oppButton && movesData[`A+${oppButton}`] && !cpuStandardGuardSelfFaintRisk) {
        const isLowLp = cpuPlayer.lp <= 250;
        const isLowChi = cpuPlayer.chi < 4;

        let dGuardChance = isLowLp ? 0.80 : (isLowChi ? 0.40 : 0.00);

        if (Math.random() < dGuardChance) {
          selectedMoveKey = `A+${oppButton}`;
          guardChosen = true;
        }
      }
    }

    if (!guardChosen) {
      selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'hard', maxAchievableCharge);
    }
  } 
  else {
    selectedMoveKey = run3TurnSearchAndSelect(cpuPlayer, opponentPlayer, movesData, affordableKeys, 'normal', maxAchievableCharge);
  }

  setCPUChargeTarget(cpuPlayer, selectedMoveKey, maxAchievableCharge);

  return selectedMoveKey;
}

function setCPUChargeTarget(cpuPlayer, moveKey, maxAchievableCharge) {
  let desiredCharge = 100;

  if (moveKey === 'A+I') {
    desiredCharge = 100;
  } else if (moveKey.startsWith('A+')) {
    desiredCharge = 15;
  } else if (moveKey.startsWith('S') || moveKey === 'W+I' || moveKey === 'W+K') {
    desiredCharge = 100;
  } else if (moveKey.startsWith('D')) {
    desiredCharge = 90 + Math.floor(Math.random() * 11);
  }

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
    const s1 = simulateIchigoStateTransition(START_CHI, OPP_LP, CPU_LP, START_FOCUS, START_AIRBORNE, START_FAINT, m1Key, m1, OPP_AVG_DMG, OPP_CHI, maxAchievableCharge);

    if (s1.isLethal) {
      sequenceEvaluations.push({ firstMove: m1Key, totalEV: s1.ev + 500, path: [m1Key] });
      continue;
    }

    for (const m2Key of validMoves) {
      const m2 = movesData[m2Key];
      if ((m2.chiCost || 0) > s1.chi) continue;

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

  let effectiveCharge = Math.min(100, currentChargeCap);
  let chargeRatio = effectiveCharge / 100;
  let chargeFactor = Math.sqrt(0.5 + (0.5 * chargeRatio));

  let baseDmg = (move && move.baseDamage) || 0;
  let hitRate = ((move && move.hitChance) || 80) / 100;
  let weightedDmg = baseDmg * chargeFactor * hitRate * 0.84;

  if (focus > 0 && moveKey.startsWith('S')) weightedDmg *= 1.20;
  if (airborne > 0) weightedDmg *= 1.15;

  let ev = weightedDmg;

  if (moveKey === 'W+K') {
    ev += (296.18 * 0.20 * 1.5);
    if (chi < 11) ev -= 80;
  }

  if (moveKey === 'W+I') {
    let takeoffInstability = 1.8 - (0.8 * chargeRatio);
    ev += (oppAvgDmg * 0.20 * 2);
    if (chargeRatio < 1.0) {
      ev -= (oppAvgDmg * (takeoffInstability - 1.0));
    }
    if (chi < 12) ev -= 90;
  }

  let nextCpuFaint = faint;

  if (moveKey.startsWith('A+')) {
    let isWindmill = (moveKey === 'A+I');
    let guardChiCost = (move && move.chiCost !== undefined) ? move.chiCost : 0;
    
    let selfFaintGained = (!isWindmill && guardChiCost === 0) ? 25 : 0;
    nextCpuFaint = faint + selfFaintGained;

    if (faint >= 100) {
      ev = 0;
    } else if (nextCpuFaint >= 100) {
      ev = -300;
    } else {
      const guardChargeFactor = Math.sqrt(0.5 + (0.5 * chargeRatio));
      const effectiveGuardChance = 0.70 * guardChargeFactor;

      if (isWindmill) {
        ev = oppAvgDmg * 1.0 * effectiveGuardChance;
      } else {
        const damageSaved = oppAvgDmg * 0.70 * effectiveGuardChance;

        let chiHeadroom = Math.max(0, 16 - chi);
        let actualChiGained = Math.min(2, chiHeadroom);
        const chiGainEV = actualChiGained * 20 * effectiveGuardChance;

        ev = damageSaved + chiGainEV - (25 * 1.5);
      }

      if (cpuLp <= 250) {
        ev *= 1.50;
      }
    }
  }

  let isUtility = moveKey.startsWith('W') || (move && move.type === 'DEFENSE');
  let faintGainedOnOpponent = isUtility ? 0 : hitRate * (25 * 0.80 + 10 * 0.20);
  let nextOppFaint = faint + faintGainedOnOpponent;

  if (nextOppFaint >= 100 && faint < 100) {
    ev += 250;
  } else if (faint >= 75 && !isUtility) {
    ev += (faintGainedOnOpponent * 2.5);
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
    faint: nextCpuFaint,
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
