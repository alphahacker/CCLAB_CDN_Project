var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
//var redis = require('redis');
var JSON = require('JSON');

//---------------------------------------------------------------------------//

var dbPool = require('../src/db.js');

// var dbPool = require('mysql').createPool({
//   connectionLimit : 10,
//   host            : '127.0.0.1',
//   user            : 'root',
//   password        : 'cclab',
//   database        : 'surrogate'
// });

//---------------------------------------------------------------------------//

var redisPool = require('../src/caching.js');

// var redisPool = require('redis-pooling')({
//         maxPoolSize: 10,
//         credentials: {
//             host: "127.0.0.1",
//             port: "6379"
//         }
//     });
//
// var app = express();

//---------------------------------------------------------------------------//

//redirector to other surrogate servers
router.get('/ip/:userId', function(req, res, next) {


  //3. 친구들 리스트 뽑아서
  //4. 그 친구들의 timeline (index랑 mysql에 모두) 넣는다.
  //5. 데이터 메모리에도 넣는다 (데이터 메모리랑 mysql에 모두 넣는다.). 이때 메모리양 체크하면서 넣어야한다.



  //0. redis pool로 redis연결한다
  var key = req.params.userId;
  redisPool.indexMemory.get(key, function(err, data){
    if(err) {
      console.log("fail to getting a value from index memory in redis");
    //  res.send("error : " + err);
    //  return;
    }

    //각 사용자별로 저장되어 있는 컨텐츠의 index 값들을 일정량 이상가져와야된다
      //여기서 일정량은 한번에 몇개씩 보여주게 할 것이냐에 따라 다른데, 기본은 20개로 시작해볼까? <-- 이거 레퍼런스도 있었던거 같은데.
      //redis에는 각 사용자 아이디를 키값으로 하고, value는 리스트 형태로 각 데이터들이 저장된다.
      //따라서, 값을 불러올때는 해당 아이디의 value 리스트의 최대 몇개(ex. 20개)를 가져오게 하는 방식으로.
      //만약에 데이터가 없으면 cache miss가 아닌 정상 동작으로 리스폰스가 0개 돌아가도록 처리해줘야할듯?

    var value = JSON.parse(data);
    console.log("redis value : " + value);

    //2. cache에 값이 있는지 검사한다
    if(value == undefined || value == NULL) {
    //if(!value) {
      //1. mysql pool 로 db에 연결한다
      dbPool.getConnection(function(err, conn) {
    		var query_stmt = 'SELECT * FROM timeline WHERE id = "' + key + '"';
    		console.log(query_stmt);
    		conn.query(query_stmt, function(err, rows) {
    			if(err) {
    				console.log("db err");
    			}
    			else {
    				//3-b. 없으면 디비에 가져와서 캐쉬에 올리고 리턴
    				var value = JSON.stringify(rows[0]);
    				redisPool.indexMemory.set(key, value, function (err) {
    					console.log(value);
    					res.json(value);
              conn.release();
    				});
    			}
    		});
    	});
    }
    else {
      //3-a. 있으면 가져와서 리턴
      console.log(value);
      res.json(value);
    }
  })

});


// //to get ip address
// router.get('/ip/:userId', function(req, res, next) {
//   //0. redis pool로 redis연결한다
//   var key = req.params.userId;
//   redisPool.get(key, function(err, data){
//     if(err) {
//       console.log(err);
//       res.send("error : " + err);
//       return;
//     }
//
//     var value = JSON.parse(data);
//     console.log("redis value : " + value);
//     //2. cache에 값이 있는지 검사한다
//     if(!value) {
//       //1. mysql pool 로 db에 연결한다
//       dbPool.getConnection(function(err, conn) {
// 		var query_stmt = 'SELECT * FROM Test_table WHERE id = "' + key + '"';
// 		console.log(query_stmt);
// 		conn.query(query_stmt, function(err, rows) {
// 			if(err) {
// 				console.log("db err");
// 			}
// 			else {
// 				//3-b. 없으면 디비에 가져와서 캐쉬에 올리고 리턴
// 				var value = JSON.stringify(rows[0]);
// 				redisPool.set(key, value, function (err) {
// 					console.log(value);
// 					res.json(value);
// 				});
// 			}
// 		});
// 		conn.release();
// 	  });
//     }
//     else {
//       //3-a. 있으면 가져와서 리턴
//       console.log(value);
//       res.json(value);
//     }
//   })
//
// });

module.exports = router;
