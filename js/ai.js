// SELECT CPU MOVE BASED ON AFFORDABLE MOVES, RIDER IDENTITY & DIFFICULTY LEVEL
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const cpuChi = cpuPlayer.chi || 0;

  // 1. Filter moves affordable with current Chi
  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuChi;
  });

  if (affordableKeys.length === 0) return 'D+J';

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
  // 2. NORMAL DIFFICULTY: Balanced / Semi-random
  // ----------------------------------------------------
  if (difficulty === 'normal') {
    if (cpuPlayer.faintMeter >= 75) {
      const recoveryKey = affordableKeys.find(k => movesData[k].faintRecovery && movesData[k].faintRecovery > 0);
      if (recoveryKey && Math.random() < 0.6) return recoveryKey;
    }
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  // ----------------------------------------------------
  // 3. HARD DIFFICULTY: KAMEN RIDER NIGO OPTIMAL STRATEGY
  // ----------------------------------------------------
  if (difficulty === 'hard' && cpuPlayer.id === 'nigo') {
    // A. REACTION GUARD (Red Shutter Guard A+I)
    if (isOpponentConfirmed && oppMove && oppMove.type === 'SPECIAL' && cpuChi >= 3 && movesData['A+I']) {
      return 'A+I';
    }
    if (isOpponentConfirmed && oppMove && oppMove.type === 'PHYSICAL' && (cpuPlayer.lp / cpuPlayer.maxLp) <= 0.30 && cpuChi >= 3 && movesData['A+I']) {
      return 'A+I';
    }

    // B. FAINT EMERGENCY (Battle Cry W+L)
    if (cpuPlayer.faintMeter >= 50 && cpuChi >= 2 && movesData['W+L']) {
      return 'W+L';
    }

    // C. HIGH CHI & FINISHER EXECUTION (Aggressive Special Usage)
    if (opponentPlayer.isFainted) {
      if (cpuChi >= 10 && movesData['S+I']) return 'S+I';
      if (cpuChi >= 7 && movesData['S+L']) return 'S+L';
      if (cpuChi >= 5 && movesData['S+K']) return 'S+K';
    }

    // Spend accumulated Chi on heavy Specials when Chi is high (>= 5)
    if (cpuChi >= 10 && movesData['S+I'] && Math.random() < 0.80) return 'S+I'; // Typhoon Power Break
    if (cpuChi >= 7 && movesData['S+L'] && Math.random() < 0.70) return 'S+L';  // Rider Power Kick
    if (cpuChi >= 5 && movesData['S+K'] && Math.random() < 0.50) return 'S+K';  // Rider Flying Knee

    // D. BUFF MAINTENANCE (Power Focus W+K) - Only cast if NOT already buffed
    const hasPowerStance = cpuPlayer.activeBuffs && cpuPlayer.activeBuffs.some(b => b.id === 'power_stance' || b.id === 'power_focus' || b.id === 'focus');
    if (!hasPowerStance && cpuChi >= 1 && movesData['W+K'] && Math.random() < 0.85) {
      return 'W+K';
    }

    // E. AIRBORNE COUNTER (+15% Hit Passive)
    if (opponentPlayer.airborneTicks > 0) {
      if (cpuChi >= 3 && movesData['W+I'] && cpuPlayer.airborneTicks === 0) return 'W+I';
      if (cpuChi >= 1 && movesData['D+L']) return 'D+L';
    }

    // F. HIGH EV PHYSICAL NEUTRAL TRADES
    if (cpuChi >= 1 && movesData['D+L'] && Math.random() < 0.60) return 'D+L';
    if (cpuChi >= 1 && movesData['D+I'] && Math.random() < 0.50) return 'D+I';
    if (movesData['D+K'] && Math.random() < 0.60) return 'D+K';
    if (movesData['D+J']) return 'D+J';
  }

  // ----------------------------------------------------
  // 4. GENERAL / FALLBACK WEIGHTED SCORING
  // ----------------------------------------------------
  let bestKey = affordableKeys[0];
  let highestScore = -999;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    let score = 0;

    score += (move.baseDamage || 0) * 1.5;

    if (isOpponentConfirmed && oppMove && oppMove.type === 'SPECIAL' && move.type === 'DEFENSE') {
      score += 220;
    }

    if (cpuPlayer.faintMeter >= 60 && move.faintRecovery) {
      score += move.faintRecovery * 5;
    }

    if ((opponentPlayer.faintMeter >= 70 || opponentPlayer.isFainted) && move.type === 'SPECIAL') {
      score += 180;
    }

    if (move.buff && (!cpuPlayer.activeBuffs || cpuPlayer.activeBuffs.length === 0)) {
      score += 80;
    }

    if (cpuPlayer.lp < cpuPlayer.maxLp * 0.25 && move.type === 'DEFENSE') {
      score += 60;
    }

    score += Math.random() * 20;

    if (score > highestScore) {
      highestScore = score;
      bestKey = key;
    }
  });

  return bestKey;
}
