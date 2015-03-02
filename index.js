'use strict';
// Config
var timeout = 5000; // ms
var paralell = 20;

// Requirements
var fs = require('fs');
var events = require('events');
var path = require('path');

// NPM Requirements
var request = require('request');

// Globals
var ee = new events.EventEmitter();
var createdDirs = [];
var filesArray = [];
var outDir = '';

var counter = {
  // Keep track of things
  count: 0,
  complete: 0,
  errors: 0,
  log: [],
  request: function (filename) {
    this.count ++;
    this.log.push({type: 'request', filename: filename});
    ee.emit('count');
  },
  response: function (filename) {
    this.complete ++;
    this.log.push({type: 'response', filename: filename});
    ee.emit('count');
  },
  error: function (filename) {
    this.errors ++;
    this.log.push({type: 'error', filename: filename});
    ee.emit('count');
  },
  active: function () {
    return this.count - (this.complete + this.errors);
  },
  batch: 0,
  batchUp: function () {
    this.batch ++;
  },
  timer: {
    start: function () {
      this.startTime = new Date().getTime();
    },
    elapsed: function () {
      this.currentTime = new Date().getTime();
      return (this.currentTime - this.startTime) / 1000;
    }
  }
};

counter.timer.start();

// Converts tsv to JSON
var tsvJSON = function (tsv, headers) {
  var lines = tsv.split('\n');
  var headers = headers || lines[0].split('\t');

  var obj = {};
  var currentLine = [];
  for (var i = 0; i < lines.length - 2; i++) {
    currentLine = lines[i].split('\t');

    filesArray.push({
      'filename': currentLine[0],
      'url': currentLine[1]
    });
  }
  ee.emit('count');
};

// gets the next file, triggered by the counter event
var getNextBatch = function(){
  console.log('Active: ' + counter.active());
  console.log('Started: ' + counter.count + ', Complete: ' + counter.complete + ', Errors: ' + counter.errors + ' Time: ' + counter.timer.elapsed() + 's');
  if (counter.active() < paralell) {
    var item = filesArray.shift();
    if (item) {
      getSaveFile(item);
    }
  }
};

// Requests URL and saves the file
var getSaveFile = function (params) {
  if (!params) {
    console.log('cant get undefined');
    return;
  }
  console.log('Requesting: ' + params.filename +'.jpg' + '\tfrom: ' + params.url);
  counter.request(params.filename);
  request
    .get({
      url: params.url,
      timeout: timeout
    })
    .on('response', function (resp) {
      if (resp.statusCode === 200 && resp.headers['content-type'] === 'image/jpeg') {
        saveResp(resp, params);
      } else {
        console.log(JSON.stringify({
          'Error': 'Could not download',
          'file': params,
          'statusCode': resp.statusCode,
          'content-type': resp.headers['content-type'],
        }, 0, 2));
        counter.error(params.filename);
      }
    })
    .on('error', function (err) {
      console.log(JSON.stringify({
          'Error': err,
          'file': params
        }, 0 , 2));
      counter.error(params.filename);
    });
};

// Saves a HTTP response to disk
var saveResp = function (resp, params) {
  // Check and create dir if necessary
  var dirName = params.filename.substring(0,9);
  if (createdDirs.indexOf(dirName) === -1) {
    try {
      createdDirs.push(dirName);
      fs.mkdirSync(path.join(outDir, dirName));
    } catch (e) {
      console.log('Error: ' + e);
    }
  }
  // writestream
  var wstream = fs
    .createWriteStream(path.join(outDir, dirName, params.filename + '.jpg'))
    .on('error', function (err) {
      console.log('ERROR: ' + err);
      resp.read();
    })
    .on('finish', function () {
      counter.response();
    });
  resp.pipe(wstream);
};

module.exports.executeTask = function (inFile, out, callback) {
  outDir = out; // set outDir global
  var file = inFile || './head100.txt'; // for testing
  counter.timer.start();
  // Read the file
  fs.readFile(file, 'utf8', function (err, data) {
    if (err) {throw err;}
    var headers = ['filename', 'url'];
    tsvJSON(data, headers);
  });

  var checkDone = function () {
    if (counter.count > 0 && counter.active() < 1) {
        console.log('Done');
        callback();
    }
  };
  ee.on('count', checkDone);
};

ee.on('count', getNextBatch);
