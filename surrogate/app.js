var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var flow = require('finally');
var Promise = require('promise');

// var aws = require('aws-sdk');
// var multerS3 = require('multer-s3');
// aws.config.update({
// secretAccessKey: '4n/EzMX8nTcTOG3LQSCvwUzSGs2J+D+Vte7TY6tL',
// accessKeyId: 'AKIAJPACEPUSNEAEQOPA',
// region: 'ap-northeast-2'
// });
// var s3 = new aws.S3();

//----------------------------------------------------------------//

var dbPool = require('./src/db.js');
var redisPool = require('./src/caching.js');
var util = require('./src/util.js');
var config = require('./src/configs.js');
var monitoring = require('./src/monitoring.js');
var coord = require('./src/coord.js');

//----------------------------------------------------------------//

var redis = require('./routes/redis');
var redirector = require('./routes/redirector_recv');
var timeline = require('./routes/timeline');

//----------------------------------------------------------------//

var app = express();

//----------------------------------------------------------------//

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
//app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//----------------------------------------------------------------//

//app.use('/', routes);
//app.use('/users', users);
app.use('/redis', redis);
app.use('/redirector', redirector);
app.use('/timeline', timeline);

//----------------------------------------------------------------//

var init = function() {

    //monitoring 값 초기화
    monitoring.cacheHit = 0;
    monitoring.cacheMiss = 0;
    monitoring.traffic = 0;
    monitoring.readCount = 0;
    monitoring.writeCount = 0;

    /* db 에서 각 사용자에게 할당된 메모리 양 가지고 오기 */

    var MAX_MEMORY = config.totalMemory;
    var serverLocation;
    var result = [];
    var allUsersContents = [];
    var userLocations = [];

    var promise = new Promise(function(resolved, rejected){
      var redisIp;
      var thisServerIp = util.serverIp();
      if(thisServerIp == '165.132.104.210') {
          redisIp = '165.132.104.210';
      }
      else if (thisServerIp == '165.132.104.208') {
          redisIp = '165.132.104.193';
      }
      else if (thisServerIp == '165.132.104.193') {
          redisIp = '165.132.104.193';
      }
      else if (thisServerIp == '165.132.104.209') {
          redisIp = '165.132.104.209';
      }
      else {
          console.log("Wrong access IP!");
      }
      redisPool.connectClients(redisIp);
      resolved();
    });

    promise
    .then(function(result){
      return new Promise(function(resolved, rejected){
        //기존에 redis에 있던 내용들 다 지워버려야 함
        try {
          redisPool.flushMemory();
          resolved();
        } catch (e) {
          rejected("flush error!");
        }
      })
    }, function(err){
        console.log(err);
    })
    .then(function(result){
      return new Promise(function(resolved, rejected){
        //이때 현재 서버의 IP에 따라 어떤 테이블의 내용을 넣을지 결정해야한다.
        //예를들어, newyork에 있는 서버라면, newyork 테이블의 내용을 가져와야함.
        serverLocation = util.getServerLocation();
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    /**************************************************************************/
    /************************** social memory 초기화 ****************************/
    /**************************************************************************/
    .then(function(){
      return new Promise(function(resolved, rejected){
        //MySQL에 있는 각 지역(Newyork, Texas, Washington)의 UserId, FriendPortion에 관한 내용 Redis의 Social Memory에 올려야함.
        dbPool.getConnection(function(err, conn) {
            var query_stmt = 'SELECT * FROM ' + serverLocation;
            console.log(query_stmt);
            conn.query(query_stmt, function(err, rows) {
                conn.release(); //MySQL connection release
                if(err) {
                   rejected("DB err!");
                }
                for (var i=0; i<rows.length; i++) {
                    result.push({
                        userId : rows[i].userId,
                        friendPortion : rows[i].friendPortion
                    });
                }
                //conn.release(); //MySQL connection release
                resolved();
            })

            // conn.query(query_stmt, function(err, rows){});
            // query.on('error', function(err) {
            //     logger.error('Mysql query error: ' + err);
            //     callback(err, true);
            // });
            // query.on('result', function(rows) {
            //     callback(false, rows);
            // });
            // query.on('end', function() {
            //     connection.release();
            // });


        });
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        var setSocialMemoryInRedis = function(i, callback){
          if(i >= result.length){
            callback();
          } else {
            //key는 사용자 ID 이고, value는 전체 메모리 양 * portion
            var key = result[i].userId;
            var value = MAX_MEMORY * result[i].friendPortion;
            redisPool.socialMemory.set(key, value, function (err) {
                if(err) rejected("fail to initialize the social memory in Redis");
                //console.log("["+ i +"] key : " + key + ", value : " + value);
                setSocialMemoryInRedis(i+1, callback);
            });
          }
        }

        setSocialMemoryInRedis(0, function(){
          resolved();
        })
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("social memory ready");
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    /**************************************************************************/
    /************************** index memory 초기화 *****************************/
    /**************************************************************************/

    .then(function(){
      return new Promise(function(resolved, rejected){
        var getUsersContentsFromDB = function(i, callback){
          var userContents = {};

          if(i >= result.length){
            callback();

          } else {
            dbPool.getConnection(function(err, conn) {
              var userId = result[i].userId;
              userContents.userId = userId;

              var contentIdList = [];
              var query_stmt = 'SELECT A.contentId FROM timeline A ' +
                               'JOIN user B ' +
                               'ON A.uid = B.id ' +
                               'WHERE B.userId = "' + userId + '"';
              conn.query(query_stmt, function(err, rows) {
                conn.release(); //MySQL connection release
                if(err) rejected("DB err!");

                for (var j=0; j<rows.length; j++) {
                    contentIdList.push(rows[j].contentId);
                }

                if(rows.length != 0) {
                  userContents.contentIdList = contentIdList;
                  allUsersContents.push(userContents);
                }

                getUsersContentsFromDB(i+1, callback);
                //conn.release(); //MySQL connection release
              })
            });
          }
        }

        getUsersContentsFromDB(0, function(){
          resolved();
        })

      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        var setIndexMemoryInRedis = function(i, callback){
          if(i >= allUsersContents.length){
            callback();
          } else {
            var key = allUsersContents[i].userId;
            var contentList = allUsersContents[i].contentIdList;

            for(var j=0; j<contentList.length; j++){
              var setContentList = function(contentIndex){
                var value = contentList[contentIndex];
                redisPool.indexMemory.lpush(key,value, function (err) {
                    if(err) rejected("fail to set the index memory in Redis");
                });
              }(j);
            }
            setIndexMemoryInRedis(i+1, callback);
          }
        }

        setIndexMemoryInRedis(0, function(){
          resolved();
        })
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("index memory ready");
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    /**************************************************************************/
    /************************** User Location 초기화 ****************************/
    /**************************************************************************/
    .then(function(){
      return new Promise(function(resolved, rejected){
        dbPool.getConnection(function(err, conn) {
            var query_stmt = 'SELECT userId, userLocation FROM user';
            conn.query(query_stmt, function(err, rows) {
                conn.release(); //MySQL connection release
                if(err) {
                   rejected("DB err!");
                }
                for (var i=0; i<rows.length; i++) {
                    userLocations.push({
                        userId : rows[i].userId,
                        userLocation : rows[i].userLocation
                    });
                }
                //conn.release(); //MySQL connection release
                resolved();
            })
        });
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        var setUserLocationInRedis = function(i, callback){
          if(i >= userLocations.length){
            callback();
          } else {
            var key = userLocations[i].userId;
            var value = userLocations[i].userLocation;
            redisPool.locationMemory.set(key, value, function (err) {
                if(err) rejected("fail to initialize user location memory in Redis");
                //console.log("["+ i +"] key : " + key + ", value : " + value);
                setUserLocationInRedis(i+1, callback);
            });
          }
        }

        setUserLocationInRedis(0, function(){
          resolved();
        })
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("user location memory ready");
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    /**************************************************************************/
    /************************** coord information *****************************/
    /**************************************************************************/

    .then(function(){
      return new Promise(function(resolved, rejected){
        dbPool.getConnection(function(err, conn) {
            var query_stmt = 'SELECT * FROM coord';
            conn.query(query_stmt, function(err, rows) {
                conn.release(); //MySQL connection release
                if(err) {
                   rejected("DB err!");
                }
                for (var i=0; i<rows.length; i++) {
                    coord[rows[i].location] = {
                      lat : rows[i].lat,
                      lng : rows[i].lng
                    };
                }
                //conn.release(); //MySQL connection release
                resolved();
            })
        });
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("coord information ready");
        resolved();
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("surrogate server [" + serverLocation + "] is ready, completely.");
        resolved();
      })
    }, function(err){
        console.log(err);
    })
}();

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
