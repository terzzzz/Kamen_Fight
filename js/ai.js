function selectCPUMove(cpuState, opponentState, movesData) {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const candidates = [];

  Object.keys(movesData).forEach(key => {
    const move = movesData[key];
    if (!move || cpuState.chi < (move.chiCost || 0)) return; // Exclude unaffordable moves

    let weight = 10; // Base neutral weight

    // 1. FAINTED OPPONENT PUNISHMENT: Maximize high special / Kirimomi finisher damage
    if (opponentState.isFainted) {
      if (key === 'S+I') weight += 120;
      else if (key.startsWith('S')) weight += 80;
      else if (key.startsWith('D')) weight += 20;
    }
    // 2. FAINT TRAP: Opponent at 75+ faint pts -> Favor high accuracy D-Strikes
    else if (opponentState.faintMeter >= 75) {
      if (key.startsWith('D')) weight += 60;
      if (key === 'W+I' && cpuState.airborneTicks === 0) weight += 30;
    }
    // 3. SELF PRESERVATION: Self at 75+ faint pts -> Jump to gain +20% evasion & force whiff
    else if (cpuState.faintMeter >= 75) {
      if (key === 'W+I' && cpuState.airborneTicks === 0) weight += 70;
      if (key.startsWith('A')) weight += 40;
    }
    // 4. AIR CONTROL: Grounded -> High priority to initiate Airborne Status
    else if (cpuState.airborneTicks === 0) {
      if (key === 'W+I') weight += 40;
      if (key.startsWith('D')) weight += 20;
    }
    // 5. AIR EXPLOITATION: Airborne -> Leverage +15% damage multiplier
    else if (cpuState.airborneTicks > 0) {
      if (key.startsWith('D') || key.startsWith('S')) weight += 35;
    }

    // 6. CHI RECOVERY: Low Chi (< 4) -> Prioritize D-Strikes (+2/+3 Chi gain)
    if (cpuState.chi < 4 && key.startsWith('D')) {
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
