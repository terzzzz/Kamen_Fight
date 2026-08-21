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

// Dynamic Roster Storage
let AVAILABLE_RIDERS = [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 1050 }
];

let vsSelectionState = {
  step: 1, // 1: Select P1, 2: Select P2, 3: Ready
  p1Index: 0,
  p1IsCPU: false,
  p2Index: 0,
  p2IsCPU: true
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('data/riders.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        AVAILABLE_RIDERS = data;
      }
    }
  } catch (err) {
    console.warn("Could not load riders.json, using default roster.");
  }

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
  if (!AVAILABLE_RIDERS || AVAILABLE_RIDERS.length === 0) return;

  const p1 = AVAILABLE_RIDERS[vsSelectionState.p1Index] || AVAILABLE_RIDERS[0];
  const p2 = AVAILABLE_RIDERS[vsSelectionState.p2Index] || AVAILABLE_RIDERS[0];

  const p1ImgEl = document.getElementById('p1-img');
  if (p1ImgEl) p1ImgEl.src = p1.icon;
  
  const p1NameEl = document.getElementById('p1-name-display');
  if (p1NameEl) p1NameEl.textContent = p1.name;

  const p1TypeEl = document.getElementById('p1-type-display');
  if (p1TypeEl) p1TypeEl.textContent = vsSelectionState.p1IsCPU ? 'CPU' : 'HUMAN';

  const p2ImgEl = document.getElementById('p2-img');
  if (p2ImgEl) {
    p2ImgEl.src = p2.icon;
    // Palette Swap P2 Portrait for Mirror Match
    p2ImgEl.classList.toggle('p2-mirror-palette', p1.id === p2.id);
  }

  const p2NameEl = document.getElementById('p2-name-display');
  if (p2NameEl) p2NameEl.textContent = p2.name;

  const p2TypeEl = document.getElementById('p2-type-display');
  if (p2TypeEl) p2TypeEl.textContent = vsSelectionState.p2IsCPU ? 'CPU' : 'HUMAN';

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
  
  const p1TypeLeft = document.getElementById('p1-type-left');
  const p1TypeRight = document.getElementById('p1-type-right');
  const p2TypeLeft = document.getElementById('p2-type-left');
  const p2TypeRight = document.getElementById('p2-type-right');

  const multiRider = AVAILABLE_RIDERS.length > 1;

  if (vsSelectionState.step === 1) {
    if (headerText) headerText.textContent = 'STEP 1: CONFIRM PLAYER 1 RIDER';
    if (p1Card) p1Card.className = 'rider-card active-slot';
    if (p2Card) p2Card.className = 'rider-card locked-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = !multiRider;
    if (p1RightBtn) p1RightBtn.disabled = !multiRider;
    if (p1TypeLeft) p1TypeLeft.disabled = false;
    if (p1TypeRight) p1TypeRight.disabled = false;

    if (p2LeftBtn) p2LeftBtn.disabled = true;
    if (p2RightBtn) p2RightBtn.disabled = true;
    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    if (confirmBtn) {
      confirmBtn.hidden = false;
      confirmBtn.textContent = 'CONFIRM P1';
    }
    if (startBtn) startBtn.hidden = true;
    if (backBtn) backBtn.disabled = true;

  } else if (vsSelectionState.step === 2) {
    if (headerText) headerText.textContent = 'STEP 2: CONFIRM PLAYER 2 RIDER';
    if (p1Card) p1Card.className = 'rider-card locked-slot';
    if (p2Card) p2Card.className = 'rider-card active-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = true;
    if (p1RightBtn) p1RightBtn.disabled = true;
    if (p1TypeLeft) p1TypeLeft.disabled = true;
    if (p1TypeRight) p1TypeRight.disabled = true;

    if (p2LeftBtn) p2LeftBtn.disabled = !multiRider;
    if (p2RightBtn) p2RightBtn.disabled = !multiRider;
    if (p2TypeLeft) p2TypeLeft.disabled = false;
    if (p2TypeRight) p2TypeRight.disabled = false;

    if (confirmBtn) {
      confirmBtn.hidden = false;
      confirmBtn.textContent = 'CONFIRM P2';
    }
    if (startBtn) startBtn.hidden = true;
    if (backBtn) backBtn.disabled = false;

  } else if (vsSelectionState.step === 3) {
    if (headerText) headerText.textContent = 'READY FOR BATTLE!';
    if (p1Card) p1Card.className = 'rider-card active-slot';
    if (p2Card) p2Card.className = 'rider-card active-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = true;
    if (p1RightBtn) p1RightBtn.disabled = true;
    if (p1TypeLeft) p1TypeLeft.disabled = true;
    if (p1TypeRight) p1TypeRight.disabled = true;

    if (p2LeftBtn) p2LeftBtn.disabled = true;
    if (p2RightBtn) p2RightBtn.disabled = true;
    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    if (confirmBtn) confirmBtn.hidden = true;
    if (startBtn) startBtn.hidden = false;
    if (backBtn) backBtn.disabled = false;
  }
}

function validateAndStartMatch() {
  stopSelectionBGM();
  playBattleBGM();

  const selectScreen = document.getElementById('vs-select-screen');
  if (selectScreen) selectScreen.hidden = true;

  const matchConfig = {
    p1Rider: AVAILABLE_RIDERS[vsSelectionState.p1Index] || AVAILABLE_RIDERS[0],
    p1IsCPU: vsSelectionState.p1IsCPU,
    p2Rider: AVAILABLE_RIDERS[vsSelectionState.p2Index] || AVAILABLE_RIDERS[0],
    p2IsCPU: vsSelectionState.p2IsCPU
  };

  if (typeof startBattle === 'function') {
    startBattle(matchConfig);
  }
}
