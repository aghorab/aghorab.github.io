/* The tester application form on the home page.
 *
 * The page is static, so the form posts to a Cloudflare Worker (data-endpoint on the form), which
 * checks it and appends a row to a CSV in a private GitHub repository. Turnstile (data-sitekey) is
 * Cloudflare's captcha; it is usually invisible and only asks for a click when it is unsure.
 * Until both attributes are filled in, the form is shown but says applications open shortly. */
(function () {
  'use strict';
  const form = document.getElementById('tester-form');
  if (!form) return;
  const endpoint = form.dataset.endpoint, sitekey = form.dataset.sitekey;
  const msg = form.querySelector('.tform-msg');
  const button = form.querySelector('button[type=submit]');
  const openedAt = Date.now();
  let widget = null, token = '';

  const say = (text, kind) => { msg.textContent = text; msg.className = 'tform-msg' + (kind ? ' ' + kind : ''); };

  if (!endpoint || !sitekey) {
    button.disabled = true;
    say('Applications open very soon. Until then, email me at aghorab.slovakia@gmail.com and I will add you.', 'info');
    return;
  }

  /* Turnstile is loaded only when the form comes near the screen, so visitors who never scroll this
     far never contact Cloudflare. */
  function loadTurnstile() {
    if (window.turnstile || document.getElementById('ts-script')) return;
    window.onTurnstileLoad = () => {
      widget = turnstile.render('#ts-box', {
        sitekey, theme: 'auto', action: 'tester-apply',
        callback: t => { token = t; },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { token = ''; }
      });
    };
    const s = document.createElement('script');
    s.id = 'ts-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    s.async = true;
    document.head.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); loadTurnstile(); } }, { rootMargin: '400px' });
    io.observe(form);
  } else loadTurnstile();

  const FIELD_NAMES = { name: 'your name', email: 'your email', googleEmail: 'the Google account', country: 'your country', device: 'your device', apps: 'at least one app', consent: 'the agreement' };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    form.querySelectorAll('.bad').forEach(el => el.classList.remove('bad'));
    const f = form.elements;
    const data = {
      name: f.name.value, email: f.email.value, googleEmail: f.googleEmail.value,
      country: f.country.value, device: f.device.value, androidVersion: f.androidVersion.value,
      apps: [...form.querySelectorAll('input[name=apps]:checked')].map(i => i.value),
      experience: (form.querySelector('input[name=experience]:checked') || {}).value || '',
      note: f.note.value, consent: f.consent.checked, website: f.website.value,
      elapsed: Date.now() - openedAt, turnstile: token
    };

    const missing = ['name', 'email', 'googleEmail', 'country', 'device'].find(k => !form.elements[k].checkValidity() || !data[k].trim())
      || (!data.apps.length && 'apps') || (!data.consent && 'consent');
    if (missing) return fieldError(missing);
    if (!token) return say('Please complete the check above the button first.', 'error');

    button.disabled = true;
    say('Sending…');
    try {
      const r = await fetch(endpoint.replace(/\/$/, '') + '/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const out = await r.json().catch(() => ({}));
      if (r.ok) return done();
      if (r.status === 409) return done('This email has already applied, so you are on the list. I will be in touch.');
      if (r.status === 422 && out.field) return fieldError(out.field);
      if (r.status === 403 && out.error === 'captcha') return retry('The check did not go through. Please try it again.');
      if (r.status === 429) return retry('Too many tries from your connection. Please wait a minute and send again.');
      retry('Something went wrong on my side. Please try again later, or email me.');
    } catch (err) {
      retry('Could not reach the server. Check your connection and try again.');
    }
  });

  function fieldError(field) {
    const el = field === 'apps' ? form.querySelector('fieldset') : form.elements[field];
    const box = el && (el.closest('label') || el);
    if (box) box.classList.add('bad');
    if (el && field !== 'apps') el.focus();
    say('Please check ' + (FIELD_NAMES[field] || 'the form') + '.', 'error');
  }
  function retry(text) {
    button.disabled = false;
    token = '';
    if (window.turnstile && widget !== null) turnstile.reset(widget);
    say(text, 'error');
  }
  function done(text) {
    form.innerHTML = '<div class="tform-done"><h3>Thank you!</h3><p>' +
      (text || 'Your application is in. I will email you when the next test build is ready.') + '</p></div>';
  }
})();
