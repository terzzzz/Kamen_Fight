let selectState = {
  p1Index: 9, // Kamen Rider Black
  p2Index: 6, // Kamen Rider Stronger
  p1Type: 'PLAYER',
  p2Type: 'CPU'
};

let ridersData = [];

async function initSelectionUI() {
  const response = await fetch('data/riders.json');
  ridersData = await response.json();
  updateCardUI('p1');
  updateCardUI('p2');
}

function cycleRider(player, direction) {
  const key = player + 'Index';
  selectState[key] = (selectState[key] + direction + ridersData.length) % ridersData.length;
  updateCardUI(player);
}

function toggleControlType(player) {
  const key = player + 'Type';
  selectState[key] = selectState[key] === 'PLAYER' ? 'CPU' : 'PLAYER';
  document.getElementById(`${player}-type-display`).textContent = selectState[key];
  document.getElementById('vs-error-banner').hidden = true;
}

function updateCardUI(player) {
  const rider = ridersData[selectState[player + 'Index']];
  document.getElementById(`${player}-img`).src = rider.icon;
  document.getElementById(`${player}-name-display`).textContent = rider.name;
}

function validateAndStartMatch() {
  const errorBanner = document.getElementById('vs-error-banner');

  if (selectState.p1Type === 'PLAYER' && selectState.p2Type === 'PLAYER') {
    errorBanner.hidden = false;
    return;
  }

  errorBanner.hidden = true;
  document.getElementById('vs-select-screen').style.display = 'none';

  startBattle({
    p1Rider: JSON.parse(JSON.stringify(ridersData[selectState.p1Index])),
    p1IsCPU: selectState.p1Type === 'CPU',
    p2Rider: JSON.parse(JSON.stringify(ridersData[selectState.p2Index])),
    p2IsCPU: selectState.p2Type === 'CPU'
  });
}

window.onload = () => {
  initSelectionUI();
  initItemPool();
};
