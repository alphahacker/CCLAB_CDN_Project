var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var redis = require('redis');
var JSON = require('JSON');

var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");
var interim_log = log4js.getLogger("interim");

var dbPool = require('../src/db.js');
var redisPool = require('../src/caching.js');
var redirect = require('../src/redirector_send.js');
var memoryManager = require('../src/memoryManager.js');
var util = require('../src/util.js');
var monitoring = require('../src/monitoring.js');

var app = express();

//---------------------------------------------------------------------------//

router.get('/test', function(req, res, next) {
  console.log("process pid : " + process.pid);

  res.json({
    "status" : "complete"
  })

});

router.post('/test', function(req, res, next) {
  console.log("process pid : " + process.pid);
  console.log("req.body.test = " + req.body.test);
  res.json({
    "status" : "complete"
  })

});

router.get('/test2/:userId', function(req, res, next) {
  console.log("=============================");
  console.log("process pid = " + process.pid);
  console.log("user ID = " + req.params.userId);

  var key = req.params.userId;
  redisPool.socialMemory.get(key, function (err, result) {
      if(err) console.log("get social memory error!");
      console.log("social memory = " + result);
      console.log("=============================");

      res.json({
        "status" : "complete"
      })
  });

});

//Get each user's timeline contents
router.get('/:userId', function(req, res, next) {

  /* Read 할때 Cache hit 측정해줘야 한다. */

  //key는 사용자 ID
  //var key = req.params.userId;
  var userLocation;

  //데이터는 한번에 20개씩 가져오도록 한다.
  var start = 0;
  var end = 19;

  //index memory에 있는 contents list를 저장
  var contentIndexList = [];
  var contentDataList = [];

  var promise = new Promise(function(resolved, rejected){
    var key = req.params.userId;
    redisPool.indexMemory.lrange(key, start, end, function (err, result) {
        if(err){
          error_log.info("fail to get the index memory in Redis : " + err);
          error_log.info("key (req.params.userId) : " + key + ", start : " + start + ", end : " + end);
          error_log.info();
          rejected("fail to get the index memory in Redis");
        }
        contentIndexList = result;
        resolved(contentIndexList);
    });
  });

  promise
  .then(function(contentIndexList){
    return new Promise(function(resolved, rejected){
      var key = req.params.userId;
      redisPool.locationMemory.get(key, function (err, result) {
          if(err){
            error_log.info("fail to get user location from redis! : " + err);
            error_log.info("key (req.params.userId) : " + key);
            error_log.info();
            rejected("fail to get user location from redis! ");
          }
          if(result){
            userLocation = result;
            resolved(contentIndexList);
          } else {
            dbPool.getConnection(function(err, conn) {
              var query_stmt = 'SELECT userLocation FROM user ' +
                               'WHERE userId = ' + key;
              conn.query(query_stmt, function(err, result) {
                  if(err){
                    error_log.info("fail to get user location from MySQL! : " + err);
                    error_log.info("key (userId) : " + key + "\ㅜn");

                    conn.release(); //MySQL connection release
                    rejected("fail to get user location from MySQL!");
                  }
                  if(result == undefined || result == null){
                    error_log.info("fail to get user location from MySQL! : There is no result.");
                    error_log.info("key (userId) : " + key + "\ㅜn");

                    conn.release(); //MySQL connection release
                    rejected("fail to get user location from MySQL!");
                  } else {
                    userLocation = result[0].userLocation;
                    resolved(contentIndexList);
                    conn.release(); //MySQL connection release
                  }
              })
            });
          }
      });
    })
  }, function(err){
      console.log(err);
  })

  .then(function(contentIndexList){
    return new Promise(function(resolved, rejected){

      var readStartTime = 0;
      var readEndTime = 0;

      readStartTime = new Date().getTime();
      getUserContentData = function(i, callback){
        if(i >= contentIndexList.length){
          callback();
        } else {
          var key = contentIndexList[i];
          redisPool.dataMemory.get(key, function (err, result) {
              if(err){
                error_log.info("fail to push the content from data memory in redis! : " + err );
                error_log.info("key (contentIndexList[" + i + "] = " + contentIndexList[i] + ") : " + key);
                error_log.info();
                rejected("fail to push the content from data memory in redis! ");
              }
              if(result){
                contentDataList.push(result);
                //console.log("cache hit!");
                monitoring.cacheHit++;
                getUserContentData(i+1, callback);

              } else {
                dbPool.getConnection(function(err, conn) {
                  var query_stmt = 'SELECT message FROM content ' +
                                   'WHERE id = ' + key;
                  conn.query(query_stmt, function(err, result) {
                      if(err){
                        error_log.info("fail to get message (MySQL) : " + err);
                        error_log.info("QUERY STMT : " + query_stmt);
                        error_log.info();
                        rejected("DB err!");
                      }
                      if(result){
                        contentDataList.push(result[0].message);
                        //console.log("cache miss!");
                        monitoring.cacheMiss++;
                        //operation_log.info("[Cache Hit]= " + monitoring.cacheHit + ", [Cache Miss]= " + monitoring.cacheMiss + ", [Cache Ratio]= " + monitoring.getCacheHitRatio());

                      } else {
                        error_log.error("There's no data, even in the origin mysql server!");
                        error_log.error();
                      }

                      conn.release(); //MySQL connection release
                      getUserContentData(i+1, callback);
                  })
              });
            }
          });
        }
      }

      getUserContentData(0, function(){
        readEndTime = new Date().getTime();
        operation_log.info("[Read Execution Delay]= " + (readEndTime - readStartTime) + "ms");
        //operation_log.info("[Read Latency Delay]= " + monitoring.getLatencyDelay(util.getServerLocation(), userLocation) + "ms");
        operation_log.info("[Read Operation Count]= " + ++monitoring.readCount);
        //operation_log.info("[Read Traffic]= " + (monitoring.readCount * (end-start+1)));
        operation_log.info("[Cache Hit]= " + monitoring.cacheHit + ", [Cache Miss]= " + monitoring.cacheMiss + ", [Cache Ratio]= " + monitoring.getCacheHitRatio() + "\n");
        //operation_log.info();
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

  .then(function(){
    return new Promise(function(resolved, rejected){
      res.json({
        status : "OK",
        contents : contentDataList
      });
    })
  }, function(err){
      console.log(err);
  })
});

//Post a content to users' timelines
router.post('/:userId', function(req, res, next) {

  var tweetObjectList = [];

  //2. 친구들 리스트 뽑아서
  var promise = new Promise(function(resolved, rejected){
      var friendList = [];
      dbPool.getConnection(function(err, conn) {
          var query_stmt = 'SELECT friendId FROM friendList WHERE userId = "' + req.params.userId + '"';
          conn.query(query_stmt, function(err, rows) {
              if(err) {
                error_log.info("fail to get friendList (MySQL) : " + err);
                error_log.info("QUERY STMT : " + query_stmt);
                rejected("fail to extract friend id list from origin server!");
              }
              for (var i=0; i<rows.length; i++) {
                  friendList.push(rows[i].friendId);
              }
              conn.release(); //MySQL connection release
              resolved(friendList);
          })
      });
  });

  //3-1. origin server에 있는 mysql의 content에 모든 친구들에 대해서 데이터를 넣는다. 이 때, lastInsertId를 이용해서 contentId를 만듦.
  promise
  .then(function(friendList){
    return new Promise(function(resolved, rejected){
      pushTweetInOriginDB = function(i, callback){
        if(i >= friendList.length){
          callback();
        } else {
          dbPool.getConnection(function(err, conn) {
              var query_stmt = 'SELECT id FROM user WHERE userId = "' + friendList[i] + '"'
              conn.query(query_stmt, function(err, result) {
                  if(err) {
                     error_log.debug("Query Stmt = " + query_stmt);
                     error_log.debug("ERROR MSG = " + err);
                     error_log.debug();
                     rejected("DB err!");
                  }
                  var userPkId = result[0].id;
                  conn.release(); //MySQL connection release

                  //////////////////////////////////////////////////////////////
                  dbPool.getConnection(function(err, conn) {
                      var query_stmt2 = 'INSERT INTO content (uid, message) VALUES (' + userPkId + ', "' + req.body.contentData + '")'
                      conn.query(query_stmt2, function(err, result) {
                          if(err) {
                             error_log.debug("Query Stmt = " + query_stmt);
                             error_log.debug("ERROR MSG = " + err);
                             error_log.debug();
                             rejected("DB err!");
                          }
                          if(result == undefined || result == null){
                              error_log.debug("Query Stmt = " + query_stmt2);
                              error_log.debug("Query Result = " + result);
                          }
                          else {
                            var tweetObject = {};
                            tweetObject.userId = friendList[i];
                            tweetObject.contentId = Number(result.insertId);
                            tweetObject.content = req.body.contentData;
                            tweetObjectList.push(tweetObject);
                          }
                          conn.release();
                          pushTweetInOriginDB(i+1, callback);
                      });
                  });
                  //////////////////////////////////////////////////////////////
              });
          });
        }
      }

      pushTweetInOriginDB(0, function(){
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

  //3-2. origin server에 있는 mysql의 timeline에, 모든 친구들에 대해서 데이터를 넣는다.
  .then(function(){
    return new Promise(function(resolved, rejected){
      pushIndexInOriginDB = function(i, callback){
        if(i >= tweetObjectList.length){
          callback();
        } else {
          dbPool.getConnection(function(err, conn) {
              var query_stmt = 'SELECT id FROM user WHERE userId = "' + tweetObjectList[i].userId + '"';
              conn.query(query_stmt, function(err, result) {
                  if(err) {
                     error_log.debug("Query Stmt = " + query_stmt);
                     error_log.debug("ERROR MSG = " + err);
                     error_log.debug();
                     rejected("DB err!");
                  }
                  conn.release(); //MySQL connection release
                  var userPkId = result[0].id;
                  //////////////////////////////////////////////////////////////
                  dbPool.getConnection(function(err, conn) {
                      var query_stmt2 = 'INSERT INTO timeline (uid, contentId) VALUES (' + userPkId + ', ' + tweetObjectList[i].contentId + ')'
                      conn.query(query_stmt2, function(err, result) {
                          if(err) {
                             error_log.debug("Query Stmt = " + query_stmt);
                             error_log.debug("ERROR MSG = " + err);
                             error_log.debug();
                             rejected("DB err!");
                          }
                          if(result == undefined || result == null){
                              error_log.debug("Query Stmt = " + query_stmt2);
                              error_log.debug("Query Result = " + result);
                          }

                          conn.release();
                          pushIndexInOriginDB(i+1, callback);
                      });
                  });
                  //////////////////////////////////////////////////////////////
              })
          });
        }
      }

      pushIndexInOriginDB(0, function(){
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

  //4. 다른 surrogate 서버로 redirect
  .then(function(){
    return new Promise(function(resolved, rejected){
      try {
        if(tweetObjectList.length > 0){
          redirect.send(tweetObjectList);
        }
        resolved();

      } catch (e) {
        error_log.debug("Redirect Error = " + e);
        error_log.debug();
        rejected("Redirect error : " + e);
      }
    })
  }, function(err){
      console.log(err);
  })

  //5. tweetObjectList를 이용해서, 각 surrogate 서버 index 메모리에, 모든 친구들에 대해서 넣는다.
  .then(function(){
    return new Promise(function(resolved, rejected){
      pushTweetInIndexMemory = function(i, callback){
        if(i >= tweetObjectList.length){
          callback();
        } else {
          var key = tweetObjectList[i].userId;
          var value = tweetObjectList[i].contentId;
          redisPool.indexMemory.lpush(key, value, function (err) {
              if(err){
                error_log.debug("fail to push the content into friend's index memory in Redis : " + err);
                error_log.debug("key (tweetObjectList[i].userId) : " + key + ", value (tweetObjectList[i].contentId) : " + value);
                error_log.debug();
                rejected("fail to push the content into friend's index memory in Redis");
              }
              pushTweetInIndexMemory(i+1, callback);
          });
        }
      }

      pushTweetInIndexMemory(0, function(){
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

  //6. tweetObjectList를 이용해서, 각 surrogate 서버 data 메모리에, 모든 친구들에 대해서 넣는다. 이때 메모리양 체크하면서 넣어야한다.
  .then(function(){
    return new Promise(function(resolved, rejected){
      pushTweetInDataMemory = function(i, callback){
        if(i >= tweetObjectList.length){
          callback();
        } else {

          //memoryManager에서 메모리 상태를 보고, 아직 공간이 있는지 없는지 확인한다
          /*
            지금 redis.conf에 maxmemory-policy는 allkeys-lru로 해놨다. 최근에 가장 안쓰인 애들을 우선적으로 삭제하는 방식.
            따라서 아래의 메모리 체크 함수 (checkMemory)는 우리가 제안하는 방식에서만 필요하고, baseline approach에서는 필요 없다.
            baseline approach에서는 그냥, 가만히 놔두면 redis설정에 따라 오래된 애들을 우선적으로 지울듯. lru에 따라.
          */
          memoryManager.checkMemory(tweetObjectList[i]);
          pushTweetInDataMemory(i+1, callback);
        }
      }

      pushTweetInDataMemory(0, function(){
        res.json({
          "status" : "OK"
        })
        operation_log.info("[Write Operation Count]= " + ++monitoring.writeCount + "\n");
        //operation_log.info("[Write Traffic]= " + (monitoring.writeCount * req.body.contentData.length) + "B");
        //operation_log.info();
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

});

module.exports = router;
