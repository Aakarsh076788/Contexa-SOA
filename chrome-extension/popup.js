const unpairedView = document.querySelector('#unpairedView');
const pairedView = document.querySelector('#pairedView');
const statusPill = document.querySelector('#statusPill');
const statusText = document.querySelector('#statusText');
const enabledSwitch = document.querySelector('#enabledSwitch');
const codeBoxes = Array.from(document.querySelectorAll('.code-box'));
const pairFeedback = document.querySelector('#pairFeedback');
const manualToggleBtn = document.querySelector('#manualToggleBtn');
const manualConfigSection = document.querySelector('#manualConfigSection');
const apiBaseInput = document.querySelector('#apiBase');
const disconnectBtn = document.querySelector('#disconnectBtn');

let pairing = false;
const defaults = {
  apiBase: 'http://127.0.0.1:4000',
  sessionToken: '',
  enabled: true
};

// Initial state load
chrome.storage.local.get(defaults, (data) => {
  apiBaseInput.value = data.apiBase || defaults.apiBase;
  enabledSwitch.checked = Boolean(data.enabled);

  if (data.sessionToken) {
    showPairedState();
  } else {
    showUnpairedState();
  }
});

function showPairedState() {
  unpairedView.classList.add('hidden');
  pairedView.classList.remove('hidden');
  statusPill.className = 'status-pill on';
  statusText.textContent = enabledSwitch.checked ? 'Enabled · awaiting activity' : 'Paused';
  chrome.storage.local.get(['lastCaptureStatus', 'lastCaptureError'], data => { if (enabledSwitch.checked) statusText.textContent = data.lastCaptureError ? 'Delivery needs attention' : data.lastCaptureStatus || 'Enabled · awaiting activity'; });
}

function showUnpairedState() {
  pairedView.classList.add('hidden');
  unpairedView.classList.remove('hidden');
  statusPill.className = 'status-pill off';
  statusText.textContent = 'Unpaired';
  codeBoxes.forEach(b => { b.value = ''; });
  setTimeout(() => { if (codeBoxes[0]) codeBoxes[0].focus(); }, 100);
}

// ─── Netflix 6-digit Code Box Behavior ──────────────────────────────
codeBoxes.forEach((box, index) => {
  // Typing input
  box.addEventListener('input', (e) => {
    const val = e.target.value.toUpperCase();
    e.target.value = val.slice(-1); // Only keep 1 char

    if (e.target.value && index < codeBoxes.length - 1) {
      codeBoxes[index + 1].focus();
    }

    checkAndSubmitCode();
  });

  // Backspace key
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      codeBoxes[index - 1].focus();
    }
  });

  // Paste support (paste full 6-digit code)
  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pasted.length >= 6) {
      for (let i = 0; i < 6; i++) {
        if (codeBoxes[i]) codeBoxes[i].value = pasted[i];
      }
      if (codeBoxes[5]) codeBoxes[5].focus();
      checkAndSubmitCode();
    }
  });
});

// Check if all 6 boxes are filled and verify with server
async function checkAndSubmitCode() {
  const code = codeBoxes.map(b => b.value.trim().toUpperCase()).join('');
  if (code.length === 6 && !pairing) {
    pairing = true;
    pairFeedback.className = 'feedback-msg';
    pairFeedback.textContent = 'Verifying code...';

    const apiBase = apiBaseInput.value.trim().replace(/\/+$/, '') || defaults.apiBase;

    try {
      const res = await fetch(`${apiBase}/api/connectors/pair/verify`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, source: 'chrome' })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        pairFeedback.className = 'feedback-msg';
        pairFeedback.textContent = '✓ Paired successfully!';

        enabledSwitch.checked = true;
        // Save connector token in local extension storage
        chrome.storage.local.set({
          apiBase,
          sessionToken: data.connectorToken,
          enabled: true
        }, () => {
          setTimeout(() => {
            showPairedState();
            pairFeedback.textContent = '';
          }, 800);
        });
      } else {
        pairFeedback.className = 'feedback-msg error';
        pairFeedback.textContent = data.error || 'Invalid or expired code.';
        codeBoxes.forEach(b => { b.value = ''; });
        codeBoxes[0]?.focus();
      }
    } catch (err) {
      pairFeedback.className = 'feedback-msg error';
      pairFeedback.textContent = `Cannot reach server at ${apiBase}`;
    } finally { pairing = false; }
  }
}

// Toggle Tracking Switch in Paired State
enabledSwitch.addEventListener('change', () => {
  const isEnabled = enabledSwitch.checked;
  chrome.storage.local.set({ enabled: isEnabled }, () => {
    if (isEnabled) {
      statusPill.className = 'status-pill on';
      statusText.textContent = 'Enabled · awaiting activity';
    } else {
      statusPill.className = 'status-pill off';
      statusText.textContent = 'Paused';
    }
  });
});

// Disconnect button
disconnectBtn.addEventListener('click', () => {
  chrome.storage.local.set({ sessionToken: '', enabled: false }, () => {
    showUnpairedState();
  });
});

// Manual config toggle
manualToggleBtn.addEventListener('click', () => {
  manualConfigSection.classList.toggle('hidden');
});
apiBaseInput.addEventListener('change', () => {
  chrome.storage.local.set({ apiBase: apiBaseInput.value.trim() });
});
