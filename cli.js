var Cli = module.exports,
  Spawn = require('cross-spawn-async'),
  Path = require('path'),
  Program = require('commander'),
  Open = require('open'),
  YeomanEnv = require('yeoman-environment').createEnv(),
  _ = require('lodash');

Cli.run = function (processArgv) {
  
  function printLogo() {
    console.log('     __ __     ____         ');
    console.log('  __/ // /_   / __ \\  ____ ');
    console.log(' /_  _  __/  / / / / / __ \\');
    console.log('/_  _  __/  / /_/ / / /_/ / ');
    console.log(' /_//_/    /_____/  \\____/ ');
    console.log('');
  }

  Program
    .command('serve')
    .description('Starts web server to render and test #Do cards.')
    .option('-p, --port <port>', 'Use an alternate port for the web server (defaults to 4000).', parseInt)
    .action(function(options) {
      printLogo();
      
      var port = options.port || 4000;
      var env = Object.create(process.env);
            
      env.NODE_ENV = 'development';
      env.NODE_PATH=Path.join(__dirname, 'node_modules');
      env.PORT = port;
      env.CARDS_DIRECTORY = process.cwd();
                        
      var webServer = Spawn('node', ['app.js'], { 
        cwd: __dirname, 
        env: env
      });
      
      webServer.stderr.on('data', function (data) {
        console.error(data.toString());
      });
      
      webServer.stdout.on('data', function (data) {
        var output = _.trim(data.toString());
        
        console.log(output);
        
        // Bit hacky but this will do for now.
        if (output === 'Let\'s #Do') {
          Open('http://localhost:' + port);
        }
      });
    });
    
  Program
    .command('create <template>')
    .description('Creates a new #Do pack or adds a new card using a template generator.')
    .action(function(template) {
      YeomanEnv.register(Path.join(__dirname, 'yeoman/generator-hashdo/generators/app'), 'hashdo:pack');
      YeomanEnv.register(Path.join(__dirname, 'yeoman/generator-hashdo/generators/card'), 'hashdo:card');
      
      printLogo();
      
      if (template.toLowerCase() === 'pack') {
        YeomanEnv.run('hashdo:pack', { hideGreeting: true });
      }
      else if (template.toLowerCase() === 'card') {
        YeomanEnv.run('hashdo:card', { hideGreeting: true });
      }
      else {
        console.error('Oops! "%s" is an invalid template type.', template);
        console.error('  pack: Create a new pack (collection) of cards.');
        console.error('  card: Create a new card and add it to an existing pack.');
      }      
    });
  
  Program.parse(processArgv);
  
  // Display help by default if nothing passed in.
  if (!process.argv.slice(2).length) {
    Program.outputHelp();
  }
};
