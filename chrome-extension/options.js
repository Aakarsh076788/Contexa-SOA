const fields = ['apiBase', 'sessionToken', 'enabled'];
const status = document.querySelector('#status');
chrome.storage.local.get({ apiBase: 'http://127.0.0.1:4000', sessionToken: '', enabled: false }, (values) => fields.forEach((field) => { document.querySelector(`#${field}`)[field === 'enabled' ? 'checked' : 'value'] = values[field]; }));
document.querySelector('#save').addEventListener('click', () => {
  const values = Object.fromEntries(fields.map((field) => [field, document.querySelector(`#${field}`)[field === 'enabled' ? 'checked' : 'value']]));
  chrome.storage.local.set(values, () => { status.textContent = 'Saved. Chrome metadata collection follows this switch.'; });
});
