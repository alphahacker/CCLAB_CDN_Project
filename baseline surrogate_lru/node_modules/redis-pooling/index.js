/**
 * Created by melontron on 9/7/16.
 */
var redis = require('redis');
var bluebird = require('bluebird');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);



var RedisPool = function (config) {
    var connections = [];
    this.methods = {
        "set": 2,
        "get": 1,
        "incr": 1,
        "expire": 2,
        "expireat": 2,
        "auth": 1,
        "append": 2,
        "dbsize": 0,
        "del": 1,
        "dump": 1,
        "echo": 1,
        "exists": 1,
        "hdel": 2,
        "hexists": 1,
        "hget": 2,
        "hgetall": 1,
        "hincrby": 3,
        "hincrbyfloat": 3,
        "hkeys": 1,
        "hlen": 1,
        "hmget": 2,
        "hmset": 3,
        "hset": 3,
        "hsetnx": 3,
        "hstrlen": 2,
        "hvals": 1,
        "incrby": 2,
        "incrbyfloat": 2,
        "keys": 1,
        "lindex": 2,
        "lrange": 3,
        "lrem": 3,
        "lset": 3,
        "ltrim": 3,
        "randomkey": 0,
        "rename": 2,
        "renamenx": 2,
        "setnx": 2,
        "ttl": 1,
        "setex" : 3,
	"sadd": 2,
        "smembers":1,
        "sismember": 2,
    };
    this.config = {
        maxPoolSize: config.maxPoolSize || 5,
        credentials: config.credentials
    };
    var _this = this;
    this.getConnection = function () {
        if (connections.length < this.config.maxPoolSize) {
            connections.push({
                client: redis.createClient(_this.config.credentials),
                id: this.makeId(),
                inUse: 1
            });

            return connections[connections.length - 1];
        } else {
            var connectionWithMinUsers = connections[0];
            var min = connections[0].inUse;
            connections.map(function (connection) {
                if (connection.inUse < min) {
                    min = connection.inUse;
                    connectionWithMinUsers = connection;
                }
            });
            connectionWithMinUsers.inUse++;
            return connectionWithMinUsers;
        }
    };

    this.init = function () {
        var methods = Object.keys(this.methods);
        methods.forEach(function (method) {
            switch (_this.methods[method]) {
                case 1:
                {
                    _this[method] = function (key, callback) {
                        return _this.callMethod(method, 1, key, null, null, callback);
                    }
                    break;
                }
                case 2:
                {
                    _this[method] = function (key, value, callback) {
                        return _this.callMethod(method, 2, key, value, null, callback);
                    }
                    break;
                }
                case 3:{
                    _this[method] = function (key, field, value, callback) {
                        return _this.callMethod(method, 3, key, value, field, callback);
                    }
                    break;
                }
                default:
                {
                    break;
                }
            }
        })
    };


    this.updateConnections = function () {
        var counter = 0;
        for (var i = 0; i < connections.length; i++) {
            if (connections[i].inUse == 0) {
                counter++;
            }

            if (counter > 1) {
                connections[i].client.quit();
                connections.splice(i, 1);
                counter--;
                i--;
            }
        }
    };

    this.callMethod = function (method, type, key, value, field, callback) {
        var conn = _this.getConnection();
        var client = conn.client;
        if (typeof callback == "undefined") {

            switch (type) {
                case 1:
                {
                    return new Promise(function (resolve, reject) {
                        client[method + 'Async'](key).then(function (val) {
                            _this.abandonConnection(conn);
                            resolve(val)
                        }).catch(reject);
                    });
                }
                case 2:
                {

                    return new Promise(function (resolve, reject) {
                        client[method + 'Async'](key, value).then(function (val) {
                            _this.abandonConnection(conn);
                            resolve(val)
                        }).catch(reject);
                    })

                }
                case 3:{
                    return new Promise(function (resolve, reject) {
                        client[method + 'Async'](key, field ,value).then(function (val) {
                            _this.abandonConnection(conn);
                            resolve(val)
                        }).catch(reject);
                    })
                }
            }
        } else {
            if (typeof  callback != "function") {
                throw new Error('TypeError: callback should be a function');
            } else {
                switch (type) {
                    case 1:
                    {
                        client[method](key, function (err, result) {
                            _this.abandonConnection(conn);
                            callback(err, result);
                        });
                        break;
                    }
                    case 2:
                    {
                        client[method](key, value, function (err, result) {
                            _this.abandonConnection(conn);
                            callback(err, result);
                        });
                        break;
                    }
                    case 3:{
                        client[method](key, field, value, function (err, result) {
                            _this.abandonConnection(conn);
                            callback(err, result);
                        });
                        break;
                    }
                }

            }
        }
    };

    this.abandonConnection = function (connection) {
        if (--connection.inUse == 0) {
            _this.updateConnections();
        }
    };


    this.init();

};


RedisPool.prototype.makeId = function () {

    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 15; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;

};




var clientCreated = false;
var client;
module.exports = function (config, createNew) {
    config = (typeof config == "undefined") ? {credentials: {}} : config;
    if( clientCreated == false || createNew == true){
        client = new RedisPool(config);
        clientCreated = true;
    }
    return client;
};
