/* ==========================================================================
   Prime Radio — AudioRecordingFM
   Shared client runtime: authentication UI + an accessible dialog system.

   Design notes
   ------------
   * No jQuery. All DOM work is vanilla (see review finding L1).
   * The dialog is a single reusable component with two modes
   (`confirm` / `alert`) instead of one markup block per mode.
   * Only one dialog may be open. Opening a new one settles any dialog
     already awaiting a decision, so a promise can never be stranded
     (review finding C4).
   * Modal accessibility: role=dialog, aria-modal, focus trap, Escape to
     close, and focus restored to the trigger (review finding H3).
   ========================================================================== */

/* ==========================================================================
   AUTHENTICATION
   ========================================================================== */

window.isLoggedIn = function () {
    return !!localStorage.getItem('authToken');
};

window.setAuthToken = function (token) {
    localStorage.setItem('authToken', token);
    window.updateAuthUI();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: { loggedIn: true } }));
};

window.clearAuthToken = function () {
    localStorage.removeItem('authToken');
    window.updateAuthUI();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: { loggedIn: false } }));
};

window.updateAuthUI = function () {
    const isAuth = window.isLoggedIn();
    const authBtnText = document.getElementById('authBtnText');
    const authBtnMobileText = document.getElementById('authBtnMobileText');

    if (authBtnText) authBtnText.textContent = isAuth ? 'Logout' : 'Login';
    if (authBtnMobileText) authBtnMobileText.textContent = isAuth ? 'Logout' : 'Login';

    // Let the rest of the page react to login state (e.g. disabling the
    // form when signed out) without any page-specific wiring.
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: { loggedIn: isAuth } }));
};

window.getAuthHeaders = function () {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
};

window.handleLogin = async function (username, password) {
    const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        /* server returned a non-JSON body — fall through to generic message */
    }

    if (!response.ok) {
        throw new Error(data.message || 'Invalid username or password');
    }

    return data;
};

window.handleLogout = async function () {
    window.clearAuthToken();
    try {
        await fetch('/logout', { method: 'POST' });
    } catch (e) {
        /* logging out locally is enough — never block on the network */
    }
    window.customAlert('You have been logged out successfully.', 'Logged Out');
};

window.handleAuthClick = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    if (window.isLoggedIn()) {
        window.handleLogout();
    } else {
        window.showLoginModal();
    }
};

/* ==========================================================================
   REGISTRATION
   ========================================================================== */

window.showRegisterModal = function () {
    window.hideLoginModal();
    const modal = document.getElementById('register-modal');
    const content = document.getElementById('register-modal-content');
    if (!modal || !content) return;

    const errorDiv = document.getElementById('registerError');
    const list = document.getElementById('registerErrorList');
    const form = document.getElementById('registerForm');

    if (errorDiv) errorDiv.classList.add('hidden');
    if (form) form.reset();

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(function () {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
        const first = document.getElementById('registerUsername');
        if (first) first.focus();
    });
};

window.hideRegisterModal = function () {
    const modal = document.getElementById('register-modal');
    const content = document.getElementById('register-modal-content');
    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    modal.setAttribute('aria-hidden', 'true');

    setTimeout(function () {
        modal.classList.add('hidden');
        const first = document.getElementById('loginUsername');
        if (first) first.focus();
    }, 300);
};

window.handleRegister = async function (username, password) {
    const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    });

    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        /* non-JSON body */
    }

    if (!response.ok) {
        const error = new Error(data.message || 'Could not create the account.');
        error.fieldErrors = Array.isArray(data.errors) ? data.errors : [];
        throw error;
    }

    return data;
};

/* ==========================================================================
   LOGIN MODAL
   ========================================================================== */

let lastFocusedBeforeLogin = null;

window.showLoginModal = function () {
    const modal = document.getElementById('login-modal');
    const content = document.getElementById('login-modal-content');

    if (!modal || !content) return;

    lastFocusedBeforeLogin = document.activeElement;

    const errorDiv = document.getElementById('loginError');
    const successDiv = document.getElementById('loginSuccess');
    const loginForm = document.getElementById('loginForm');

    if (errorDiv) errorDiv.classList.add('hidden');
    if (successDiv) successDiv.classList.add('hidden');
    if (loginForm) loginForm.reset();

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
        const firstField = document.getElementById('loginUsername');
        if (firstField) firstField.focus();
    });
};

window.hideLoginModal = function () {
    const modal = document.getElementById('login-modal');
    const content = document.getElementById('login-modal-content');

    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    modal.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
        modal.classList.add('hidden');
        if (lastFocusedBeforeLogin && typeof lastFocusedBeforeLogin.focus === 'function') {
            lastFocusedBeforeLogin.focus();
        }
    }, 300);
};

