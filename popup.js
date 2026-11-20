const toggle = document.getElementById('toggle');
const styleSelect = document.getElementById('styleSelect');
const transScale = document.getElementById('transScale');
const scaleValue = document.getElementById('scaleValue');

function updateScaleLabel(val) {
  scaleValue.textContent = `${val}%`;
}

chrome.storage.sync.get({ enabled: true, style: 'subtle', transScale: 100 }, (res) => {
  toggle.checked = res.enabled;
  styleSelect.value = res.style;
  transScale.value = res.transScale;
  updateScaleLabel(res.transScale);
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

styleSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ style: styleSelect.value });
});

transScale.addEventListener('input', () => {
  const val = Number(transScale.value);
  updateScaleLabel(val);
  chrome.storage.sync.set({ transScale: val });
});

scaleValue.addEventListener('click', () => {
  transScale.value = 100;
  updateScaleLabel(100);
  chrome.storage.sync.set({ transScale: 100 });
});
