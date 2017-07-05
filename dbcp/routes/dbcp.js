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
var util = require('../src/util.js');

var app = express();

//---------------------------------------------------------------------------//

//Get each user's timeline contents
router.get('/userInfoList/:botNumber', function(req, res, next) {
	var userList = [];
	dbPool.getConnection(function(err, conn) {
	  var query_stmt = 'SELECT userId, userLocation FROM user ' +
					   'WHERE botNo = ' + req.params.botNumber;
	  conn.query(query_stmt, function(err, result) {
		if(err) error_log.info("Fail to get userInfoList");
		for(var i=0; i<result.length; i++){
			userList.push({
				userId : result[i].userId,
				userLocation : result[i].userLocation
			});
		} 
		operation_log.info("The number of userList gotten at this time = " + userList.length);
		conn.release(); //MySQL connection release
		res.json({
			userInfoList : userList
		});
	  })
	});
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
  promise
  .then(function(friendList){
    return new Promise(function(resolved, rejected){
      pushTweetInOriginDB = function(i, callback){
        if(i >= friendList.length){
          callback();
        } else {
          dbPool.getConnection(function(err, conn) {
              var query_stmt = 'INSERT INTO content (uid, message) SELECT id, "' + req.body.contentData
                            + '" FROM user WHERE userId = "' + friendList[i] + '"';
              conn.query(query_stmt, function(err, result) {
                  if(err) {
                     rejected("DB err!");
                  }

                  conn.release(); //MySQL connection release

                  var tweetObject = {};
                  tweetObject.userId = friendList[i];
                  tweetObject.contentId = Number(result.insertId);
                  tweetObject.content = req.body.contentData;
                  tweetObjectList.push(tweetObject);

                  pushTweetInOriginDB(i+1, callback);
              })
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
        redirect.send(tweetObjectList);
        // redirect.send({ user_id : req.params.userId,
        //                 contentData : req.body.contentData });
        resolved();

      } catch (e) {
        rejected("redirect error");
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
        res.json({
          "result" : "completed"
        })
        resolved();
      })
    })
  }, function(err){
      console.log(err);
  })

});

module.exports = router;
