function selectCPUMove(cpuState, opponentState, movesData) {
  const availableKeys = Object.keys(movesData).filter(key => {
    return movesData[key].chiCost <= cpuState.chi;
  });

  // Low CHI safety charge
  if (cpuState.chi < 4 && Math.random() < 0.6) {
    return 'S+J';
  }

  // Fainted opponent punishment trigger
  if (opponentState.isFainted && availableKeys.includes('S+L')) {
    return 'S+L';
  }

  // Weighted random pick among affordable commands
  const randomIndex = Math.floor(Math.random() * availableKeys.length);
  return availableKeys[randomIndex] || 'D+J';
}
