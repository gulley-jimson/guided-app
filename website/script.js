// Early-access signup — stores to localStorage and logs to console.
function initSignupForm() {
  const form = document.querySelector('[data-signup-form]');
  if (!form) return;

  const status = form.parentElement.querySelector('[data-signup-status]');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const email = (input?.value ?? '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(status, 'Please enter a valid email address.', 'error');
      input?.focus();
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem('guided.signups') ?? '[]');
      stored.push({ email, ts: Date.now() });
      localStorage.setItem('guided.signups', JSON.stringify(stored));
    } catch {
      // Ignore storage failures (quota, private mode, etc.)
    }

    console.info('[guided.build] early access signup:', email);
    form.reset();
    setStatus(status, "Thanks — you're on the list. We'll be in touch.", 'success');
  });
}

function setStatus(el, message, kind) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('success', 'error');
  if (kind) el.classList.add(kind);
}

// Directory search — filter individual tool cards across every category section.
// Sections whose tools are all hidden collapse out of view.
function initDirectorySearch() {
  const input = document.querySelector('[data-directory-search]');
  if (!input) return;

  const tools = Array.from(document.querySelectorAll('[data-tool]'));
  const sections = Array.from(document.querySelectorAll('[data-category-section]'));
  const empty = document.querySelector('[data-empty-state]');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visibleTotal = 0;

    for (const tool of tools) {
      const haystack = (tool.dataset.search ?? tool.textContent ?? '').toLowerCase();
      const match = q === '' || haystack.includes(q);
      tool.classList.toggle('is-hidden', !match);
      if (match) visibleTotal += 1;
    }

    for (const section of sections) {
      const visibleTools = section.querySelectorAll('[data-tool]:not(.is-hidden)').length;
      section.classList.toggle('is-hidden', visibleTools === 0);
    }

    if (empty) {
      empty.classList.toggle('is-visible', visibleTotal === 0 && q !== '');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSignupForm();
  initDirectorySearch();
});
