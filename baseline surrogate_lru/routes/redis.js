var express = require('express');
var router = express.Router();
// var bodyParser = require('body-parser');
// var redis = require('redis');
// var JSON = require('JSON');
// var dbPool = require('../src/db.js');
// var redisPool = require('../src/caching.js');
// client = redis.createClient(6379, '127.0.0.1');
// var app = express();
//
// //to get ip address
// router.get('/ip/:userId', function(req, res, next) {
//
//   var key = req.params.userId;
// //  var value = JSON.stringify(req.body);
//
//   client.get(key, function(err,data){
//     if(err) {
//       console.log(err);
//       res.send("error : " + err);
//       return;
//     }
//
//     var value = JSON.parse(data);
//     res.json(value);
//   })
//
//   //0. redis pool로 redis연결한다
//   //1. mysql pool 로 db에 연결한다
//   //2. cache에 값이 있는지 검사한다
//   //3-a. 있으면 가져와서 리턴
//   //3-b. 없으면 디비에 가져와서 캐쉬에 올리고 리턴
//
// });
//
// //-------------------------------------------------------------------------//
//
// router.post('/profile', function(req, res, next) {
//   req.accepts('application/json');
//
//   var key = req.body.name;
//   var value = JSON.stringify(req.body);
//
//   client.set(key, value, function(err,data){
//     if(err) {
//       console.log(err);
//       res.send("error: " + err);
//       return;
//     }
//     client.expire(key, 60);
//     res.json(value);
//   })
// });
//
// router.get('/profile/:name', function(req, res, next) {
//   var key = req.params.name;
//   var value = JSON.stringify(req.body);
//
//   client.get(key, function(err,data){
//     if(err) {
//       console.log(err);
//       res.send("error : " + err);
//       return;
//     }
//
//     var value = JSON.parse(data);
//     res.json(value);
//   })
// });

module.exports = router;
