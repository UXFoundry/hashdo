var FS = require('fs'),
  Path = require('path');

if (process.env.NODE_ENV !== 'production') {
  try {
    FS.statSync('.env');
  }
  catch (err) {
    FS.closeSync(FS.openSync('.env', 'w'));
  }
  
  require('dotenv').load();
}

var DB = require('./lib/db'),
  Express = require('express'),
  App = Express(),
  Favicon = require('serve-favicon'),
  BodyParser = require('body-parser'),
  Hpp = require('hpp'),

  APIController = require('./controllers/api'),
  DefaultController = require('./controllers/index'),
  PackController = require('./controllers/pack'),
  CardController = require('./controllers/card'),
  WebHookController = require('./controllers/webhook'),
  HarnessController = require('./controllers/harness'),
  Packs = require('./lib/packs'),
  Utils = require('./lib/utils'),
  
  JsonParser = BodyParser.json({
    strict: false
  });
  
var exit = function () {
  DB.disconnect(function () {
    process.exit(0);
  });
};

// Gracefully disconnect from the database on expected exit.
process.on('SIGINT', exit);
process.on('SIGTERM', exit);

// Global error handler (always exit for programmatic errors).
process.on('uncaughtException', function (err) {
  console.error('FATAL: ', err.message);
  console.error(err.stack);
  process.exit(1);
});

App.use(Favicon(__dirname + '/public/favicon.ico'));
App.use(Express.static('public'));
App.use(BodyParser.urlencoded({extended: false}));
App.use(Hpp());

// CORS support
App.all('*', function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Assume cards directory is based off root if a full path is not provided.
if (process.env.CARDS_DIRECTORY && !Path.isAbsolute(process.env.CARDS_DIRECTORY)) {
  process.env.CARDS_DIRECTORY = Path.join(process.cwd(), process.env.CARDS_DIRECTORY);
}

// Load up all the card packs
Packs.init();

// Make public card directories static
Packs.cards().forEach(function (card) {
  var packDirectory = (process.env.CARDS_DIRECTORY || (process.cwd() + '/cards')) + '/' + 'hashdo-' + card.pack;  
  App.use('/' + card.pack + '/' + card.card, Express.static(Path.join(packDirectory, 'public', card.card)));
  
  // Web Hook Test Routes
  if (process.env.NODE_ENV !== 'production') {
    var cardTestWebHook = Path.join(packDirectory, 'test', card.card, 'webhook.js');
    
    var testHookExists = false;
    try {
      // Use this because exists will be deprecated.
      FS.statSync(cardTestWebHook);
      testHookExists = true;      
    } catch (err) {}
    
    if (testHookExists) {
      App.get('/webhook/' + card.pack + '/' + card.card + '/test', require(cardTestWebHook).webhook);
    }
  }
});

// API Routes
App.get('/api/count', APIController.count);
App.get('/api/cards', APIController.cards);
App.get('/api/card', APIController.card);

App.post('/api/card/state/save', APIController.saveState);
App.post('/api/card/analytics', APIController.recordAnalyticEvents);

// Web Hooks
App.post('/webhook/:pack/:card', WebHookController.process);

// Test Harness
if (process.env.NODE_ENV !== 'production') {
  App.get('/:pack/:card/test', HarnessController.get);
}

// Card Routes
App.post('/:pack/:card', JsonParser, CardController.post);
App.get('/:pack/:card', CardController.get);

App.get('/:pack', PackController);
App.get('/', DefaultController);

// Connect to the database and start server on successful connection.
DB.connect(function (err) {
  if (err) {
    console.error('FATAL: Could not connect to database.', err);
    process.exit(1);
  }
  else {    
    var port = Utils.getPort();    
    console.log('APP: Starting web server on port %d...', port);
    App.listen(port, function () {
      console.log();
      console.log('Let\'s #Do');
    });
  }
});