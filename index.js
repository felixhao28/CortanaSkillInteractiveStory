// A simple "Hello World" Azure Function for Cortana Skills.

// Usage: // User speaks: "Hey Cortana, ask Hello World to say hello" // Skill replies: "Hello World!"

'use strict';

const levenshtein = (a, b) => {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let tmp,
    i,
    j,
    prev,
    val,
    row;
  // swap to save some memory O(min(a,b)) instead of O(a)
  if (a.length > b.length) {
    tmp = a
    a = b
    b = tmp
  }

  row = Array(a.length + 1)
  // init the row
  for (i = 0; i <= a.length; i++) {
    row[i] = i
  }

  // fill in the rest
  for (i = 1; i <= b.length; i++) {
    prev = i
    for (j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        val = row[j - 1] // match
      } else {
        val = Math.min(row[j - 1] + 1, // substitution
          Math.min(prev + 1, // insertion
            row[j] + 1)) // deletion
      }
      row[j - 1] = prev
      prev = val
    }
    row[a.length] = prev
  }
  return row[a.length]
}

function parseAction(s) {
  s = s.replace(/\$(?=[a-zA-Z_])/g, '_.$');
  if (s.startsWith('->')) {
    s = 'return ' + s.substring(2);
  } else if (s.startsWith('=>')) {
    s = s.substring(2);
  } else {
    return null;
  }
  return eval(`(function(_){${s}})`);
}

const helpResponse = {
  version: '1.0',
  sessionAttributes: {},
  response: {
    outputSpeech: {
      type: 'PlainText',
      text: 'Try Start Voice Adventure'
    },
    card: {
      type: "Standard",
      title: 'Welcome to Voice Adventure',
      text: 'Try Start Voice Adventure'
    },
    reprompt: {
      outputSpeech: {
        type: 'PlainText',
        text: "Sorry I didn't catch that."
      }
    },
    shouldEndSession: true
  }
};

function getErrorResponse(msg) {
  return {
    version: '1.0',
    sessionAttributes: {},
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: msg
      },
      card: {
        type: "Standard",
        title: 'Error',
        text: msg
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: "Sorry I didn't catch that."
        }
      },
      shouldEndSession: true
    }
  };
}

function getRepromptResponse(choices, data) {
  return {
    version: '1.0',
    sessionAttributes: data,
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Sorry but I am not sure what you mean. Can you try again with a more specific phrase?' + choices ? '\nYour choices are\n' + choices.map(c => c.text).join('\n') : ''
      },
      card: {
        type: "Standard",
        title: 'Sorry I didn\'t catch that...',
        text: '_Can you try again with a more specific phrase?' + choices ? '_\n_Your choices are:_\n' + choices.map(c => '__' + c.text + '__').join('\n') : ''
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: "Sorry I didn't catch that."
        }
      },
      shouldEndSession: false
    }
  };
}

function getStoryResponse(state, data) {
  var title = state.title;
  var speak = state.speak;
  var display = '__' + state.display + '__' + '\n';
  // filter choices by visible
  if (state.choices != null) {
    state.choices = state.choices.filter(choice => {
      if (choice.visible) {
        return parseAction(choice.visible)(data);
      }
      return true;
    })
    for (var choice of state.choices) {
      display += '_' + choice.text + '_\n';
    }
  }
  var shouldEndSession = state.choices == null || state.choices.length === 0;

  // Format JSON response    
  return {
    version: '1.0',
    sessionAttributes: data,
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: speak
      },
      card: {
        type: "Standard",
        title: title,
        text: display
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: "Sorry I didn't catch that."
        }
      },
      shouldEndSession: shouldEndSession
    }
  };
}

// Export the function to handle the incoming request.
module.exports = function(context, req) {
  const story = context.bindings.inputBlob;
  try {
    // The JSON request from Cortana is in req.Request
    //
    // The 'type' element of the request specifies the type of the request.
    // Currently three types: 
    //   - IntentRequest given when a request is due to user conversation
    //   - LaunchRequest given when a skill is opened without a specific intent 
    //   - SessionEndedRequest given when a conversation between Cortana and the user is ending
    // context.log(`HelloWorld ${req.request.type}: sessionId=${req.session.sessionId}, requestId=${req.request.requestId}`);
    var data = req.session.attributes || {};
    if (req.request.type === 'SessionEndedRequest') {
      context.done();
    } else {
      let response = null;
      if (data.stateName == null) {
        // first time
        if (req.session.new || req.request.type === 'LaunchRequest') {
          data.stateName = "Introduction";
        } else {
          response = helpResponse;
        }
      } else {
        // handle state transition
        var text = req.request.message.toLowerCase();
        var state = story[data.stateName];
        if (state == null) {
          response = getErrorResponse('bad state name: ' + data.stateName);
        } else if (state.choices != null && state.choices.length > 0) {
          var maxScore = -1;
          var bestChoice = null;
          for (var choice of state.choices) {
            var distance = levenshtein(choice.text.toLowerCase(), text);
            var score = choice.text.length - distance;
            // context.log(`Comparing choice: ${choice.text}, score=${score}`);
            if (maxScore < score) {
              maxScore = score;
              bestChoice = choice;
            }
          }
          context.log(`bestChoice=${bestChoice.text}, maxScore=${maxScore}`);
          if (bestChoice != null && maxScore >= bestChoice.text.length / 4) {
            var nextState = parseAction(bestChoice.nextState);
            if (nextState != null) {
              data.stateName = nextState(data);
            } else {
              data.stateName = bestChoice.nextState;
            }
            // do choice action
            if (bestChoice.action) {
              context.log('Executing choice action: ' + bestChoice.action);
              parseAction(bestChoice.action)(data);
            }
          } else {
            response = getRepromptResponse(state.choices, data);
          }
        } else {
          response = getErrorResponse('the story already ended');
        }
      }

      // main logic
      if (response == null) {
        if (story[data.stateName] == null) {
          response = getErrorResponse('bad state name: ' + data.stateName);
        } else {
          var state = story[data.stateName];
          // do state action
          if (state.action) {
            context.log('Executing state action: ' + state.action);
            parseAction(state.action)(data);
          }
          response = getStoryResponse(state, data);
          context.log(JSON.stringify(data));
        }
      }
      // End the function, sending back response
      context.done(null, {
        res: response
      });
    }

  } catch (e) {
    context.done('Exception: ' + e + '\n' + e.stack);
  }
}