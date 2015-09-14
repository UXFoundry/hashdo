<% var inputCount = 0; -%>/** 
 * <%= cardName %>
 * <%= cardDescription %>
 * NB: This module and it's variables are cached (like a singleton).
 * 
 * @module <%= cardName %>
 */
module.exports = {
  name: '<%= cardName %>',
  description: '<%= cardDescription %>',
  icon: 'icon.png',
  clientStateSupport: <%= clientStateSupport %>,
  
  /**
   * Inputs required to generate and render this card.
   * These will also be displayed on #Do administration screens to assist users in providing the correct data to create a card.
   *
   * @property inputs
   * @type Object
   */
  inputs: {<% inputs.forEach(function (input) { inputCount++; -%>
    <%= input.camelCaseName %>: {<% if (input.example) {%><% if (isNaN(Number(input.example))) {%>      
      example: '<%= input.example %>',<% } else {%>
      example: <%= input.example %>,<% } } %>
      label: '<%- input.name %>',
      description: '<%- input.description %>',
      required: <%= input.required || false %>,
      secure: <%= input.secure || false %>,
      prompt: <%= input.prompt || false %>
    }<% if (inputCount < inputs.length) {-%>,<% } }); %>
  },

  /**
   * Generate or restore view model for template based on inputs and current card state.
   * Update any card state if necessary for subsequent calls to getCardData.
   * NB: 
   *
   * @method getCardData
   * @async
   * @param {Object}   inputs    Inputs provided by the application or the user.
   * @param {Object}   state     Saved state information about the card, empty object if no state is available.
   * @param {Function} callback  Callback function to signal that any async processing in this card is complete. function([error], [viewModel], [clientLocals])
   */
  getCardData: function (inputs, state, callback) {
    // Generate view model to render your view template.
    var viewModel = {
      link: state.link || 'https://hashdo.com/',  // 'link' is special property that makes you whole card launch the specified URL. 
      title: state.title || this.name            // 'title' is special and will set the document title in the browser.
    };
    
    // Alter the state object directly and it will be persisted.
    // Any changes you make will be available if this card is requested again with the same inputs.
    if (state.text || state.count) {
      // We found text, let's replace it with something else.
      state.count++;
      state.text = 'You have viewed this card ' + state.count + ' times.';
    }
    else {
      // No text found in the previous state, let's save it with a count.
      state.count = 0;
      state.text = 'This is a new demo card.';
    }
    
    // Set the text on the view to what is in the state, this can of course be anything you want.
    viewModel.text = state.text;
    viewModel.footer = '<%= cardName %> footer';
    
    // Make any async calls you need, just make sure you always execute the callback function.
    // If you want to throw an error, then create a new Error() and pass it in as the first argument of the callback.
    // EG: callback(new Error('Oops, something broke!'));
    <% if (clientStateSupport) {-%>
    var clientLocals = { clientSideMessage: 'This will appear in the console as an example of sending data to the client JS code.' };
    callback(null, viewModel, clientLocals);<% } else {%>callback(null, viewModel);<% } %>
  },

  /**
   * Optionally update card URL and state by POST'ing to https://hashdo.com/webhook/<%= packName %>/<%= cardName %>
   * If you have an external system that needs to call back to #Do after some time then a web hook is the right choice.
   *
   * @method webHook
   * @async
   * @param {Object}   payload   Deserialized JSON object of and POST data sent to the web hook, empty object if no payload was provided.
   * @param {Function} callback  Callback function to signal that any async processing in this card is complete. function([error], [urlParams], [state])
   */  
  webHook: function (payload, callback) {
    // Access payload properties that you POST'ed to the https://hashdo.com/webhook/<%= packName %>/<%= cardName %>
    // Callback with new URL params required to show the completed card and any state you want persisted.
    
    // By default don't do anything or remove this function if you don't need it.
    callback();
  }
};

