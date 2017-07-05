var dbPool = require('mysql').createPool({
    connectionLimit : 100,
    host            : '165.132.104.211',  //DBCP server IP
    user            : 'root',
    password        : 'cclab',
    database        : 'dbcp' 
});

module.exports = dbPool;
