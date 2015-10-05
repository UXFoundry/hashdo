# \#Do

\#Do is framework for creating static or stateful interaction based cards that can be embedded in mobile applications or viewed in a browser.
This is the base library that can be used in your own projects to generate, embed or serve [\#Do cards](https://github.com/UXFoundry/hashdo-cards).

If you are looking for a way to create cards, get your hands on the [\#Do CLI](https://github.com/UXFoundry/hashdo-cli) which contains templates to quickly generate packs and cards as well as a test harness to easily test your card functionality.

## Getting Started
#### Step 1
Install \#Do into your project using NPM.

`npm install hashdo --save`

#### Step 2
Require it in your code.

`var hashdo = require('hashdo');`

#### Step 3
Generate the HTML, CSS and script necessary to render your card.

```js
hashdo.card.generateCard({
  url: 'http://hashdo.com/restaurants/nearby',
  directory: '/Where/Your/Cards/Are/Located',
  packName: 'restaurants',
  cardName: 'nearby',
  inputValues: {
    latitude: -29.837795,
    longitude: 30.922539
  }
},
// Callback containing an error or the HTML you can render.
function (err, html) {
  if (!err) {
    // Do something with the HTML.
    console.log(html);
  }
  else {
    console.error(err);    
  }
});
```

Check out our [open source \#Do cards](https://github.com/UXFoundry/hashdo-cards) to test things out with or use the [\#Do CLI](https://github.com/UXFoundry/hashdo-cli) to create your own.

## API
#### Packs
The packs module is accessible through `hashdo.packs`. This modules contains information about the packs and cards available.

#### Cards
The card module is accessible through `hashdo.card`. This module is used to secure inputs, generated card HTML and also perform the logic necessary for a web hook call.

## Environment Variables

#### CARD_SECRET
Provide a value for this if you want to properly secure the URL and query parameters of a card.

#### LOCK_KEY
Provide a value for this if you want to properly secure input data in the database when using 'secureInputs'.

#### BASE_URL
Required if making use of client state. This will be the URL that cards will make HTTP calls to.

#### FIREBASE_URL
Use [Firebase](https://www.firebase.com/) to update card state on the client when it changes. Without this the card will need to be refreshed manually to update it's client data.

## Plugins
Modules can be replaced by your own implementations if necessary. Good examples of this are the data store or the analytics provider you wish to use.

The following plugins are available. If you have created your own plugins, let us know and we'll add links here.

#### Database
By default \#Do uses an in-memory database. Card states and locks are lost when the application unloads but this is actually great for development and testing purposes.

[MongoDB Plugin](https://github.com/UXFoundry/hashdo-db-mongo) - Use this database plugin to persist your data to a [MongoDB](https://www.mongodb.org/) database.

#### Analytics
By default \#Do has no analytics implementation. When an event is triggered it will output the details to the console.

[Keen IO Analytics Plugin](https://github.com/UXFoundry/hashdo-analytics-keen) - Use this analytics plugin to send events to [Keen IO](https://keen.io/).

To use a plugin, simply replace the exposed property with a new implementation. Each plugin's documentation will describe the requirements and the process of replacing the functionality.

## View Engine Support
Currently \#Do supports the following view engines.

- [Jade](http://jade-lang.com/)
- [Handlebars](http://handlebarsjs.com/)

Any view engine that [Consolidate](https://github.com/tj/consolidate.js) supports can be added as well if necessary. Using a view engine is not a requirement, you are welcome to use regular HTML. 

## CSS Presprocessor Support
Currently \#Do supports the following CSS preprocessors.

- [SASS](http://lesscss.org/)
- [LESS](http://sass-lang.com/)

Using a preprocessor is not a requirement, you are welcome to use regular CSS.


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