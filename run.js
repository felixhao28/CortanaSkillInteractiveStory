const f = require('./index');

var YAML = require('yamljs');

const detectiveStory = YAML.load('./detective.yml');

var req = {
  "session": {
    "sessionId": "testSessionId",
    "application": {
      "applicationId": "testApplicationId"
    },
    "attributes": {
    },
    "user": {
      "userId": "testUserId"
    }
  },
  "request": {
    "type": "IntentRequest",
    "requestId": "testRequestId",
    "locale": "en-US",
    "timestamp": "2016-11-25T12:00:00Z",
    "message": "",
    "intent": {
      "name": "HelloWorldIntent",
      "slots": {}
    }
  },
  "version": "1.0"
};

const vorpal = require('vorpal')();

function mainAction(command, callback) {
  var context = {
    log: s => {
      this.log(s)
    },
    done: (err, result) => {
      if (err) {
        this.log('Engine error:')
        this.log(err);
      } else {
        req.session.attributes = result.res.sessionAttributes;
        this.log('======================================');
        this.log('Title: ' + result.res.response.card.title);
        this.log('Speak: ' + result.res.response.outputSpeech.text);
        this.log('Display: ' + result.res.response.card.text);
      }
      if (callback && !result.res.response.shouldEndSession)
        callback();
    },
    bindings: {
      detectiveStory: detectiveStory
    }
  }
  if (command == 'start') {
    req.session.new = true;
    req.session.attributes = {};
    f(context, req);
  } else {
    req.session.new = false;
    req.request.message = command;
    f(context, req);
  }
}

vorpal
  .mode('repl')
  .delimiter('>')
  .action(mainAction);

vorpal
  .delimiter('CortanaSim')
  .show();

vorpal.execSync('repl');
vorpal.execSync('start');

