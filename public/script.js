
  let dialogResolveFunction;

  function customConfirm(textB="Are you sure you want to proceed?",textH="Confirm") {
    // Display the dialog
    $('#textH').text(textH)
    $('#textB').text(textB)
    $('#btnClo').text('No')
    $('#btnAcc').text('Yes')
    $('#custom-dialog-box').modal('show');
    // $('#custom-dialog-box').modal({backdrop: 'static', keyboard: false}, 'show');
    return new Promise(resolve => {
      dialogResolveFunction = resolve;
    });
  }

  function customAlert(textB, textH="Alert!"){
    // Display the dialog
    $('#textH').text(textH)
    $('#textB').text(textB)
    $('#btnClo').text('Close')
    $('#btnAcc').text('Okay')
    $('#custom-dialog-box').modal('show');
    return new Promise(resolve => {
      dialogResolveFunction = resolve;
    });
  }

  function resolveDialogPromise(value) {
    // Resolve the promise with the provided value
    dialogResolveFunction(value);
    hideCustomDialog();
  }

  function hideCustomDialog() {
    // Hide the dialog
    $('#custom-dialog-box').modal('hide');

  }
  $(document).ready(function () {
    $('#custom-dialog-box').modal({
           backdrop: 'static',
           keyboard: false
    })
   });