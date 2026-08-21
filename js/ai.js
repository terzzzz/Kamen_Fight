function selectCPUMove(cpuState, opponentState, movesData) {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const candidates = [];

  Object.keys(movesData).forEach(key => {
    const move = movesData[key];
    if (!move || typeof move !== 'object' || cpuState.chi < (move.chiCost || 0)) return; // Exclude unaffordable moves

    let weight = 10; // Base neutral weight

    // 1. FAINTED OPPONENT PUNISHMENT: Favor highest base damage special/finishers
    if (opponentState.isFainted) {
      if (move.type === 'SPECIAL' || move.type === 'FINISHER') {
        weight += 80 + Math.floor((move.baseDamage || 0) / 10);
      } else if (move.type === 'PHYSICAL') {
        weight += 20;
      }
    }
    // 2. FAINT TRAP: Opponent at 75+ faint pts -> Favor high accuracy Physical strikes
    else if (opponentState.faintMeter >= 75) {
      if (move.type === 'PHYSICAL') weight += 60;
      if (move.grantsAirborne && cpuState.airborneTicks === 0) weight += 30;
    }
    // 3. SELF PRESERVATION: Self at 75+ faint pts -> Jump to gain +20% evasion or Guard
    else if (cpuState.faintMeter >= 75) {
      if (move.grantsAirborne && cpuState.airborneTicks === 0) weight += 70;
      if (move.type === 'DEFENSE') weight += 40;
    }
    // 4. AIR CONTROL: Grounded -> High priority to initiate Airborne Status
    else if (cpuState.airborneTicks === 0) {
      if (move.grantsAirborne) weight += 40;
      if (move.type === 'PHYSICAL') weight += 20;
    }
    // 5. AIR EXPLOITATION: Airborne -> Leverage +15% damage multiplier
    else if (cpuState.airborneTicks > 0) {
      if (move.type === 'PHYSICAL' || move.type === 'SPECIAL') weight += 35;
    }

    // 6. CHI RECOVERY: Low Chi (< 4) -> Prioritize Physical strikes (+2/+3 Chi gain)
    if (cpuState.chi < 4 && move.type === 'PHYSICAL') {
      weight += 50;
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
