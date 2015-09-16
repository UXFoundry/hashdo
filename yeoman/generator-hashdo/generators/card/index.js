'use strict';
var Yeoman = require('yeoman-generator'),
  FS = require('fs'),
  Path = require('path'),
  _ = require('lodash');
  
module.exports = Yeoman.generators.Base.extend({
  constructor: function () {
    Yeoman.generators.Base.apply(this, arguments);
    
    this.option('hideGreeting', { type: Boolean, defaults: false, hide: true });
  },
  
  prompting: function () {
    var done = this.async();
    var inputs = [];

    // Have Yeoman greet the user.
    if (!this.options.hideGreeting) {      
      var Chalk = require('chalk'),
        YoSay = require('yosay');

      this.log(YoSay('Welcome to the top-notch ' + Chalk.red('#Do Card') + ' generator!'));
    }
    
    // Get pack directories.
    var packNames = [];
    FS.readdirSync(process.cwd()).forEach(function (dir) {
      var packagePath = Path.join(process.cwd(), dir, 'package.json');
      
      try {
        FS.statSync(packagePath);
        packNames.push(require(packagePath).pack.friendlyName);
      }
      catch (err) {}
    });
    
    if (packNames.length === 0) {
      throw new Error('No pack directories found, please add a card pack first before trying to add a card.');
    }
    
    // General card questions. 
    var questions = [{
      type: 'list',
      name: 'packName',
      message: 'Which pack does this card belong to?',
      choices: packNames
    }, {
      type: 'input',
      name: 'cardName',
      message: 'What is the name of your card?',
      default: 'Demo Card'
    }, {
      type: 'input',
      name: 'cardDescription',
      message: 'Please provide a description for this card',
      filter: function (value) { return value.replace(/'/g, '\\\'') },
      default: 'Demonstrates the functionality of a #Do card.'
    }, {
      type: 'list',
      name: 'template',
      message: 'What is your preferred template engine for your card views',
      choices: [
        'Jade',
        'Handlebars',
        'None (HTML)'
      ],
      default: 0,
      store: true
    }, {
      type: 'list',
      name: 'style',
      message: 'What is your preferred formatting language card styles',
      choices: [
        'LESS',
        'SCSS',
        'None (CSS)'
      ],
      default: 0,
      store: true
    }, {
      type: 'confirm',
      name: 'clientStateSupport',
      message: 'Does this card need to perform actions such as saving state in the browser?',
      default: false
    }, {
      type: 'confirm',
      name: 'haveInputs',
      message: 'Do you have any inputs required to render your card (such as external user input fields)?',
      default: true
    }];
    
    // Input field questions.
    var inputQuestions = [{
      type: 'list',
      name: 'name',
      message: 'Use any of the built-in inputs provided by #Do or choose "Custom" to create your own',
      choices: ['Custom', 'First Name', 'Last Name', 'Email', 'Latitude', 'Longitude', 'User ID', 'Cell', 'Bio', 'Twitter', 'Website', 'App ID', 'Request ID'],
      default: 0
    }, {
      type: 'input',
      name: 'customName',
      message: 'What is the custom input name?',
      validate: function (value) {
        if (value.length === 0) {
          return false;
        }
        
        if (_.find(inputs, { name: value }, 'name')) {
          return 'Input name already exists.';
        }
        
        return true;
      },
      when: function (answers) { return answers.name === 'Custom'; }
    }, {
      type: 'input',
      name: 'description',
      message: 'Please provide a description for this input',
      filter: function (value) { return value.replace(/'/g, '\\\'') },
      validate: function (value) { return value.length > 0; },
      when: function (answers) { return answers.name === 'Custom'; }      
    }, {
      type: 'confirm',
      name: 'required',
      message: 'Is this input field required?',
      default: true,
      when: function (answers) { return answers.name === 'Custom'; }
    }, {
      type: 'confirm',
      name: 'secure',
      message: 'Is this input field senstive and needs to be protected (API keys, passwords etc.)?',
      default: false,
      when: function (answers) { return answers.name === 'Custom'; }
    }, {
      type: 'confirm',
      name: 'prompt',
      message: 'Should the user be prompted to enter a value for this input?',
      default: false,
      when: function (answers) { return answers.name === 'Custom'; }
    }, {
      type: 'input',
      name: 'example',
      message: 'Please provide an optional example value for this input',
      when: function (answers) { return answers.name === 'Custom'; }
    }, {
      type: 'confirm',
      name: 'moreInputs',
      message: 'Do you have more inputs to you want to enter?',
      default: true
    }];
    
    var askForInputs = function () {      
      console.log();  // Separate question blocks.
      
      this.prompt(inputQuestions, function (answers) {
        // If it's a built-in input, augment the details onto it before adding.
        if (answers.name !== 'Custom') {
          this._augmentBuiltInAnswer(answers);
        }
         
        answers.name = answers.customName || answers.name;
        answers.camelCaseName = _.camelCase(answers.name);
        inputs.push(answers);
        
        if (answers.moreInputs) {
          delete answers.moreInputs;
          askForInputs();
        }
        else {
          this.answers.inputs = inputs;
          
          done();
        }
      }.bind(this));
    }.bind(this);

    this.prompt(questions, function (answers) {
      // Store the standard answers and make some new modified props.      
      this.answers = answers;
      this.answers.camelCaseCardName = _.camelCase(answers.cardName);
      this.answers.camelCasePackName = _.camelCase(answers.packName);
      
      this.rootPath = 'hashdo-' + this.answers.camelCasePackName;
      this.publicPath = this.rootPath + '/public/' + this.answers.camelCaseCardName;
      
      this.answers.inputs = [];
      
      if (answers.haveInputs) {
        askForInputs();
      }
      else {
        done(); 
      }
    }.bind(this));
  },

  writing: {
    packageJson: function () {
      var Package = require(this.destinationPath(this.rootPath + '/package.json'));
      
      if (Package.pack.cards.indexOf(this.answers.camelCaseCardName) === -1) {
        Package.pack.cards.push(this.answers.camelCaseCardName);
        this.fs.writeJSON(this.destinationPath(this.rootPath + '/package.json'), Package);
      }     
    },
    
    icon: function () {
      this.fs.copy(
        this.templatePath('public/_card/_icon.png'),
        this.destinationPath(this.publicPath + '/icon.png')
      );
    },
    
    cardJs: function () {
      this.fs.copyTpl(
        this.templatePath('_card.js'),
        this.destinationPath(this.rootPath + '/' + this.answers.camelCaseCardName + '.js'),
        this.answers
      );
    },
    
    jade: function () {
      if (this.answers.template === 'Jade') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.jade'),
          this.destinationPath(this.publicPath + '/main.jade'),
          this.answers
        );
      }
    },
    
    handlebars: function () {
      if (this.answers.template === 'Handlebars') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_content.hbs'),
          this.destinationPath(this.publicPath + '/content.hbs'),
          this.answers
        );
        
        this.fs.copyTpl(
          this.templatePath('public/_card/_header.hbs'),
          this.destinationPath(this.publicPath + '/header.hbs'),
          this.answers
        );
        
        this.fs.copyTpl(
          this.templatePath('public/_card/_footer.hbs'),
          this.destinationPath(this.publicPath + '/footer.hbs'),
          this.answers
        );
      }
    },
    
    html: function () {
      if (this.answers.template === 'None (HTML)') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.html'),
          this.destinationPath(this.publicPath + '/main.html'),
          this.answers
        );
      }
    },
    
    sass: function () {
      if (this.answers.style === 'SCSS') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.scss'),
          this.destinationPath(this.publicPath + '/main.scss'),
          this.answers
        );
      }
    },
    
    less: function () {
      if (this.answers.style === 'LESS') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.less'),
          this.destinationPath(this.publicPath + '/main.less'),
          this.answers
        );
      }
    },
    
    css: function () {
      if (this.answers.style === 'None (CSS)') {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.css'),
          this.destinationPath(this.publicPath + '/main.css'),
          this.answers
        );
      }
    },
    
    javascript: function () {
      if (this.answers.clientStateSupport) {
        this.fs.copyTpl(
          this.templatePath('public/_card/_main.js'),
          this.destinationPath(this.publicPath + '/main.js'),
          this.answers
        );
      }
    }
  },
  
  _augmentBuiltInAnswer: function(answer) {
    if (answer.name === 'First Name') {
      answer.example = 'Joe';
      answer.description = 'The current user\\\'s first name.';
    }
    else if (answer.name === 'Last Name') {
      answer.example = 'Public';
      answer.description = 'The current user\\\'s last name.';
    }
    else if (answer.name === 'Email') {
      answer.example = 'jo.public@email.com';
      answer.description = 'The current user\\\'s email address.';
    }
    else if (answer.name === 'Latitude') {
      answer.example = 37.422256;
      answer.description = 'A valid latitude (detected from the device if possible).';
      answer.required = true;
    }
    else if (answer.name === 'Longitude') {
      answer.example = -122.083859;
      answer.description = 'A valid longitude (detected from the device if possible).';
      answer.required = true;
    }
    else if (answer.name === 'User ID') {
      answer.example =  '552fa62425186c6012edcf18';
      answer.description = 'The current user\\\'s ID.';
      answer.required = true;
    }
    else if (answer.name === 'Cell') {
      answer.example =  '0741234567';
      answer.description = 'The current user\\\'s celluar/mobile number.';
    }
    else if (answer.name === 'Bio') {
      answer.example =  'My name is Joe Public, nice to meet you.';
      answer.description = 'The current user\\\'s bio information.';
    }
    else if (answer.name === 'Twitter') {
      answer.example =  '@JoePublicOnHashDo';
      answer.description = 'The current user\\\'s Twitter account handle.';
    }
    else if (answer.name === 'Website') {
      answer.example =  'https://hashdo.com/';
      answer.description = 'The current user\\\'s website information.';
    }    
    else if (answer.name === 'App ID') {
      answer.example = '552fa62425186c6012edcf18';
      answer.description = 'A valid hosting App ID.';
      answer.secure = true;
      answer.required = true;
    }    
    else if (answer.name === 'Request ID') {
      answer.example = '552fa62425186c6012edcf18';
      answer.description = 'The current request\\\'s ID.';
      answer.required = true;
    }
  }
});