/* ==========================================================================
   DIALOG SYSTEM
   --------------------------------------------------------------------------
   One dialog, two modes.

   The previous implementation wrote button labels through jQuery selectors
   (`#btnClo` / `#btnAcc`) that do not exist in the markup, so every label
   update silently failed and confirmations and alerts looked identical
   (review finding C1). Labels are now applied directly to the real
   elements.
   ========================================================================== */

const Dialog = (function () {
    let resolvePending = null;   // resolver of the dialog currently awaiting a decision
    let lastFocused = null;      // element to return focus to on close
    let isOpen = false;

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function el(id) {
        return document.getElementById(id);
    }

    /**
     * Settle any dialog that is currently awaiting a decision.
     * Prevents overlapping dialogs from stranding an await forever (C4).
     */
    function settlePending(value) {
        if (resolvePending) {
            const resolve = resolvePending;
            resolvePending = null;
            resolve(value);
        }
    }

    function trapFocus(e) {
        if (!isOpen || e.key !== 'Tab') return;

        const content = el('modal-content');
        if (!content) return;

        const focusables = Array.prototype.slice
            .call(content.querySelectorAll(FOCUSABLE))
            .filter(node => node.offsetParent !== null);

        if (!focusables.length) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function paint(options) {
        const title = el('textH');
        const body = el('textB');
        const cancelBtn = el('modal-no-btn');
        const confirmBtn = el('modal-yes-btn');
        const icon = el('dialog-icon');
        const panel = el('modal-panel');

        // textContent, never innerHTML — dialog copy can contain server
        // supplied text and must never be parsed as markup (H2).
        if (title) title.textContent = options.title || '';
        if (body) body.textContent = options.body || '';

        const tone = options.tone || 'neutral';
        const toneMap = {
            neutral: { box: 'bg-slate-100', fg: 'text-slate-500' },
            info: { box: 'bg-rose-100', fg: 'text-rose-500' },
            success: { box: 'bg-emerald-100', fg: 'text-emerald-500' },
            danger: { box: 'bg-red-100', fg: 'text-red-500' }
        };
        const t = toneMap[tone] || toneMap.neutral;

        if (icon) {
            icon.className = 'w-10 h-10 rounded-xl flex items-center justify-center ' + t.box;
            const glyph = icon.querySelector('i');
            if (glyph) {
                glyph.className = 'fa ' + (options.icon || 'fa-question') + ' ' + t.fg;
            }
        }

        if (panel) panel.setAttribute('data-tone', tone);

        if (options.mode === 'confirm') {
            if (cancelBtn) {
                cancelBtn.classList.remove('hidden');
                cancelBtn.textContent = options.cancelText || 'Cancel';
            }
            if (confirmBtn) {
                confirmBtn.classList.remove('hidden');
                confirmBtn.textContent = options.confirmText || 'Confirm';
                confirmBtn.className = confirmBtn.className
                    .replace(/from-rose-\d+/g, options.danger ? 'from-red-500' : 'from-rose-500')
                    .replace(/to-rose-\d+/g, options.danger ? 'to-red-600' : 'to-rose-600')
                    .replace(/hover:from-rose-\d+/g, options.danger ? 'hover:from-red-600' : 'hover:from-rose-600')
                    .replace(/hover:to-rose-\d+/g, options.danger ? 'hover:to-red-700' : 'hover:to-rose-700')
                    .replace(/shadow-rose-\d+\/\d+/g, options.danger ? 'shadow-red-500/30' : 'shadow-rose-500/30')
                    .replace(/hover:shadow-rose-\d+\/\d+/g, options.danger ? 'hover:shadow-red-500/50' : 'hover:shadow-rose-500/50');
            }
        } else {
            // Alert mode: a single affirmative action.
            if (cancelBtn) cancelBtn.classList.add('hidden');
            if (confirmBtn) {
                confirmBtn.classList.remove('hidden');
                confirmBtn.textContent = options.confirmText || 'Close';
            }
        }
    }

    function open(options) {
        // Never stack dialogs (C4).
        if (isOpen) settlePending(false);

        const modal = el('custom-dialog-box');
        const content = el('modal-content');
        if (!modal || !content) {
            return Promise.resolve(options.mode === 'confirm' ? false : true);
        }

        isOpen = true;
        lastFocused = document.activeElement;

        paint(options);

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');

        requestAnimationFrame(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
            const confirmBtn = el('modal-yes-btn');
            if (confirmBtn) confirmBtn.focus();
        });

        return new Promise(function (resolve) {
            resolvePending = function (value) {
                isOpen = false;
                resolve(value);
            };
        });
    }

    function close(value) {
        const modal = el('custom-dialog-box');
        const content = el('modal-content');

        if (modal) {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            modal.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                modal.classList.add('hidden');
                if (lastFocused && typeof lastFocused.focus === 'function') {
                    lastFocused.focus();
                }
            }, 300);
        }

        settlePending(value);
    }

    /* ---- Wiring (bound once) ---- */

    document.addEventListener('DOMContentLoaded', function () {
        const modal = el('custom-dialog-box');
        if (!modal) return;

        modal.addEventListener('click', function (e) {
            if (e.target.closest('#modal-yes-btn')) {
                close(true);
            } else if (e.target.closest('#modal-no-btn') || e.target.closest('#modal-close-btn')) {
                close(false);
            } else if (e.target.closest('.modal-backdrop')) {
                // Dismissing by backdrop is always a "cancel".
                close(false);
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
                return;
            }
            trapFocus(e);
        });
    });

    return { open: open, close: close, settlePending: settlePending };
})();

