// BGM Audio Controllers
let selectionBGM = null;
let battleBGM = null;

function playSelectionBGM() {
  if (selectionBGM) return;

  selectionBGM = new Audio('assets/sounds/matchup.mp3');
  selectionBGM.loop = true;
  selectionBGM.volume = 0.5;

  selectionBGM.play().catch(() => {});
}

function stopSelectionBGM() {
  if (selectionBGM) {
    selectionBGM.pause();
    selectionBGM.currentTime = 0;
    selectionBGM = null;
  }
}

function playBattleBGM() {
  if (battleBGM) return;

  battleBGM = new Audio('assets/sounds/matchup1.mp3');
  battleBGM.loop = true;
  battleBGM.volume = 0.5;

  battleBGM.play().catch(() => {});
}

function stopBattleBGM() {
  if (battleBGM) {
    battleBGM.pause();
    battleBGM.currentTime = 0;
    battleBGM = null;
  }
}

// Roster Configuration (Locked exclusively to Ichigo)
const AVAILABLE_RIDERS = [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 1050 }
];

let vsSelectionState = {
  step: 1, // 1: Select P1, 2: Select P2, 3: Ready
  p1Index: 0, // Kamen Rider Ichigo
  p1IsCPU: false,
  p2Index: 0, // Kamen Rider Ichigo
  p2IsCPU: true
};

document.addEventListener('DOMContentLoaded', () => {
  updateSelectionUI();

  // Autoplay Unlock Listener
  const unlockAudio = () => {
    playSelectionBGM();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };

  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
});

function cycleRider(playerKey, direction) {
  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1Index = (vsSelectionState.p1Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2Index = (vsSelectionState.p2Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  }
  updateSelectionUI();
}

function toggleControlType(playerKey) {
  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1IsCPU = !vsSelectionState.p1IsCPU;
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2IsCPU = !vsSelectionState.p2IsCPU;
  }
  updateSelectionUI();
}

function handleConfirmStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step === 1) {
    vsSelectionState.step = 2;
  } else if (vsSelectionState.step === 2) {
    if (!vsSelectionState.p1IsCPU && !vsSelectionState.p2IsCPU) {
      if (errorBanner) errorBanner.hidden = false;
      return;
    }
    vsSelectionState.step = 3;
  }
  updateSelectionUI();
}

function handleBackStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step > 1) {
    vsSelectionState.step--;
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const p1 = AVAILABLE_RIDERS[vsSelectionState.p1Index];
  const p2 = AVAILABLE_RIDERS[vsSelectionState.p2Index];

  document.getElementById('p1-img').src = p1.icon;
  document.getElementById('p1-name-display').textContent = p1.name;
  document.getElementById('p1-type-display').textContent = vsSelectionState.p1IsCPU ? 'CPU' : 'HUMAN';

  const p2ImgEl = document.getElementById('p2-img');
  if (p2ImgEl) {
    p2ImgEl.src = p2.icon;
    // Palette Swap P2 Portrait for Mirror Match
    p2ImgEl.classList.toggle('p2-mirror-palette', p1.id === p2.id);
  }

  document.getElementById('p2-name-display').textContent = p2.name;
  document.getElementById('p2-type-display').textContent = vsSelectionState.p2IsCPU ? 'CPU' : 'HUMAN';

  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const headerText = document.getElementById('vs-header-text');
  const confirmBtn = document.getElementById('confirm-btn');
  const startBtn = document.getElementById('start-game-btn');
  const backBtn = document.getElementById('back-btn');

  const p1LeftBtn = document.getElementById('p1-left-btn');
  const p1RightBtn = document.getElementById('p1-right-btn');
  const p2LeftBtn = document.getElementById('p2-left-btn');
  const p2RightBtn = document.getElementById('p2-right-btn');
  const p2TypeLeft = document.getElementById('p2-type-left');
  const p2TypeRight = document.getElementById('p2-type-right');

  // Cycle buttons disabled at all times since only 1 rider is available
  if (p1LeftBtn) p1LeftBtn.disabled = true;
  if (p1RightBtn) p1RightBtn.disabled = true;
  if (p2LeftBtn) p2LeftBtn.disabled = true;
  if (p2RightBtn) p2RightBtn.disabled = true;

  if (vsSelectionState.step === 1) {
    headerText.textContent = 'STEP 1: CONFIRM PLAYER 1 RIDER';
    p1Card.className = 'rider-card active-slot';
    p2Card.className = 'rider-card locked-slot';

    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    confirmBtn.hidden = false;
    confirmBtn.textContent = 'CONFIRM P1';
    startBtn.hidden = true;
    backBtn.disabled = true;

  } else if (vsSelectionState.step === 2) {
    headerText.textContent = 'STEP 2: CONFIRM PLAYER 2 RIDER';
    p1Card.className = 'rider-card locked-slot';
    p2Card.className = 'rider-card active-slot';

    if (p2TypeLeft) p2TypeLeft.disabled = false;
    if (p2TypeRight) p2TypeRight.disabled = false;

    confirmBtn.hidden = false;
    confirmBtn.textContent = 'CONFIRM P2';
    startBtn.hidden = true;
    backBtn.disabled = false;

  } else if (vsSelectionState.step === 3) {
    headerText.textContent = 'READY FOR BATTLE!';
    p1Card.className = 'rider-card active-slot';
    p2Card.className = 'rider-card active-slot';

    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    confirmBtn.hidden = true;
    startBtn.hidden = false;
    backBtn.disabled = false;
  }
}

function validateAndStartMatch() {
  stopSelectionBGM();
  playBattleBGM();

  document.getElementById('vs-select-screen').hidden = true;

  const matchConfig = {
    p1Rider: AVAILABLE_RIDERS[vsSelectionState.p1Index],
    p1IsCPU: vsSelectionState.p1IsCPU,
    p2Rider: AVAILABLE_RIDERS[vsSelectionState.p2Index],
    p2IsCPU: vsSelectionState.p2IsCPU
  };

  if (typeof startBattle === 'function') {
    startBattle(matchConfig);
  }
}
