// Dialog functions - consolidated
window.dialogResolveFunction = null;

// ============ AUTHENTICATION ============

window.isLoggedIn = function() {
    return !!localStorage.getItem('authToken');
};

window.setAuthToken = function(token) {
    localStorage.setItem('authToken', token);
    window.updateAuthUI();
};

window.clearAuthToken = function() {
    localStorage.removeItem('authToken');
    window.updateAuthUI();
};

window.updateAuthUI = function() {
    const isAuth = window.isLoggedIn();
    const authBtnText = document.getElementById('authBtnText');
    const authBtnMobileText = document.getElementById('authBtnMobileText');
    if (authBtnText) authBtnText.textContent = isAuth ? 'Logout' : 'Login';
    if (authBtnMobileText) authBtnMobileText.textContent = isAuth ? 'Logout' : 'Login';
};

window.getAuthHeaders = function() {
    const token = localStorage.getItem('authToken');
    if (token) {
        return { 'Authorization': 'Bearer ' + token };
    }
    return {};
};

window.showLoginModal = function() {
    const modal = document.getElementById('login-modal');
    const content = document.getElementById('login-modal-content');
    if (!modal || !content) {
        console.error('Login modal elements not found');
        return;
    }

    // Reset form
    const errorDiv = document.getElementById('loginError');
    const successDiv = document.getElementById('loginSuccess');
    const loginForm = document.getElementById('loginForm');

    if (errorDiv) errorDiv.classList.add('hidden');
    if (successDiv) successDiv.classList.add('hidden');
    if (loginForm) loginForm.reset();

    modal.classList.remove('hidden');
    setTimeout(function() {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.hideLoginModal = function() {
    const modal = document.getElementById('login-modal');
    const content = document.getElementById('login-modal-content');
    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(function() {
        modal.classList.add('hidden');
    }, 300);
};

window.handleLogin = async function(username, password) {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Invalid username or password');
        }

        return data;
    } catch (error) {
        throw error;
    }
};

window.handleLogout = function() {
    window.clearAuthToken();
    fetch('/logout', { method: 'POST' }).catch(() => {});
};

// Global click handler for auth button (used by onclick attribute)
window.handleAuthClick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Auth button clicked via onclick');

    if (window.isLoggedIn()) {
        window.handleLogout();
        window.customAlert('You have been logged out successfully.', 'Logged Out');
    } else {
        window.showLoginModal();
    }
};

// ============ INITIALIZE ON DOM LOAD ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing auth system...');

    window.updateAuthUI();

    // Use event delegation on the nav element for more reliable event handling
    const nav = document.querySelector('nav');
    if (nav) {
        nav.addEventListener('click', function(e) {
            // Handle auth button clicks
            const authBtn = e.target.closest('#authBtn');
            const authBtnMobile = e.target.closest('#authBtnMobile');

            if (authBtn || authBtnMobile) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Auth button clicked');

                if (window.isLoggedIn()) {
                    window.handleLogout();
                    window.customAlert('You have been logged out successfully.', 'Logged Out');
                } else {
                    window.showLoginModal();
                }
                return;
            }

            // Handle login modal close
            const loginModalClose = e.target.closest('#login-modal-close-btn');
            if (loginModalClose) {
                e.preventDefault();
                window.hideLoginModal();
                return;
            }

            // Handle login backdrop click
            const loginBackdrop = e.target.closest('.login-backdrop');
            if (loginBackdrop) {
                e.preventDefault();
                window.hideLoginModal();
                return;
            }
        });
    }

    // Login form submit
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Login form submitted');

            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');
            const errorDiv = document.getElementById('loginError');
            const successDiv = document.getElementById('loginSuccess');

            // Hide previous messages
            if (errorDiv) errorDiv.classList.add('hidden');
            if (successDiv) successDiv.classList.add('hidden');

            // Show loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa fa-spinner animate-spin mr-2"></i>Signing in...';
            }

            try {
                const data = await window.handleLogin(username, password);

                // Success!
                window.setAuthToken(data.token);
                if (successDiv) successDiv.classList.remove('hidden');

                // Auto close after 1.5 seconds
                setTimeout(function() {
                    window.hideLoginModal();
                    window.customAlert('You are now logged in and can manage programs!', 'Welcome!');
                }, 1500);

            } catch (error) {
                // Show error
                const errorTitle = document.getElementById('loginErrorTitle');
                const errorMessage = document.getElementById('loginErrorMessage');
                if (errorTitle) errorTitle.textContent = 'Login Failed';
                if (errorMessage) errorMessage.textContent = error.message || 'Please check your username and password and try again.';
                if (errorDiv) errorDiv.classList.remove('hidden');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa fa-sign-in-alt mr-2"></i>Sign In';
                }
            }
        });
    }

    console.log('Auth system initialized');
});

// ============ TIME FORMATTING ============

// Time formatting functions (client-side equivalents of server-side gT/gM)
window.gT = function(h) {
    var am;
    if (h == 0) {
        h = 12;
        am = "midnight";
    }
    else if (h > 12) {
        h = h - 12;
        am = "pm";
    }
    else if (h == 12) {
        h = 12;
        am = "noon";
    }
    else {
        am = "am";
    }
    return { h: h, am: am };
};

window.gM = function(m) {
    if (m < 10) {
        m = "0" + m;
    }
    return m;
};

window.customConfirm = function(textB, textH) {
  textB = textB || "Are you sure you want to proceed?";
  textH = textH || "Confirm";
  $('#textH').text(textH);
  $('#textB').text(textB);
  $('#btnClo').text('No');
  $('#btnAcc').text('Yes');
  var modal = document.getElementById('custom-dialog-box');
  var content = document.getElementById('modal-content');
  modal.classList.remove('hidden');
  setTimeout(function() {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  }, 10);
  return new Promise(function(resolve) {
    dialogResolveFunction = resolve;
  });
};

window.customAlert = function(textB, textH) {
  textB = textB || "";
  textH = textH || "Alert!";
  $('#textH').text(textH);
  $('#textB').text(textB);
  $('#btnClo').text('Close');
  $('#btnAcc').text('Okay');
  var modal = document.getElementById('custom-dialog-box');
  var content = document.getElementById('modal-content');
  modal.classList.remove('hidden');
  setTimeout(function() {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  }, 10);
  return new Promise(function(resolve) {
    dialogResolveFunction = resolve;
  });
};

window.hideCustomDialog = function() {
  var modal = document.getElementById('custom-dialog-box');
  var content = document.getElementById('modal-content');
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(function() {
    modal.classList.add('hidden');
  }, 300);
};

window.resolveDialogPromise = function(value) {
  if (dialogResolveFunction) {
    dialogResolveFunction(value);
  }
  hideCustomDialog();
};

// Delegated modal event listeners
document.addEventListener('click', function(e) {
  var modalBackdrop = e.target.closest('.modal-backdrop');
  if (modalBackdrop) {
    resolveDialogPromise(false);
    return;
  }

  var modalCloseBtn = e.target.closest('#modal-close-btn');
  if (modalCloseBtn) {
    resolveDialogPromise(false);
    return;
  }

  var modalNoBtn = e.target.closest('#modal-no-btn');
  if (modalNoBtn) {
    resolveDialogPromise(false);
    return;
  }

  var modalYesBtn = e.target.closest('#modal-yes-btn');
  if (modalYesBtn) {
    resolveDialogPromise(true);
    return;
  }
});
