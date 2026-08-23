// SELECT CPU MOVE BASED ON DYNAMIC WEIGHTING SYSTEM & SITUATIONAL MODIFIERS
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const cpuChi = cpuPlayer.chi || 0;
  const oppChi = opponentPlayer.chi || 0;
  const oppLp = opponentPlayer.lp || 1;
  const cpuLp = cpuPlayer.lp || 1;
  const cpuMaxLp = cpuPlayer.maxLp || 1000;
  const isIchigo = cpuPlayer.id === 'ichigo';
  const isNigo = cpuPlayer.id === 'nigo';

  // 1. Get all currently affordable moves
  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuChi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  const canUse = (key) => affordableKeys.includes(key);

  // Read contextual battlefield state
  const activeBuffs = cpuPlayer.activeBuffs || [];
  const isAirborne = (cpuPlayer.airborneTicks && cpuPlayer.airborneTicks > 0) ||
                     activeBuffs.some(b => b.id === 'airborne_boost' || b.id === 'airborne' || b.id === 'hit_buff');
  const hasPowerBuff = activeBuffs.some(b => b.id === 'power_stance' || b.id === 'power_focus' || b.id === 'focus');
  const isOpponentStunned = opponentPlayer.isFainted || (opponentPlayer.faintMeter >= 100);
  const faint = cpuPlayer.faintMeter || 0;
  const isLowHealth = (cpuLp / cpuMaxLp) <= 0.30;

  // Read opponent incoming move (if confirmed)
  let isOpponentConfirmed = false;
  let oppMove = null;
  if (typeof gameState !== 'undefined') {
    const oppSlot = cpuPlayer === gameState.p1 ? 'p2' : 'p1';
    isOpponentConfirmed = oppSlot === 'p1' ? gameState.input?.isConfirmed : gameState.p2IsConfirmed;
    const oppMoveKey = oppSlot === 'p1' ? gameState.input?.selectedMoveKey : gameState.p2SelectedMoveKey;
    if (isOpponentConfirmed && oppMoveKey && typeof getMoveForPlayer === 'function') {
      oppMove = getMoveForPlayer(oppSlot, oppMoveKey);
    }
  }

  // ----------------------------------------------------
  // 2. NORMAL DIFFICULTY: Casual & Forgiving AI
  // ----------------------------------------------------
  if (difficulty === 'normal') {
    // High faint emergency check
    if (faint >= 75 && canUse('W+L') && Math.random() < 0.60) {
      return 'W+L';
    }

    // 25% Wildcard Chance (Casual mistake / random action)
    if (Math.random() < 0.25) {
      return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
    }

    // Lighter utility scoring with large random noise (±35) for human-like inconsistency
    let nBestKey = affordableKeys[0];
    let nHighestScore = -Infinity;

    affordableKeys.forEach(key => {
      const move = movesData[key];
      let score = (move.baseDamage || 0) * 0.8;

      if (isAirborne && key === 'S+L') score += 150;
      if (isOpponentStunned && key.startsWith('S')) score += 150;
      if (key.startsWith('A+')) score -= 80;

      // Heavy noise creates unpredictable, casual play
      score += (Math.random() * 70) - 35;

      if (score > nHighestScore) {
        nHighestScore = score;
        nBestKey = key;
      }
    });

    return nBestKey;
  }

  // ----------------------------------------------------
  // 3. HARD DIFFICULTY: DYNAMIC UTILITY WEIGHTING SYSTEM
  // ----------------------------------------------------

  // WILDCARD / YOLO ROLL (6% chance to throw a surprise move)
  const WILDCARD_CHANCE = 0.06;
  if (Math.random() < WILDCARD_CHANCE && !isOpponentStunned && faint < 75) {
    const wildKeys = affordableKeys.filter(k => !k.startsWith('A+'));
    if (wildKeys.length > 0) {
      return wildKeys[Math.floor(Math.random() * wildKeys.length)];
    }
  }

  let bestKey = affordableKeys[0];
  let highestScore = -Infinity;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    let score = 0;

    // --- BASE WEIGHT: Expected Damage ---
    const baseDmg = move.baseDamage || move.damage || 0;
    const accuracy = move.hitChance !== undefined ? move.hitChance : (move.accuracy !== undefined ? move.accuracy : 100);
    const hitRate = Math.max(0.1, accuracy / 100);
    
    score += (baseDmg * hitRate) * 1.5;

    if (move.unmirrored) score += 25;

    // =========================================================================
    // DYNAMIC CONDITION 1: AIRBORNE STATE
    // =========================================================================
    if (isAirborne) {
      if (key === 'S+L') score += 350;
      if (key === 'D+L') score += 120;
      if (key === 'W+I' || key === 'W+K') score -= 500;
      if (['A+J', 'A+K', 'A+L', 'A+I'].includes(key)) score -= 200;
    }

    // =========================================================================
    // DYNAMIC CONDITION 2: OPPONENT STUNNED / FAINTED
    // =========================================================================
    if (isOpponentStunned) {
      if (key === 'S+I') score += 400;
      if (key === 'S+L') score += 300;
      if (key === 'S+K') score += 200;
      if (['D+L', 'D+I', 'D+K'].includes(key)) score += 100;
      if (key === 'W+K' || key === 'W+I') score -= 250;
      if (key.startsWith('A+')) score -= 500;
    }

    // =========================================================================
    // DYNAMIC CONDITION 3: LETHAL FINISHING (RAW DAMAGE CHECK)
    // =========================================================================
    if (baseDmg >= oppLp) {
      // Prioritize guaranteed kills, scaling higher for safer/higher accuracy moves
      score += 400 + (hitRate * 100);
    } else if (oppLp <= 200) {
      if (key === 'D+L' || key === 'D+K') score += 80;
      if (key === 'S+L') score += 180;
    }

    // =========================================================================
    // DYNAMIC CONDITION 4: REACTION GUARD (A+I)
    // =========================================================================
    if (isOpponentConfirmed && oppMove && key === 'A+I' && cpuChi >= 3) {
      const isDangerousSpecial = oppMove.type === 'SPECIAL' && (oppMove.baseDamage > 0 || oppMove.damage > 0);
      if (isDangerousSpecial) score += 320;
      if (isLowHealth && oppMove.type === 'PHYSICAL') score += 180;
    }

    if (['A+J', 'A+K', 'A+L'].includes(key)) {
      score -= 150;
    }

    // =========================================================================
    // DYNAMIC CONDITION 5: BUFF & JUMP UTILITY
    // =========================================================================
    if (key === 'W+K') {
      if (hasPowerBuff) {
        score -= 400;
      } else if (isLowHealth) {
        score -= 200;
      } else {
        score += 35;
      }
    }

    if (key === 'W+I') {
      if (isAirborne) {
        score -= 500;
      } else if (cpuChi >= (isIchigo ? 6 : 7)) {
        score += 85;
      } else {
        score -= 80;
      }
    }

    // =========================================================================
    // DYNAMIC CONDITION 6: FAINT CRISIS
    // =========================================================================
    if (key === 'W+L' && move.faintRecovery) {
      if (faint >= 75) score += 280;
      else if (faint >= 50) score += 90;
      else score -= 100;
    }

    // =========================================================================
    // DYNAMIC CONDITION 7: CHARACTER PERSONALITY FLAVORS
    // =========================================================================
    if (isNigo) {
      if (key === 'D+L') score += 45;
      if (key === 'D+I') score += 35;
      if (key === 'S+L') score += 50;
      if (hasPowerBuff && baseDmg > 0) score += 40;
    }

    if (isIchigo) {
      if (key === 'S+K') score += 35;
      if (key === 'D+K') score += 30;
      if (hitRate >= 0.95) score += 25;
    }

    // Organic random noise (±8)
    score += (Math.random() * 16) - 8;

    if (score > highestScore) {
      highestScore = score;
      bestKey = key;
    }
  });

  return bestKey;
}
