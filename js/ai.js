// SELECT CPU MOVE BASED ON AFFORDABLE MOVES, RIDER IDENTITY & DIFFICULTY LEVEL
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const cpuChi = cpuPlayer.chi || 0;
  const oppChi = opponentPlayer.chi || 0;
  const oppLp = opponentPlayer.lp || 1;
  const cpuLp = cpuPlayer.lp || 1;
  const cpuMaxLp = cpuPlayer.maxLp || 1000;
  const isIchigo = cpuPlayer.id === 'ichigo';

  // 1. Get all currently affordable moves
  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuChi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  // Helper function to safely check if a move key is affordable and valid
  const canUse = (key) => affordableKeys.includes(key);

  // Read opponent state
  let isOpponentConfirmed = false;
  let oppMoveKey = null;
  let oppMove = null;

  if (typeof gameState !== 'undefined') {
    const oppSlot = cpuPlayer === gameState.p1 ? 'p2' : 'p1';
    isOpponentConfirmed = oppSlot === 'p1' ? gameState.input?.isConfirmed : gameState.p2IsConfirmed;
    oppMoveKey = oppSlot === 'p1' ? gameState.input?.selectedMoveKey : gameState.p2SelectedMoveKey;
    if (isOpponentConfirmed && oppMoveKey && typeof getMoveForPlayer === 'function') {
      oppMove = getMoveForPlayer(oppSlot, oppMoveKey);
    }
  }

  // ----------------------------------------------------
  // 2. NORMAL DIFFICULTY
  // ----------------------------------------------------
  if (difficulty === 'normal') {
    if (cpuPlayer.faintMeter >= 75) {
      const recoveryKey = affordableKeys.find(k => movesData[k].faintRecovery && movesData[k].faintRecovery > 0);
      if (recoveryKey && Math.random() < 0.6) return recoveryKey;
    }
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  // ----------------------------------------------------
  // 3. HARD DIFFICULTY: Top-Tier Strategic Assessment
  // ----------------------------------------------------
  if (difficulty === 'hard') {
    const isOpponentStunned = opponentPlayer.isFainted || (opponentPlayer.faintMeter >= 100);
    const activeBuffs = cpuPlayer.activeBuffs || [];

    // =========================================================================
    // 【PRIORITY 1: STUN PUNISH】
    // =========================================================================
    if (isOpponentStunned) {
      if (cpuChi >= 10 && canUse('S+I')) return 'S+I';
      if (cpuChi >= (isIchigo ? 6 : 7) && canUse('S+L')) return 'S+L';
      if (cpuChi >= (isIchigo ? 4 : 5) && canUse('S+K')) return 'S+K';
      if (canUse('D+L')) return 'D+L';
      if (canUse('D+I')) return 'D+I';
      return canUse('D+K') ? 'D+K' : affordableKeys[0];
    }

    // =========================================================================
    // 【PRIORITY 2: LETHAL CHECK (Resource-Efficient)】
    // =========================================================================
    if (oppLp <= 350) {
      // 1. Cheapest Lethal (0 Chi)
      if (oppLp <= 85 && canUse('D+K')) return 'D+K';
      // 2. Low-Cost Lethal (1 Chi)
      if (oppLp <= 140 && canUse('D+L')) return 'D+L';
      // 3. Ultimate Lethal (6-7 Chi)
      const sLReqChi = isIchigo ? 6 : 7;
      if (cpuChi >= sLReqChi && canUse('S+L')) return 'S+L';
    }

    // =========================================================================
    // 【PRIORITY 3: REACTION GUARD (A+I)】
    // =========================================================================
    if (isOpponentConfirmed && oppMove && canUse('A+I') && cpuChi >= 3) {
      const isDamagingSpecial = oppMove.type === 'SPECIAL' && (oppMove.baseDamage > 0 || oppMove.damage > 0);
      const isCrisisPhysical = (cpuLp / cpuMaxLp) <= 0.30 && oppMove.type === 'PHYSICAL';
      
      if (isDamagingSpecial || isCrisisPhysical) {
        return 'A+I';
      }
    }

    // =========================================================================
    // 【PRIORITY 4: SMART FAINT MANAGEMENT】
    // =========================================================================
    const faint = cpuPlayer.faintMeter || 0;
    const sLReqFaintChi = isIchigo ? 1 : 2;

    if (canUse('W+L') && cpuChi >= sLReqFaintChi) {
      if (faint >= 75) return 'W+L';
      if (faint >= 60 && oppChi >= 3 && oppLp > 200 && Math.random() < 0.85) {
        return 'W+L';
      }
    }

    // =========================================================================
    // 【ICHIGO - Skill Specialist Strategy】
    // =========================================================================
    if (isIchigo) {
      const hasFocus = activeBuffs.some(b => b.id === 'focus');
      if (!hasFocus && canUse('W+K') && Math.random() < 0.40) return 'W+K';

      if (cpuChi >= 10 && canUse('S+I') && Math.random() < 0.75) return 'S+I';
      if (cpuChi >= 6 && canUse('S+L') && Math.random() < 0.65) return 'S+L';
      if (cpuChi >= 4 && canUse('S+K') && Math.random() < 0.45) return 'S+K';

      if (canUse('D+K') && Math.random() < 0.50) return 'D+K';
      if (canUse('D+I') && Math.random() < 0.40) return 'D+I';
      if (canUse('D+L') && Math.random() < 0.40) return 'D+L';
      // Intentionally falls through to Step 4 if no RNG triggered
    }

    // =========================================================================
    // 【NIGO - Power Specialist Strategy】
    // =========================================================================
    if (cpuPlayer.id === 'nigo') {
      const hasPowerBuff = activeBuffs.some(b => b.id === 'power_stance' || b.id === 'power_focus' || b.id === 'focus');
      if (!hasPowerBuff && canUse('W+K')) return 'W+K';

      const hasHitBuff = cpuPlayer.airborneTicks > 0 || activeBuffs.some(b => b.id === 'airborne_boost' || b.id === 'hit_buff');

      // Prepare jump combo only when close to having enough Chi for Rider Kick (7 Chi)
      if (!hasHitBuff && cpuChi >= 9 && canUse('W+I') && cpuPlayer.airborneTicks === 0 && Math.random() < 0.60) {
        return 'W+I';
      }
      if (hasHitBuff && cpuChi >= 7 && canUse('S+L')) {
        return 'S+L';
      }

      if (hasPowerBuff) {
        if (canUse('D+I') && Math.random() < 0.55) return 'D+I';
        if (canUse('D+L') && Math.random() < 0.70) return 'D+L';
      }

      if (cpuChi >= 10 && canUse('S+I') && Math.random() < 0.65) return 'S+I';
      if (cpuChi >= 7 && canUse('S+L') && Math.random() < 0.50) return 'S+L';
      if (canUse('D+L') && Math.random() < 0.50) return 'D+L';
      if (canUse('D+K') && Math.random() < 0.60) return 'D+K';
      // Intentionally falls through to Step 4 if no RNG triggered
    }
  }

  // ----------------------------------------------------
  // 4. STEP 4: HEURISTIC EVALUATION (Smart Fallback)
  // ----------------------------------------------------
  let bestKey = affordableKeys[0];
  let highestScore = -9999;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    let score = 0;

    const baseDmg = move.baseDamage || move.damage || 0;
    const accuracyVal = move.hitChance !== undefined ? move.hitChance : (move.accuracy !== undefined ? move.accuracy : 100);
    const hitRate = accuracyVal / 100;
    score += (baseDmg * hitRate) * 2;

    if (move.unmirrored) score += 40;

    if (isOpponentConfirmed && oppMove && oppMove.type === 'SPECIAL' && key === 'A+I') {
      score += 300;
    }

    if (cpuPlayer.faintMeter >= 75 && move.faintRecovery) {
      score += move.faintRecovery * 10;
    }

    if ((opponentPlayer.faintMeter >= 100 || opponentPlayer.isFainted) && move.type === 'SPECIAL') {
      score += 300;
    }

    // Heavy penalty for non-reaction guard moves
    if (['A+J', 'A+K', 'A+L'].includes(key)) {
      score -= 200;
    }

    score += Math.random() * 5;

    if (score > highestScore) {
      highestScore = score;
      bestKey = key;
    }
  });

  return bestKey;
}
