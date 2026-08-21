// SELECT CPU MOVE BASED ON AFFORDABLE MOVES & DIFFICULTY LEVEL
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  // 1. Filter moves affordable with current Chi
  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J'; // Fallback free attack

  // 2. NORMAL DIFFICULTY: Balanced / Semi-random selection
  if (difficulty === 'normal') {
    // If CPU is near faint threshold (>= 75%), prioritize faint recovery if available
    if (cpuPlayer.faintMeter >= 75) {
      const recoveryKey = affordableKeys.find(k => movesData[k].faintRecovery && movesData[k].faintRecovery > 0);
      if (recoveryKey && Math.random() < 0.6) return recoveryKey;
    }
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  // 3. HARD DIFFICULTY: Strategic weight-based scoring
  let bestKey = affordableKeys[0];
  let highestScore = -999;

  affordableKeys.forEach(key => {
    const move = movesData[key];
    let score = 0;

    // Favor high base damage
    score += (move.baseDamage || 0) * 1.5;

    // Prioritize faint recovery when CPU faint meter is high
    if (cpuPlayer.faintMeter >= 60 && move.faintRecovery) {
      score += move.faintRecovery * 5;
    }

    // Prioritize high damage / special moves when opponent is fainted or near faint
    if (opponentPlayer.faintMeter >= 70 && move.type === 'SPECIAL') {
      score += 150;
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
