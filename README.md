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
Full API documentation coming soon...

## Plugins
[MongoDB Plugin](https://github.com/UXFoundry/hashdo-db-mongo)
[Keen IO Analytics Plugin](https://github.com/UXFoundry/hashdo-analytics-keen)


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