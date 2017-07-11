var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var redis = require('redis');
var JSON = require('JSON');

var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");

var dbPool = require('../src/db.js');
var redisPool = require('../src/caching.js');
var redirect = require('../src/redirector_send.js');
var memoryManager = require('../src/memoryManager.js');
var util = require('../src/util.js');
var monitoring = require('../src/monitoring.js');

var app = express();

//---------------------------------------------------------------------------//

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
        if(err) rejected("fail to get the index memory in Redis");
        contentIndexList = result;
        resolved(contentIndexList);
    });
  });

  promise
  .then(function(contentIndexList){
    return new Promise(function(resolved, rejected){
      var key = req.params.userId;
      redisPool.locationMemory.get(key, function (err, result) {
          if(err) console.log("fail to get user location from redis! ");
          if(result){
            userLocation = result;
            resolved(contentIndexList);
          } else {
            dbPool.getConnection(function(err, conn) {
              var query_stmt = 'SELECT userLocation FROM user ' +
                               'WHERE userId = ' + key;
              conn.query(query_stmt, function(err, result) {
                  if(err) rejected("DB err!");
                  userLocation = result[0].userLocation;
                  resolved(contentIndexList);
                  conn.release(); //MySQL connection release
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
              if(err) console.log("fail to push the content from data memory in redis! ");
              if(result){
                contentDataList.push(result);
                console.log("cache hit!");
                monitoring.cacheHit++;
                //operation_log.info("[Cache Hit]= " + monitoring.cacheHit + ", [Cache Miss]= " + monitoring.cacheMiss + ", [Cache Ratio]= " + monitoring.getCacheHitRatio());
                getUserContentData(i+1, callback);

              } else {
                dbPool.getConnection(function(err, conn) {
                  var query_stmt = 'SELECT message FROM content ' +
                                   'WHERE id = ' + key;
                  conn.query(query_stmt, function(err, result) {
                      if(err) rejected("DB err!");
                      if(result){
                        contentDataList.push(result[0].message);
                        console.log("cache miss!");
                        monitoring.cacheMiss++;
                        //operation_log.info("[Cache Hit]= " + monitoring.cacheHit + ", [Cache Miss]= " + monitoring.cacheMiss + ", [Cache Ratio]= " + monitoring.getCacheHitRatio());

                      } else {
                        console.log("there's no data, even in the origin mysql server!");
                        error_log.error("there's no data, even in the origin mysql server!");
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
        operation_log.info("[Read Execution Delay]= " + (readEndTime - readStartTime));
        operation_log.info("[Read Latency Delay]= " + monitoring.getLatencyDelay(util.getServerLocation(), userLocation));
        operation_log.info("[Read Operation Count]= " + ++monitoring.readCount);
        operation_log.info("[Cache Hit]= " + monitoring.cacheHit + ", [Cache Miss]= " + monitoring.cacheMiss + ", [Cache Ratio]= " + monitoring.getCacheHitRatio());
        operation_log.info();
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
          console.log(query_stmt);
          conn.query(query_stmt, function(err, rows) {
              if(err) {
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
  //promise
  // .then(function(friendList){
  //   return new Promise(function(resolved, rejected){
  //     pushTweetInOriginDB = function(i, callback){
  //       if(i >= friendList.length){
  //         callback();
  //       } else {
  //         dbPool.getConnection(function(err, conn) {
  //             var query_stmt = 'INSERT INTO content (uid, message) SELECT id, "' + req.body.contentData
  //                           + '" FROM user WHERE userId = "' + friendList[i] + '"';
  //             conn.query(query_stmt, function(err, result) {
  //                 if(err) {
  //                    error_log.debug("Query Stmt = " + query_stmt);
  //                    error_log.debug("ERROR MSG = " + err);
  //                    rejected("DB err!");
  //                 }
  //
  //                 conn.release(); //MySQL connection release
  //
  //                 if(result == undefined || result == null){
  //                     operation_log.debug("Query Stmt = " + query_stmt);
  //                     operation_log.debug("Query Result = " + result);
  //                 }
  //                 else {
  //                   var tweetObject = {};
  //                   tweetObject.userId = friendList[i];
  //                   tweetObject.contentId = Number(result.insertId);
  //                   tweetObject.content = req.body.contentData;
  //                   tweetObjectList.push(tweetObject);
  //                 }
  //                 pushTweetInOriginDB(i+1, callback);
  //             })
  //         });
  //       }
  //     }
  //
  //     pushTweetInOriginDB(0, function(){
  //       resolved();
  //     })
  //   })
  // }, function(err){
  //     console.log(err);
  // })
  promise
  .then(function(friendList){
    console.log(friendList);
    return new Promise(function(resolved, rejected){
      pushTweetInOriginDB = function(i, callback){
        if(i >= friendList.length){
          callback();
        } else {
          dbPool.getConnection(function(err, conn) {
              var query_stmt = 'SELECT id FROM user WHERE userId = "' + friendList[i] + '"'
              console.log(query_stmt);
              conn.query(query_stmt, function(err, result) {
                  if(err) {
                     error_log.debug("Query Stmt = " + query_stmt);
                     error_log.debug("ERROR MSG = " + err);
                     rejected("DB err!");
                  }
                  conn.release(); //MySQL connection release

                  //////////////////////////////////////////////////////////////
                  dbPool.getConnection(function(err, conn) {
                      var query_stmt2 = 'INSERT INTO content (uid, message) VALUES (' + result[i] + ', "' + req.body.contentData + '")'
                      console.log(query_stmt2);
                      conn.query(query_stmt2, function(err, result) {
                          if(result == undefined || result == null){
                              operation_log.debug("Query Stmt = " + query_stmt2);
                              operation_log.debug("Query Result = " + result);
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
              var query_stmt = 'INSERT INTO timeline (uid, contentId) SELECT id, ' + tweetObjectList[i].contentId
                            + ' FROM user WHERE userId = "' + tweetObjectList[i].userId + '"';
              conn.query(query_stmt, function(err, result) {
                  if(err) {
                     rejected("DB err!");
                  }

                  conn.release(); //MySQL connection release
                  pushIndexInOriginDB(i+1, callback);
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
          // redirect.send({ user_id : req.params.userId,
          //                 contentData : req.body.contentData });
        }

        resolved();

      } catch (e) {
        rejected("redirect error : " + e);
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

          console.log("key (friendId) : " + key + ", value : " + value);
          redisPool.indexMemory.lpush(key, value, function (err) {
              if(err) rejected("fail to push the content into friend's index memory in Redis");
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
          //memoryManager.checkMemory(tweetObjectList[i].content.length, tweetObjectList[i].userId);
          pushTweetInDataMemory(i+1, callback);
          // memoryManager.checkMemory(tweetObjectList[i].content.length, tweetObjectList[i].userId, function(expectedRemainMemory){ //파라미터로 데이터의 사이즈와 사용자의 ID를 넣어야함.
          //   if(expectedRemainMemory >= 0){
          //     var key = tweetObjectList[i].contentId;
          //     var value = tweetObjectList[i].content;
          //     redisPool.dataMemory.set(key, value, function (err) {
          //         if(err) rejected("fail to push the content into friend's data memory in Redis");
          //         pushTweetInDataMemory(i+1, callback);
          //     });
          //   }
          // });
        }
      }

      pushTweetInDataMemory(0, function(){
        //res.send("OK");
        res.json({
          "status" : "OK"
          //"result" : "completed"
        })
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

});

module.exports = router;
