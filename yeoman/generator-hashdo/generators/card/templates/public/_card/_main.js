// To enable this script to load in the browser, ensure that the 'clientStateSupport' property is enabled in the card JS file.
card.onReady = function () {
  var $card = $('#' + locals.card.id);
  
  if (locals.clientSideMessage) {
    console.log('*** ' + locals.clientSideMessage + ' ***');
  }

  // Subscribe to any state changes.
  card.state.onChange = function (val) {
    console.log('State changed.', val);
  };

  // Regular Zepto style events.
  $card.on('click', function () {
    console.log('Card clicked.');
    
    // Zepto selectors available.
    $('#text-content').text('Clicked the card, new text state saved from client.');
    
    // How to save state from the client.
    card.state.save({
      text: $('#text-content').text()
    },
      function (err) {
        console.log('Do something on success or error.');
      }
    );
  });
};
