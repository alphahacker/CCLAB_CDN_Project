#Redis Pooling - A NodeJs module for creating redis connection pool
[Redis Pooling - v1.0.11](https://npmjs.com/package/redis-pooling)

This is a simple module for creating redis connection pool, it depends on NodeJS [redis module](https://github.com/NodeRedis/node_redis) and commands are almost the same
besides it allows you to set maximum number of connections and distribute requests equally on each of them. 
Note: if maximum amount of connections is set to some number `X` then available connections will be no more then `X`, it can 
vary based on traffic
 
##Getting started

####Installation
you can use `npm` for installing this module

`npm install redis-pooling`


####Configure
All you need is to require module and give it config object which should should have 'maxPoolSize' and 'credentials'
properties. (note that client is singleton object)

```
var client = require('redis-pooling')({
        maxPoolSize: 10,
        credentials: {
            host: "127.0.0.1",
            port: "6379"
        }
    });
``` 
   
    
##Usage Example

####With callbacks
```
//setting value
client.set(key, value,function(err, data){
    if(err){
        //handle error
    }else{
        //do stuff with data
    }
});

//getting value
client.get(key, value,function(err, data){
    if(err){
        //handle error
    }else{
        //do stuff with data
    }
});

//incrementing
client.incr(key,function(err, data){
    if(err){
        //handle error
    }else{
        //do stuff with data
    }
});
```

####With Promises
```
client.set(key, value).then(function(data){
    //success
}).catch(function(err){
    //handle error      
})
```

##Currently available methods
`set` 

`get` 

`incr` 

`expire` 

`expireat` 

`auth`

`append`

`dbsize`

`del`

`dump`

`echo`

`exists`

`hdel`

`hexists`

`hget`

`hgetall`

`hincrby`

`hincrbyfloat`

`hkeys`

`hlen`

`hmget`

`hmset`

`hset`

`hsetnx`

`hstrlen`

`hvals`

`incrby`

`incrbyfloat`

`keys`

`lindex`

`lrange`

`lrem`

`lset`

`ltrim`

`randomkey`

`rename`

`renamenx`

`setnx`

`ttl`

`setex`

`sadd`

`smembers`

`sismember`

##config object

####maxPoolSize
`maxPoolSize` - default 5

####credentials
| Property  | Default   | Description |
|-----------|-----------|-------------|
| host      | 127.0.0.1 | IP address of the Redis server |
| port      | 6379      | Port of the Redis server |
| path      | null      | The UNIX socket string of the Redis server |
| url       | null      | The URL of the Redis server. Format: `[redis:]//[[user][:password@]][host][:port][/db-number][?db=db-number[&password=bar[&option=value]]]` (More info avaliable at [IANA](http://www.iana.org/assignments/uri-schemes/prov/redis)). |
| parser    | javascript | __Deprecated__ Use either the built-in JS parser [`javascript`]() or the native [`hiredis`]() parser. __Note__ `node_redis` < 2.6 uses hiredis as default if installed. This changed in v.2.6.0. |
| string_numbers | null | Set to `true`, `node_redis` will return Redis number values as Strings instead of javascript Numbers. Useful if you need to handle big numbers (above `Number.MAX_SAFE_INTEGER === 2^53`). Hiredis is incapable of this behavior, so setting this option to `true` will result in the built-in javascript parser being used no matter the value of the `parser` option. |
| return_buffers | false | If set to `true`, then all replies will be sent to callbacks as Buffers instead of Strings. |
| detect_buffers | false | If set to `true`, then replies will be sent to callbacks as Buffers. This option lets you switch between Buffers and Strings on a per-command basis, whereas `return_buffers` applies to every command on a client. __Note__: This doesn't work properly with the pubsub mode. A subscriber has to either always return Strings or Buffers. |
| socket_keepalive | true | If set to `true`, the keep-alive functionality is enabled on the underlying socket. |
| no_ready_check | false |  When a connection is established to the Redis server, the server might still be loading the database from disk. While loading, the server will not respond to any commands. To work around this, `node_redis` has a "ready check" which sends the `INFO` command to the server. The response from the `INFO` command indicates whether the server is ready for more commands. When ready, `node_redis` emits a `ready` event. Setting `no_ready_check` to `true` will inhibit this check. |
| enable_offline_queue |  true | By default, if there is no active connection to the Redis server, commands are added to a queue and are executed once the connection has been established. Setting `enable_offline_queue` to `false` will disable this feature and the callback will be executed immediately with an error, or an error will be emitted if no callback is specified. |
| retry_max_delay | null | __Deprecated__ _Please use `retry_strategy` instead._ By default, every time the client tries to connect and fails, the reconnection delay almost doubles. This delay normally grows infinitely, but setting `retry_max_delay` limits it to the maximum value provided in milliseconds. |
| connect_timeout | 3600000 | __Deprecated__ _Please use `retry_strategy` instead._ Setting `connect_timeout` limits the total time for the client to connect and reconnect. The value is provided in milliseconds and is counted from the moment a new client is created or from the time the connection is lost. The last retry is going to happen exactly at the timeout time. Default is to try connecting until the default system socket timeout has been exceeded and to try reconnecting until 1h has elapsed. |
| max_attempts | 0 | __Deprecated__ _Please use `retry_strategy` instead._ By default, a client will try reconnecting until connected. Setting `max_attempts` limits total amount of connection attempts. Setting this to 1 will prevent any reconnect attempt. |
| retry_unfulfilled_commands | false | If set to `true`, all commands that were unfulfilled while the connection is lost will be retried after the connection has been reestablished. Use this with caution if you use state altering commands (e.g. `incr`). This is especially useful if you use blocking commands. |
| password | null | If set, client will run Redis auth command on connect. Alias `auth_pass` __Note__ `node_redis` < 2.5 must use `auth_pass` |
| db | null | If set, client will run Redis `select` command on connect. |
| family | IPv4 | You can force using IPv6 if you set the family to 'IPv6'. See Node.js [net](https://nodejs.org/api/net.html) or [dns](https://nodejs.org/api/dns.html) modules on how to use the family type. |
| disable_resubscribing | false | If set to `true`, a client won't resubscribe after disconnecting. |
| rename_commands | null | Passing an object with renamed commands to use instead of the original functions. See the [Redis security topics](http://redis.io/topics/security) for more info. |
| tls | null | An object containing options to pass to [tls.connect](http://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback) to set up a TLS connection to Redis (if, for example, it is set up to be accessible via a tunnel). |
| prefix | null | A string used to prefix all used keys (e.g. `namespace:test`). Please be aware that the `keys` command will not be prefixed. The `keys` command has a "pattern" as argument and no key and it would be impossible to determine the existing keys in Redis if this would be prefixed. |
| retry_strategy | function | A function that receives an options object as parameter including the retry `attempt`, the `total_retry_time` indicating how much time passed since the last time connected, the `error` why the connection was lost and the number of `times_connected` in total. If you return a number from this function, the retry will happen exactly after that time in milliseconds. If you return a non-number, no further retry will happen and all offline commands are flushed with errors. Return an error to return that specific error to all offline commands. Example below. |