/**
 * Show a notice. Resolves when dismissed.
 * @param {string} textB  Body copy.
 * @param {string} textH  Heading.
 * @param {object} [opts] { tone, icon, confirmText }
 */
window.customAlert = function (textB, textH, opts) {
    opts = opts || {};
    return Dialog.open({
        mode: 'alert',
        title: textH || 'Notice',
        body: textB || '',
        tone: opts.tone || 'info',
        icon: opts.icon || 'fa-info-circle',
        confirmText: opts.confirmText || 'Close'
    });
};

/**
 * Ask for confirmation. Resolves true when confirmed, false otherwise.
 * @param {string} textB  Body copy.
 * @param {string} textH  Heading.
 * @param {object} [opts] { tone, icon, cancelText, confirmText, danger }
 */
window.customConfirm = function (textB, textH, opts) {
    opts = opts || {};
    return Dialog.open({
        mode: 'confirm',
        title: textH || 'Confirm',
        body: textB || 'Are you sure you want to proceed?',
        tone: opts.tone || 'neutral',
        icon: opts.icon || 'fa-question',
        cancelText: opts.cancelText || 'Cancel',
        confirmText: opts.confirmText || 'Confirm',
        danger: !!opts.danger
    });
};

/* ==========================================================================
   TIME FORMATTING
   ========================================================================== */

/**
 * Format an hour index for display.
 * @param {number} h Hour 0-23.
 * @returns {{h: number|string, am: string, label: string}}
 */
window.gT = function (h) {
    const hour = Number(h);

    if (hour === 0) return { h: 12, am: 'midnight', label: '12:00 midnight' };
    if (hour === 12) return { h: 12, am: 'noon', label: '12:00 noon' };
    if (hour > 12) return { h: hour - 12, am: 'pm', label: (hour - 12) + ':00 pm' };

    return { h: hour, am: 'am', label: hour + ':00 am' };
};

/**
 * Zero-pad a minute value.
 * @param {number} m Minute 0-59.
 * @returns {string}
 */
window.gM = function (m) {
    const minute = Number(m);
    return minute < 10 ? '0' + minute : String(minute);
};

/**
 * Build a human time range from [hour, minute] pairs.
 * Fixes the missing separator that rendered "12:00midnight" (review M4).
 * @param {Array<number>} start [hour, minute]
 * @param {Array<number>} end   [hour, minute]
 * @returns {string}
 */
window.formatTimeRange = function (start, end) {
    if (!start || !end) return '';

    const s = window.gT(start[0]);
    const e = window.gT(end[0]);
    const startLabel = s.am === 'midnight' || s.am === 'noon'
        ? s.am
        : s.h + ':' + window.gM(start[1]) + ' ' + s.am;
    const endLabel = e.am === 'midnight' || e.am === 'noon'
        ? e.am
        : e.h + ':' + window.gM(end[1]) + ' ' + e.am;

    return startLabel + ' → ' + endLabel;
};

/**
 * Describe how long a schedule runs, accounting for midnight wrap.
 * @param {Array<number>} start [hour, minute]
 * @param {Array<number>} end   [hour, minute]
 * @returns {string}
 */
