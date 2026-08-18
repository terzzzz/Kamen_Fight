let selectState = {
  currentStep: 1, // 1: P1 Select, 2: P2 Select, 3: Ready to Fight
  p1Index: 9,     // Default: Black
  p2Index: 6,     // Default: Stronger
  p1Type: 'HUMAN',
  p2Type: 'CPU'
};

let ridersData = [];

async function initSelectionUI() {
  const response = await fetch('data/riders.json');
  ridersData = await response.json();
  updateCardUI('p1');
  updateCardUI('p2');
  applyStepFocus();
}

function cycleRider(player, direction) {
  // Only allow cycling if it's that player's active turn
  if ((player === 'p1' && selectState.currentStep !== 1) || 
      (player === 'p2' && selectState.currentStep !== 2)) return;

  const key = player + 'Index';
  selectState[key] = (selectState[key] + direction + ridersData.length) % ridersData.length;
  updateCardUI(player);
}

function toggleControlType(player) {
  if ((player === 'p1' && selectState.currentStep !== 1) || 
      (player === 'p2' && selectState.currentStep !== 2)) return;

  const key = player + 'Type';
  selectState[key] = selectState[key] === 'HUMAN' ? 'CPU' : 'HUMAN';
  document.getElementById(`${player}-type-display`).textContent = selectState[key];
  document.getElementById('vs-error-banner').hidden = true;
}

function updateCardUI(player) {
  const rider = ridersData[selectState[player + 'Index']];
  document.getElementById(`${player}-img`).src = rider.icon;
  document.getElementById(`${player}-name-display`).textContent = rider.name;
}

function handleConfirmStep() {
  const errorBanner = document.getElementById('vs-error-banner');

  if (selectState.currentStep === 1) {
    // Confirm P1 -> Move to P2
    selectState.currentStep = 2;
    applyStepFocus();
  } else if (selectState.currentStep === 2) {
    // Validate HUMAN vs HUMAN constraint
    if (selectState.p1Type === 'HUMAN' && selectState.p2Type === 'HUMAN') {
      errorBanner.hidden = false;
      return;
    }
    // Confirm P2 -> Ready
    selectState.currentStep = 3;
    applyStepFocus();
  } else if (selectState.currentStep === 3) {
    // Launch Battle
    document.getElementById('vs-select-screen').style.display = 'none';
    startBattle({
      p1Rider: JSON.parse(JSON.stringify(ridersData[selectState.p1Index])),
      p1IsCPU: selectState.p1Type === 'CPU',
      p2Rider: JSON.parse(JSON.stringify(ridersData[selectState.p2Index])),
      p2IsCPU: selectState.p2Type === 'CPU'
    });
  }
}

function handleBackStep() {
  document.getElementById('vs-error-banner').hidden = true;

  if (selectState.currentStep === 3) {
    selectState.currentStep = 2;
  } else if (selectState.currentStep === 2) {
    selectState.currentStep = 1;
  } else if (selectState.currentStep === 1) {
    // Return to main overlay screen if at Step 1
    console.log("Returned to Main Title");
  }
  applyStepFocus();
}

function applyStepFocus() {
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const header = document.getElementById('vs-header-text');
  const confirmBtn = document.getElementById('confirm-btn');

  // Disable/Enable inputs based on active step
  setP2InputsDisabled(selectState.currentStep !== 2);
  setP1InputsDisabled(selectState.currentStep !== 1);

  if (selectState.currentStep === 1) {
    header.textContent = "STEP 1: SELECT PLAYER 1 RIDER";
    confirmBtn.textContent = "CONFIRM P1";
    document.getElementById('p1-badge').textContent = "P1 CHOOSING";
    document.getElementById('p2-badge').textContent = "WAITING";
  } else if (selectState.currentStep === 2) {
    header.textContent = "STEP 2: SELECT PLAYER 2 RIDER";
    confirmBtn.textContent = "CONFIRM P2";
    document.getElementById('p1-badge').textContent = "P1 LOCKED";
    document.getElementById('p2-badge').textContent = "P2 CHOOSING";
  } else if (selectState.currentStep === 3) {
    header.textContent = "MATCH READY!";
    confirmBtn.textContent = "START FIGHT!";
    document.getElementById('p1-badge').textContent = "P1 READY";
    document.getElementById('p2-badge').textContent = "P2 READY";
  }
}

function setP1InputsDisabled(disabled) {
  document.getElementById('p1-left-btn').disabled = disabled;
  document.getElementById('p1-right-btn').disabled = disabled;
}

function setP2InputsDisabled(disabled) {
  document.getElementById('p2-left-btn').disabled = disabled;
  document.getElementById('p2-right-btn').disabled = disabled;
  document.getElementById('p2-type-left').disabled = disabled;
  document.getElementById('p2-type-right').disabled = disabled;
}

window.onload = () => {
  initSelectionUI();
};
