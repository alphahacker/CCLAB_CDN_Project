var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var flow = require('finally');
var Promise = require('promise');

var dbPool = require('./src/db.js');
var util = require('./src/util.js');
var config = require('./src/configs.js');
var monitoring = require('./src/monitoring.js');
var coord = require('./src/coord.js');

//----------------------------------------------------------------//

var dbcp = require('./routes/dbcp');
//var redis = require('./routes/redis');
//var redirector = require('./routes/redirector_recv');
//var timeline = require('./routes/timeline');

//----------------------------------------------------------------//

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//----------------------------------------------------------------//

app.use('/dbcp', dbcp);
//app.use('/redis', redis);
//app.use('/redirector', redirector);
//app.use('/timeline', timeline);

//----------------------------------------------------------------//

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

//----------------------------------------------------------------//

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

//----------------------------------------------------------------//

module.exports = app;
