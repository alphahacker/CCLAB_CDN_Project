var redis = require('redis');

var redisClient = {};

// redisClient.indexMemory = redis.createClient(1234, '127.0.0.1');
// redisClient.dataMemory = redis.createClient(1235, '127.0.0.1');
// redisClient.socialMemory = redis.createClient(1236, '127.0.0.1');
// redisClient.locationMemory = redis.createClient(1237, '127.0.0.1');

redisClient.connectClients = function (redisIp) {
  console.log("redis ip = " + redisIp);
  redisClient.indexMemory = redis.createClient(1234, redisIp);
  console.log(redisClient.indexMemory);
  redisClient.dataMemory = redis.createClient(1235, redisIp);
  redisClient.socialMemory = redis.createClient(1236, redisIp);
  redisClient.locationMemory = redis.createClient(1237, redisIp);
}

redisClient.flushMemory = function () {
  redisClient.indexMemory.flushdb( function (err, succeeded) {
      if(err) throw err;
      console.log("index memory flush completed"); // will be true if successfull
  });

  redisClient.dataMemory.flushdb( function (err, succeeded) {
      if(err) throw err;
      console.log("data memory flush completed"); // will be true if successfull
  });

  redisClient.dataMemory.flushdb( function (err, succeeded) {
      if(err) throw err;
      console.log("social memory flush completed"); // will be true if successfull
  });

  redisClient.locationMemory.flushdb( function (err, succeeded) {
      if(err) throw err;
      console.log("location memory flush completed"); // will be true if successfull
  });
}

module.exports = redisClient;

////////////////////////////////////////////////////////////////////////////////
/*
var redis = {};

redis.flushMemory = function () {
    var redis = require('redis');
    indexMemoryClient = redis.createClient(1234, '127.0.0.1');
    dataMemoryClient = redis.createClient(1235, '127.0.0.1');
    socialMemoryClient = redis.createClient(1236, '127.0.0.1');

    indexMemoryClient.flushdb( function (err, succeeded) {
        if(err) throw err;
        console.log("index memory flush completed"); // will be true if successfull
    });

    dataMemoryClient.flushdb( function (err, succeeded) {
        if(err) throw err;
        console.log("data memory flush completed"); // will be true if successfull
    });

    socialMemoryClient.flushdb( function (err, succeeded) {
        if(err) throw err;
        console.log("social memory flush completed"); // will be true if successfull
    });
}

redis.indexMemory = require('redis-connection-pool')('indexMemoryPool', {
    host : '127.0.0.1',
    port : 1234,
    max_clients : 30,
    perform_checks : false
});

redis.dataMemory = require('redis-connection-pool')('dataMemoryPool', {
    host : '127.0.0.1',
    port : 1235,
    max_clients : 30,
    perform_checks : false
});

redis.socialMemory = require('redis-connection-pool')('socialMemoryPool', {
    host : '127.0.0.1',
    port : 1236,
    max_clients : 30,
    perform_checks : false
});
*/
// redis.friendListMemory = require('redis-connection-pool')('myRedisPool', {
//     host : '127.0.0.1',
//     port : 1237,
//     max_clients : 30,
//     perform_checks : false
// });

// redis.indexMemory = require('redis-pooling')({
//     maxPoolSize: 10,
//     credentials: {
//         host: "127.0.0.1",
//         port: "1234"
//     }
// });
//
// redis.dataMemory = require('redis-pooling')({
//     maxPoolSize: 10,
//     credentials: {
//         host: "127.0.0.1",
//         port: "1235"
//     }
// });
//
// redis.socialMemory = require('redis-pooling')({
//     maxPoolSize: 10,
//     credentials: {
//         host: "127.0.0.1",
//         port: "1236"
//     }
// });
//
//module.exports = redis;
