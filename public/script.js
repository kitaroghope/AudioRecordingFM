// Dialog functions - consolidated
window.dialogResolveFunction = null;

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
