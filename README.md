# \#Do

\#Do is framework for creating stateful interaction cards that can be embedded in mobile applications or viewed in a browser.

This package is a combination of a CLI (command-line interface) to create packs and cards as well as web application that models how cards will be made available to users through the browser or native mobile application.

## Getting Started
#### Step 1
Install \#Do using NPM

`npm install hashdo -g`

You will now have a global CLI application that you launch with `hashdo`.

#### Step 2
Create a new card pack. A pack is a collection or category of cards. Grouping makes it easier for users to find cards types they are looking for.
 
`hashdo create pack`

This will launch the card pack template generator. Provide a pack name or just accept the defaults to generate the necessary package.

A card pack is also an NPM package so this is what you would publish to NPM.

#### Step 3
Create a new card.

`hashdo create card`

This will launch the card template generator. You can select the view engine and preprocessor you are most comfortable for development. A card will be added to the selected pack

#### Step 4
Launch the \#Do web application to test your new card.

A test harness is provided to easily enter values for your input fields and see how your card will be rendered.

`hashdo serve`

By default the web server port is 4000. If something on your system is already using this port, then provide an alternate port to the `serve` command.

`hashdo serve --port 8080`

## MongoDB
We recommend installing [MongoDB](https://www.mongodb.org/) for the best development experience. All card states will be persisted to a local Mongo database providing a good representation of how cards will work in production.

If Mongo is not installed then it will fallback to an in-memory database and states are lost whenever the application is relaunched.

## Client State Support
State support on the client is necessary if there is any user interaction on your card. This interaction will change the `state` which you can check and render differently the next time the card is requested.

Client state support is enabled on your card by adding `this.clientStateSupport = true` as a property on your card.

Let's use a rating card as an example.

```js
// In your card JS code.
getCardData: function (inputs, state, callback) {
  if (!state.rating) {
    // Create a view model that allows user interaction.
    var viewModel = {
      readonly: false
    };
  
    // Pass any values you want to be accessible from the client.
    var clientLocals = { 
      mySystemRatingId: inputs.ratingId
    };
  
    callback(null, viewModel, clientLocals);
  }
}
```

If there is no previous `state` the user has the opportunity to set the rating. This interaction needs to be saved as `state` on the client/browser.

```js
// In your client JS code (main.js).
card.onReady = function () {
  var $card = $('#' + locals.card.id);

  card.state.onChange = function (val) {
    if (val.cardId !== locals.card.id) {
      // Set anything you need on the client once the state is saved.
    }
  };
  
  // Save the state to your system, then save it to the card.
  $.post('http://myratingsystemapi.com/rate', {
    id: locals.mySystemRatingId,
    rating: rating
  },
  function (response) {
    if (response.status === 200) {
      // Will trigger the card onChange event.
      card.state.save({
        rating: rating
      });
    }
  });
}
```

Next time the same card is requested, you can display it in read-only mode since there is already a rating and no need to load the client script.

```js
// In your card JS code.
getCardData: function (inputs, state, callback) {
  ...
  if (state.rating > 0) {
    // Use variables in the view model to generate you HTML from a template.
    var viewModel = {
      readonly: true
    };
  
    callback(null, viewModel);
  }
}
```

This simplistic example should give you a good idea of how the pieces fit together. Using this technique, a single card could have multiple views and states that it could be in. Instead of a simple one step rating, this could easily be converted into a full step-by-step survey.

## Web Hooks
The custom backend for your card may have a long running process or workflow that will eventually complete and need to update the card's state, this is where Web Hooks come in.

For example, if you used a card to order a pizza, at some point the card would be in a "order in progress" state. When the pizza is actually delivered, there needs to be a non-interactive call that updates the card state to display is complete.

The call to the web hook must be a `POST` to `https://domain/webhook/myPackName/myCardName/`. The `POST` can contain any custom JSON payload in the body which will be passed to your web hook function.

```js
webHook: function (payload, callback) {
  if (payload.status === 'delivered') {
    callback(null,
      // URL parameters that would access this card. 
      { orderNumber: payload.orderNum },
      // New state to persist.
      { total: payload.address,
        status: 'paid and delivered'
      });
  }
  else {
    callback();
  }
}
```

## CSS
The design and layout principles of a card are important to deliver the intended content to the user. Cards should be designed in such a way that they display important information and it should be immediately obvious how to interact with it.

Built-in default style classes are made available to quickly create great looking cards.

##### .hdc-list
Apply this class to containers that have lists.
##### .hdc-link
Apply this class to any custom anchor tags.
##### .hdc-inner
Inner/center content. Text content should be placed inside `<p>` tags here.
##### .hdc-hdr
Card header styles.
##### .hdc-footer
Card footer styles.
##### .hdc-animated
Apply to elements that need to be animated.
##### .hdc-pulse
Pulse animation, useful to attract attention to input or interactions.

#### Custom CSS
To avoid conflicts with other CSS on the page, any custom CSS should be applied at the highest level in your HTML content. A good practice is to use your pack and card name as top-level class names to easily create a selector that will only apply to your card content.

##### Example
```html
<div class="hdc myPackName myCardName">
  <div class="hdc-hdr">
    <div class="hdc-title">Header text...</div>
  </div>
  <div class="hdc-content">
    <div class="hdc-inner">
      Your awesome card content!
    </div>
  </div>
  <div class="hdc-footer">
    <p>Footer text...</p>
  </div>  
</div>
```

You can now prefix `.myPackName.myCardName` too all your custom selectors and be quite confident that you won't have any conflicts. 

You are of course free to design your card in any way you see fit. Draw inspiration from [Google's card guidelines](https://www.google.com/design/spec/components/cards.html) and get started created your own unique cards.

## License
Copyright 2015 (c). All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you
may not use this file except in compliance with the License. You may
obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing permissions
and limitations under the License.