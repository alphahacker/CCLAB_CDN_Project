var express = require('express');
var router = express.Router();

// DMK Modules
var abbDb = require('../src/abbdb.js');
var dmkRes = require('../src/dmkResponse.js');
var dmkParamChecker = require("../src/dmkParamChecker.js");
var flow = require('finally');

// 교사 기본 정보 (이력, 메모 변경)
router.put('/:uid', function(req, res, next) {

	var updateParams = [
		req.body.memo,
		req.body.history,
		req.params.uid
	];

	var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(updateParams)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;

    flow(function() {

    	conn.query('SELECT * FROM teacher WHERE user_id = ?', [ req.params.uid ], function(err, rows) {

    		if(err) {
    			this.break(500);
    			console.log(err);
    			return;
    		}

    		if(rows.length != 1) {
    			this.break(4001);
    			return;
    		}

    		this.continue();

    	}.bind(this));
    })
    .then(function() {
    	conn.query('UPDATE teacher SET memo = ?, history = ? WHERE id = ?', updateParams, function(err, result) {

    		if(err) {
    			this.break(500);
    			return;
    		}

    		this.continue(0);

    	}.bind(this));
    })
    .finally(function(errCode) {

    	res.json(dmkRes.getResponse(errCode));
    });

    conn.end();
});


router.delete('/:uid', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {
            conn.query('DELETE FROM teacher WHERE user_id = ?', [ req.params.uid ], function(err, result) {
                if (err) {
                    console.log(err);
                    this.break(500);
                } else {
                    this.continue();
                }

            }.bind(this))
        })
        .then(function() {
            conn.query('UPDATE class SET teacher_uid = null WHERE teacher_uid = ?', [ req.params.uid ], function(err, result) {
                if (err) {
                    this.break(500);
                } else {
                    this.continue(0);
                }
            }.bind(this));
        })
        .finally(function(errorCode) {

            res.json(dmkRes.getResponse(errorCode));
        })

    conn.close();

});

// 원 가입 신청
router.post('/:uid/preschools/:pid', function(req, res, next) {

	var conn = abbDb.connection;
	// id, user_id, preschool_id, approval_state
	flow(function() {
		var query = conn.query('SELECT count(*) FROM teacher WHERE user_id = ?', [ req.params.uid ], function(error, result) {

			if(error) {
				this.break(500);
				return;
			}

			if(typeof result == "undefined" || parseInt(result[0]['count(*)']) >= 1) {
				this.break(1);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {

		conn.query('INSERT INTO teacher(user_id, preschool_id, approval_state, last_updated) VALUES(?, ?, 0, CURDATE())', [ req.params.uid, req.params.pid ], function(err, insResult) {
				if(err) {
					this.break(500);
					return;
				}

				this.continue(0);
				

		}.bind(this));
	})
	.finally(function(errorCode) {

		res.json(dmkRes.getResponse(errorCode));
		conn.end();
	});

	

});


router.get('/:uid/preschools', function(req, res, next) {

	var conn = abbDb.connection;
	flow(function() {
		var queryStr = "SELECT preschool.id, preschool.name, preschool.address_state, preschool.address_city, preschool.address_detail, preschool.phone, director_id, teacher.approval_state FROM teacher, preschool" +
					" WHERE teacher.preschool_id = preschool.id AND teacher.user_id = ?";
		var query = conn.query(queryStr, [ req.params.uid ], function(error, rows) {
			if(error) {
				
				res.json(dmkRes.getResponse(500));
				res.end();
				this.break();
				return;
			}

			if(typeof rows == "undefined") {
				res.json(dmkRes.getReponse(1));
				res.end();
				this.break();
				return;
			}

			var rp = dmkRes.getResponse(0);
			rp.preschools = new Array();
			for(var i = 0; i < rows.length; i++) {
				rp.preschools.push(rows[i]);
			}

			res.json(rp);
			res.end();
			this.continue();

		}.bind(this));
	})
	.finally(function() {
		conn.end();
	});	

});

router.get('/:uid/classes', function(req, res, next) {

	var conn = abbDb.connection;
	flow(function() {
		var query = conn.query('SELECT class.id, class.name, class.preschool_uid FROM class WHERE teacher_uid = ?', [ req.params.uid ], function(error, rows) {

			if(error) {
				console.log(error);
				res.json(dmkRes.getResponse(500));
				res.end();
				this.break();
				return;
			}
			
			if(typeof rows == "undefined") {
				res.json(dmkRes.getReponse(1));
				res.end();
				this.break();
				return;
			}
			
			var payload = dmkRes.getResponse(0);
			payload.classes = new Array();
			for(var i = 0; i < rows.length; i++) {
				payload.classes.push(rows[i]);
			}

			res.json(payload);
			res.end();
			this.continue();

		}.bind(this));
	})
	.finally(function() {
		conn.end();	
	});
	
});


// 통학 인솔 중 버스 얻어옴
router.get('/:uid/bus', function(req, res, next) {

	var conn = abbDb.connection;
	flow(function() {
		var query = conn.query('SELECT * FROM bus WHERE teacher_uid = ?', [ req.params.uid ], function(error, rows) {

			if(error) {
				
				res.json(dmkRes.getResponse(500));
				res.end();
				this.break();
				return;
			}
			
			if(typeof rows == "undefined" || !Array.isArray(rows) || rows.length > 1) {
				res.json(dmkRes.getResponse(1));
				res.end();
				this.break();
				return;
			}
			
			var payload = dmkRes.getResponse(0);
			if(rows.length == 0) {
				payload.bus = null;	
			} else {
				payload.bus = rows[0];
			}
			
			res.json(payload);
			res.end();
			this.continue();
		}.bind(this));

	})
	.finally(function() {

		conn.end();
	});

});

module.exports = router;