window.formatDuration = function (start, end) {
    if (!start || !end) return '';

    let mins = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    if (mins <= 0) mins += 24 * 60; // runs past midnight

    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (h && m) return h + 'h ' + m + 'm';
    if (h) return h + (h === 1 ? ' hour' : ' hours');
    return m + ' min';
};

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
    window.updateAuthUI();

    /* Auth button (desktop + mobile share one handler) */
    [document.getElementById('authBtn'), document.getElementById('authBtnMobile')]
        .forEach(function (btn) {
            if (btn) btn.addEventListener('click', window.handleAuthClick);
        });

    /* Mobile menu */
    const menuBtn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (menuBtn && menu) {
        menuBtn.addEventListener('click', function () {
            const isHidden = menu.classList.toggle('hidden');
            menuBtn.setAttribute('aria-expanded', String(!isHidden));
            const icon = menuBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars', isHidden);
                icon.classList.toggle('fa-xmark', !isHidden);
            }
        });

        // Close the menu when navigating within it.
        menu.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                menu.classList.add('hidden');
                menuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* Login modal dismissal */
    const closeBtn = document.getElementById('login-modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', window.hideLoginModal);

    const loginBackdrop = document.querySelector('.login-backdrop');
    if (loginBackdrop) loginBackdrop.addEventListener('click', window.hideLoginModal);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const loginModal = document.getElementById('login-modal');
            if (loginModal && !loginModal.classList.contains('hidden')) {
                window.hideLoginModal();
            }
        }
    });

    /* Login submit */
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');
            const errorDiv = document.getElementById('loginError');
            const successDiv = document.getElementById('loginSuccess');
            const errorMessage = document.getElementById('loginErrorMessage');

            if (errorDiv) errorDiv.classList.add('hidden');
            if (successDiv) successDiv.classList.add('hidden');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa fa-spinner animate-spin mr-2"></i>Signing in...';
            }

            try {
                const data = await window.handleLogin(username, password);
                window.setAuthToken(data.token);

                if (successDiv) successDiv.classList.remove('hidden');

                setTimeout(function () {
                    window.hideLoginModal();
                    window.customAlert(
                        'You are now logged in and can manage programs.',
                        'Welcome back!',
                        { tone: 'success', icon: 'fa-check-circle' }
                    );
                }, 900);
            } catch (error) {
                if (errorMessage) {
                    errorMessage.textContent = error.message ||
                        'Please check your username and password and try again.';
                }
                if (errorDiv) errorDiv.classList.remove('hidden');

                const pw = document.getElementById('loginPassword');
                if (pw) {
                    pw.value = '';
                    pw.focus();
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa fa-sign-in-alt mr-2"></i>Sign In';
                }
            }
        });
    }

    /* Register modal dismissal + submit */
    const regClose = document.getElementById('register-modal-close-btn');
    if (regClose) regClose.addEventListener('click', window.hideRegisterModal);

    const regBackdrop = document.querySelector('.register-backdrop');
    if (regBackdrop) regBackdrop.addEventListener('click', window.hideRegisterModal);

    const toLogin = document.getElementById('backToLoginBtn');
    if (toLogin) toLogin.addEventListener('click', window.hideRegisterModal);

    const toRegister = document.getElementById('showRegisterBtn');
    if (toRegister) toRegister.addEventListener('click', window.showRegisterModal);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const regModal = document.getElementById('register-modal');
        if (regModal && !regModal.classList.contains('hidden')) {
            window.hideRegisterModal();
        }
    });

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const username = document.getElementById('registerUsername').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirm').value;
            const submitBtn = document.getElementById('registerSubmitBtn');
            const errorDiv = document.getElementById('registerError');
            const errorList = document.getElementById('registerErrorList');

            function showErrors(messages) {
                if (errorList) {
                    errorList.innerHTML = '';
                    messages.forEach(function (message) {
                        const li = document.createElement('li');
                        li.textContent = message;
                        errorList.appendChild(li);
                    });
                }
                if (errorDiv) errorDiv.classList.remove('hidden');
            }

            if (errorDiv) errorDiv.classList.add('hidden');

            if (password !== confirmPassword) {
                showErrors(['The two passwords do not match.']);
                document.getElementById('registerConfirm').focus();
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa fa-spinner animate-spin mr-2"></i>Creating account...';
            }

            try {
                const data = await window.handleRegister(username, password);
                window.setAuthToken(data.token);

                window.hideRegisterModal();
                window.customAlert(
                    'Your account is ready. You are signed in as ' +
                    (data.user && data.user.role === 'admin' ? 'an administrator.' : 'a standard user.') +
                    '\n\n' + (data.user && data.user.role === 'admin'
                        ? 'You can add, edit and remove programs.'
                        : 'Only administrators can change the schedule.'),
                    'Welcome, ' + (data.user ? data.user.username : username) + '!',
                    { tone: 'success', icon: 'fa-user-plus' }
                );
            } catch (error) {
                showErrors(error.fieldErrors && error.fieldErrors.length
                    ? error.fieldErrors
                    : [error.message]);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa fa-user-plus mr-2"></i>Create account';
                }
            }
        });
    }

    /* Current year in footer */
    const yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});
