// SELECT CPU MOVE BASED ON AFFORDABLE MOVES, RIDER IDENTITY & DIFFICULTY LEVEL
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const cpuChi = cpuPlayer.chi || 0;

  // 1. Filter moves affordable with current Chi
  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuChi;
  });

  if (affordableKeys.length === 0) return 'D+J'; // Fallback free attack

  // Detect opponent's locked-in move from global state if available
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
  // 2. NORMAL DIFFICULTY: Balanced / Semi-random selection
  // ----------------------------------------------------
  if (difficulty === 'normal') {
    // If CPU is near faint threshold (>= 75%), prioritize faint recovery if available
    if (cpuPlayer.faintMeter >= 75) {
      const recoveryKey = affordableKeys.find(k => movesData[k].faintRecovery && movesData[k].faintRecovery > 0);
      if (recoveryKey && Math.random() < 0.6) return recoveryKey;
    }
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  // ----------------------------------------------------
  // 3. HARD DIFFICULTY: NIGO SPECIFIC OPTIMAL STRATEGY
  // ----------------------------------------------------
  if (difficulty === 'hard' && cpuPlayer.id === 'nigo') {
    // A. REACTION GUARD (Red Shutter Guard A+I)
    // Reaction-void opponent's Special Attack (S-Type) for 100% negation + 15% Dmg Reduction buff
    if (isOpponentConfirmed && oppMove && oppMove.type === 'SPECIAL' && cpuChi >= 3 && movesData['A+I']) {
      return 'A+I';
    }

    // Defensive Guard when under 30% LP against physical attacks
    if (isOpponentConfirmed && oppMove && oppMove.type === 'PHYSICAL' && (cpuPlayer.lp / cpuPlayer.maxLp) <= 0.30 && cpuChi >= 3 && movesData['A+I']) {
      return 'A+I';
    }

    // B. FAINT EMERGENCY (Battle Cry W+L)
    if (cpuPlayer.faintMeter >= 50 && cpuChi >= 2 && movesData['W+L']) {
      return 'W+L';
    }

    // C. FINISHER EXECUTION (S-Type Moves)
    if (opponentPlayer.isFainted || opponentPlayer.lp <= 380) {
      if (cpuChi >= 10 && movesData['S+I'] && opponentPlayer.lp <= 450) return 'S+I'; // Rider Gaeshi (580 dmg)
      if (cpuChi >= 6 && movesData['S+L']) return 'S+L';  // Nigo Rider Kick (450 dmg)
      if (cpuChi >= 4 && movesData['S+K']) return 'S+K';  // Rider Power Punch (260 dmg)
    }

    // D. BUFF MAINTENANCE (Power Stance W+K)
    const hasPowerStance = cpuPlayer.activeBuffs && cpuPlayer.activeBuffs.some(b => b.id === 'power_stance' || b.id === 'power_focus' || b.id === 'focus');
    if (!hasPowerStance && cpuChi >= 2 && movesData['W+K'] && Math.random() < 0.85) {
      return 'W+K';
    }

    // E. AIRBORNE COUNTER (+15% Hit Passive)
    if (opponentPlayer.airborneTicks > 0) {
      if (cpuChi >= 3 && movesData['W+I'] && cpuPlayer.airborneTicks === 0) return 'W+I';
      if (cpuChi >= 1 && movesData['D+L']) return 'D+L';
    }

    // F. HIGH EXPECTED VALUE (EV) PHYSICAL NEUTRAL TRADES
    if (cpuChi >= 1 && movesData['D+L'] && Math.random() < 0.65) return 'D+L'; // Power Chop Combo
    if (cpuChi >= 1 && movesData['D+I'] && Math.random() < 0.50) return 'D+I'; // Sweep Kick
    if (movesData['D+K'] && Math.random() < 0.60) return 'D+K';                 // Heavy Kick
    if (movesData['D+J']) return 'D+J';                                         // Heavy Punch
  }

  // ----------------------------------------------------
  // 4. HARD DIFFICULTY: GENERAL / ICHIGO WEIGHT-BASED SCORING
  // ----------------------------------------------------
  let bestKey = affordableKeys[0];
  let highestScore = -999;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    let score = 0;

    // Favor high base damage
    score += (move.baseDamage || 0) * 1.5;

    // Reactive Guarding for Ichigo/General
    if (isOpponentConfirmed && oppMove && oppMove.type === 'SPECIAL' && move.type === 'DEFENSE') {
      score += 220; // Strongly counter-guard opponent's special moves
    }

    // Prioritize faint recovery when CPU faint meter is high
    if (cpuPlayer.faintMeter >= 60 && move.faintRecovery) {
      score += move.faintRecovery * 5;
    }

    // Prioritize high damage / special moves when opponent is fainted or near faint
    if ((opponentPlayer.faintMeter >= 70 || opponentPlayer.isFainted) && move.type === 'SPECIAL') {
      score += 180;
    }

    // Favor buff setup if CPU currently has no active buffs
    if (move.buff && (!cpuPlayer.activeBuffs || cpuPlayer.activeBuffs.length === 0)) {
      score += 80;
    }

    // Favor defense if CPU health is critically low (< 25% LP)
    if (cpuPlayer.lp < cpuPlayer.maxLp * 0.25 && move.type === 'DEFENSE') {
      score += 60;
    }

    // Slight random factor so Hard AI isn't 100% predictable
    score += Math.random() * 20;

    if (score > highestScore) {
      highestScore = score;
      bestKey = key;
    }
  });

  return bestKey;
}
