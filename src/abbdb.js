var mariasql = require('mariasql');

function getConnection() {
    var conn = new mariasql();
    conn.connect({
        host: 'abuba-rds-master.chq0wzzyvbtd.ap-northeast-2.rds.amazonaws.com',
        port: 3306,
        user: 'thecompany1909',
        password: '!qaz2wsx',
        db: 'dmk'
    });

    conn.on('connect', function() {
        console.log('MariaDB connected');
    }).on('error', function(err) {
        console.log('MariaDB error : ' + err);
    }).on('close', function(hadError) {
    	if(typeof hadError != 'undefined')
        	console.log(hadError);
        console.log('MariaDB closed');
    });

    return conn;
}

module.exports.connection = getConnection();
