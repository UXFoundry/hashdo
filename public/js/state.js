/* global $, Firebase, card, locals, getScript, firebaseUrl, baseUrl */

card.state = {
  onChange: function (val) {}
};

if (typeof Firebase === 'undefined') {
  card.require('https://cdn.firebase.com/js/client/2.2.9/firebase.js', function () {
    if (typeof Firebase !== 'undefined') {
      subscribe();
    }
  });
}
else {
  subscribe();
}

function subscribe() {
  card.fb = new Firebase(firebaseUrl + '/card/' + locals.card.key);

  if (card.fb) {
    card.fb.on('value', function (snapshot) {
      var val = snapshot.val();

      if (val !== null) {
        card.state.onChange && card.state.onChange(snapshot.val());
      }
    });
  }
}

card.state.save = function (val, callback) {
  if (val) {
    $.post(baseUrl + '/api/card/state/save',
      {
        cardKey: locals.card.key,
        apiKey: locals.card.apiKey,
        state: JSON.stringify(val)
      },
      function (response) {
        if (response.error) {
          callback && callback(response.message);
        }
        else {
          // trigger event
          $('#' + locals.card.id).trigger('hdc:state', {
            pack: locals.card.pack,
            card: locals.card.name,
            state: val
          });

          // broadcast
          if (card.fb) {
            val.cardId = locals.card.id;
            card.fb.set(val);
          }

          // done
          callback && callback();
        }
      }
    );
  }
  else {
    callback && callback();
  }
};
