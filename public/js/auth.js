// Auth JavaScript Logic

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already logged in
  checkExistingSession();

  // Tab switching
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const alertBox = document.getElementById('alertBox');
  const alertMessage = document.getElementById('alertMessage');
  const alertIcon = document.getElementById('alertIcon');

  function showLoginTab() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLoginBtn.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 text-white bg-gradient-to-r from-blue-600 to-cyan-600 shadow-md';
    tabRegisterBtn.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400';
    hideAlert();
  }

  function showRegisterTab() {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabRegisterBtn.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 text-white bg-gradient-to-r from-blue-600 to-cyan-600 shadow-md';
    tabLoginBtn.className = 'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400';
    hideAlert();
  }

  tabLoginBtn?.addEventListener('click', showLoginTab);
  tabRegisterBtn?.addEventListener('click', showRegisterTab);

  // Toggle Password Visibility
  document.querySelectorAll('.toggle-password-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = btn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  });

  // Alert Box Helper
  function showAlert(msg, type = 'error') {
    alertBox.classList.remove('hidden', 'bg-blue-50', 'text-blue-700', 'border-blue-200', 'dark:bg-blue-950/50', 'dark:text-blue-300', 'dark:border-blue-900', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200', 'dark:bg-emerald-950/50', 'dark:text-emerald-300', 'dark:border-emerald-900');
    
    if (type === 'error') {
      alertBox.classList.add('bg-blue-50', 'text-blue-700', 'border', 'border-blue-200', 'dark:bg-blue-950/50', 'dark:text-blue-300', 'dark:border-blue-900');
      alertIcon.className = 'fa-solid fa-triangle-exclamation text-lg text-blue-500';
    } else {
      alertBox.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-200', 'dark:bg-emerald-950/50', 'dark:text-emerald-300', 'dark:border-emerald-900');
      alertIcon.className = 'fa-solid fa-circle-check text-lg text-emerald-500';
    }
    alertMessage.textContent = msg;
  }

  function hideAlert() {
    alertBox.classList.add('hidden');
  }

  // Handle Login Submit
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Signing In...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('iot_user', JSON.stringify(data.user));
        localStorage.setItem('iot_token', data.token);
        showAlert('Login successful! Redirecting to Dashboard...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 800);
      } else {
        showAlert(data.message || 'Invalid email or password', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Unable to connect to server. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign In to Dashboard</span><i class="fa-solid fa-arrow-right text-xs"></i>';
    }
  });

  // Handle Register Submit
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const submitBtn = document.getElementById('regSubmitBtn');

    if (password.length < 6) {
      showAlert('Password must be at least 6 characters long', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Registering...';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('iot_user', JSON.stringify(data.user));
        localStorage.setItem('iot_token', data.token);
        showAlert('Registration successful! Welcome aboard...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 900);
      } else {
        showAlert(data.message || 'Registration failed. Please check your inputs.', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Unable to connect to server. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Create Free Account</span><i class="fa-solid fa-user-check text-xs"></i>';
    }
  });

  // Theme Toggle Functionality
  initThemeToggle();
});

// Check if already authenticated
async function checkExistingSession() {
  const token = localStorage.getItem('iot_token');
  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          localStorage.setItem('iot_user', JSON.stringify(data.user));
          window.location.href = '/dashboard';
        }
      }
    } catch (e) {
      // Ignore network errors on splash
    }
  }
}

// Light / Dark Theme Toggle
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');

  function updateIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    if (themeIcon) {
      if (isDark) {
        themeIcon.className = 'fa-solid fa-sun text-lg text-amber-400';
      } else {
        themeIcon.className = 'fa-solid fa-moon text-lg text-slate-700';
      }
    }
  }

  updateIcon();

  themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateIcon();
  });
}
