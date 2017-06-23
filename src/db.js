var dbPool = require('mysql').createPool({
    connectionLimit : 10,
    host            : 'localhost',  //여기서 localhost는 나중에 origin server에 해당하는 IP로 설정해줘야 한다.
//    host            : '192.168.0.27',
//    host            : '127.0.0.1',
    user            : 'root',
    password        : 'cclab',
    database        : 'surrogate'  //DB명도 surrogate말고 origin으로 바꾸는 게 좋을 듯.
});

module.exports = dbPool;
