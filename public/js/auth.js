// ------------------------------------------------------------------
//  Login + register form handling. Shared by login.html & register.html.
//  On success: store the session and go to the dashboard.
// ------------------------------------------------------------------

import { post, setSession, getToken } from './api.js';

// Already signed in? Skip the auth pages.
if (getToken()) location.href = '/dashboard.html';

const errorBox = document.getElementById('form-error');

function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function clearError() {
  if (errorBox) errorBox.classList.add('hidden');
}

function withSubmitting(btn, fn) {
  return async (e) => {
    e.preventDefault();
    clearError();
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Please wait…';
    try {
      await fn();
    } catch (err) {
      showError(err.message || 'Something went wrong');
      btn.disabled = false;
      btn.textContent = original;
    }
  };
}

// ---- Login ----
const loginForm = document.getElementById('login-form');
if (loginForm) {
  const btn = loginForm.querySelector('button[type="submit"]');
  loginForm.addEventListener(
    'submit',
    withSubmitting(btn, async () => {
      const login = loginForm.login.value.trim();
      const password = loginForm.password.value;
      if (!login || !password) throw new Error('Please enter your login and password');
      const { token, user } = await post('/auth/login', { login, password });
      setSession(token, user);
      location.href = '/dashboard.html';
    })
  );
}

// ---- Register ----
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const btn = registerForm.querySelector('button[type="submit"]');
  registerForm.addEventListener(
    'submit',
    withSubmitting(btn, async () => {
      const username = registerForm.username.value.trim();
      const email = registerForm.email.value.trim();
      const displayName = registerForm.displayName.value.trim();
      const password = registerForm.password.value;
      if (!username || !email || !password) {
        throw new Error('Username, email and password are required');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      const { token, user } = await post('/auth/register', {
        username,
        email,
        displayName,
        password,
      });
      setSession(token, user);
      location.href = '/dashboard.html';
    })
  );
}
