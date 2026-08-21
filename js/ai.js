function selectCPUMove(cpuState, opponentState, movesData) {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const candidates = [];

  Object.keys(movesData).forEach(key => {
    const move = movesData[key];
    if (!move || typeof move !== 'object' || cpuState.chi < (move.chiCost || 0)) return;

    let weight = 15; // Increased base weight to keep options versatile

    // 1. HIGH CHI OFFENSIVE AGGRESSION: High Chi (> 6) -> Heavy preference for Special attacks
    if (cpuState.chi >= 6 && (move.type === 'SPECIAL' || move.type === 'FINISHER')) {
      weight += 70 + Math.floor((move.baseDamage || 0) / 10);
    }

    // 2. FAINTED OPPONENT PUNISHMENT: Maximize heavy damage specials
    if (opponentState.isFainted) {
      if (move.type === 'SPECIAL' || move.type === 'FINISHER') {
        weight += 120 + Math.floor((move.baseDamage || 0) / 10);
      } else if (move.type === 'PHYSICAL') {
        weight += 30;
      }
    }
    // 3. FAINT TRAP: Opponent at 75+ faint pts -> Favor high-accuracy physical strikes
    else if (opponentState.faintMeter >= 75) {
      if (move.type === 'PHYSICAL') weight += 60;
      if (move.grantsAirborne && cpuState.airborneTicks === 0) weight += 30;
    }
    // 4. SELF PRESERVATION: Self at 75+ faint pts -> Jump or Guard
    else if (cpuState.faintMeter >= 75) {
      if (move.grantsAirborne && cpuState.airborneTicks === 0) weight += 70;
      if (move.type === 'DEFENSE') weight += 40;
    }
    // 5. AIR CONTROL & EXPLOITATION
    else if (cpuState.airborneTicks === 0 && move.grantsAirborne) {
      weight += 30;
    } else if (cpuState.airborneTicks > 0 && (move.type === 'PHYSICAL' || move.type === 'SPECIAL')) {
      weight += 45;
    }

    // 6. CHI RECOVERY: Low Chi (< 4) -> Prioritize Physical strikes
    if (cpuState.chi < 4 && move.type === 'PHYSICAL') {
      weight += 65;
    }

    candidates.push({ key, weight });
  });

  if (candidates.length === 0) return 'D+J';

  // Weighted random selection algorithm
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const candidate of candidates) {
    if (roll < candidate.weight) return candidate.key;
    roll -= candidate.weight;
  }

  return candidates[0].key || 'D+J';
}
