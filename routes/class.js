var express = require('express');
var router = express.Router();
var mariasql = require('mariasql');
var flow = require('finally');
var request = require('request');
var utillib = require('util');

var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");

/*
	Custom Modules
*/
var abbdb = require('../src/abbdb.js');
var dmkRes = require('../src/dmkResponse.js');
var dmkParamChecker = require("../src/dmkParamChecker.js");


// 등원 지도 중 등/하원 여부
router.put('/:class_id/children/commute/:commutetype', function(req, res, next) {
	/*
	Input Format
	{
		board_children = [ 1, 2, 3, 4 ];
		nonboard_children = [ 2,3, 4, 5 ];	
	}
	*/
	var conn = abbdb.connection;

	if(!utillib.isArray(req.body.board_children) || !utillib.isArray(req.body.nonboard_children)) {
		res.json(dmkRep.getResponse(2));
		conn.end();
		return;
	}

	var getInCluase = function(childList) {

		var content = '';
		for(var i = 0; i < childList.length; i++) {
			content += ('' + childList[i]);
			
			if(i < childList.length - 1) {
				content += ', ';
			}
		}
		console.log('Content : ' + content);

		return utillib.format('(%s)', content);
	}

	flow(function() {
		
		if(req.body.board_children.length == 0) {
			this.continue();
		}

		var querystr = 'UPDATE commute_history SET is_board = 1 WHERE commute_date = CURDATE() AND commute_type = ? AND child_id IN ' + getInCluase(req.body.board_children);
		
		conn.query(querystr, [ req.params.commutetype ], function(err, result) {

			if(err) {
				console.log('Err #1', err);
				this.break(500);
			} else {
				this.continue();
			}
		}.bind(this));
	})
	.then(function() {

		if(req.body.nonboard_children.length == 0) {
			this.continue(0);
		}

		var querystr = 'UPDATE commute_history SET is_board = 0 WHERE commute_date = CURDATE() AND commute_type = ? AND child_id IN ' + getInCluase(req.body.nonboard_children);
		console.log(querystr);
		conn.query(querystr, [ req.params.commutetype ], function(err, result) {

			if(err) {
				console.log('Err #2', err);
				this.break(500);
			} else {
				this.break(0);
			}
		}.bind(this));

	})
	.finally(function(errCode) {

		res.json(dmkRes.getResponse(errCode));
		conn.end();
	});

	

});

// 반의 아이들 탑승 정보
router.get('/:class_id/children/commute/:commutetype', function(req, res, next) {

	var conn = abbdb.connection;
	
	flow(function() {
		var commuteType = req.params.commutetype;

		var routeColName = '';
		if(commuteType == 1) {
			routeColName = 'routeid_departure';
		} else if(commuteType == 2) {
			routeColName = 'routeid_arrival';
		}
		var querystr = utillib.format(
			'INSERT INTO commute_history (child_id, commute_type, commute_date) \
			SELECT child.id, %d, CURDATE() FROM child \
			WHERE NOT EXISTS \
			( \
			SELECT * FROM commute_history WHERE child.id = commute_history.child_id AND commute_history.commute_date = CURDATE() AND commute_history.commute_type = %d \
			) \
			AND %s <> 0 AND class_id = %d', commuteType, commuteType, routeColName, req.params.class_id);

		conn.query(querystr, function(err, result) {
			if(err) {
				console.log(err);
				this.break(500);
			} else {
				this.continue(commuteType);
			}
		}.bind(this));

	})
	.then(function(commuteType) {
		var routeColName = '';
		if(commuteType == 1) {
			routeColName = 'routeid_departure';
		} else if(commuteType == 2) {
			routeColName = 'routeid_arrival';
		}

		var querystr = utillib.format(' \
				SELECT child.id, child.name, is_board, nonboard_reason_type, nonboard_reason \
				FROM commute_history, child \
				WHERE commute_type = %d AND commute_date = CURDATE() AND commute_history.child_id = child.id AND %s <> 0 AND child.class_id = %d AND approval_state = 1'
			, commuteType, routeColName, req.params.class_id);
		conn.query(querystr, function(err, rows) {
			if(err) {
				console.log(err);
				this.break(500);
			} else {
				this.continue(0, rows);
			}
		}.bind(this));
	})
	.finally(function(errCode, children) {

		var payload = dmkRes.getResponse(errCode);
		if(errCode == 0) {
			payload.children = children;
		}
		res.json(payload);

	});	
	
	conn.end();
});


router.get('/:cid/children', function(req, res, next) {

	var conn = abbdb.connection;

	flow(function() {
		var query = conn.query("SELECT * FROM child WHERE class_id = ?", [ req.params.cid ], function(error, rows) {
			if(error) {
				console.log(error);
				res.json(dmkRes.getResponse(500));
				res.end();
				this.break();
				return;
			}

			if(typeof rows == "undefined") {
				res.json(dmk.getReponse(1)); 
				res.end();
				this.break();
				return;
			}

			var payload = dmkRes.getResponse(0);
			payload.children = new Array();
			for(var i = 0; i < rows.length; i++) {
				payload.children.push(rows[i]);
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

router.get('/:cid/children/:childid/bus', function(req, res, next) {

	var conn = abbdb.connection;
	flow(function() {
		var query = conn.query("SELECT * FROM child WHERE id = ?", [ req.params.childid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(!Array.isArray(rows) || rows.length < 1) {
				
				this.break(1);
				return;
			}

			var routeIDs = [ 
				rows[0].routeid_departure, 
				rows[0].routeid_arrival 
			];

			this.continue(routeIDs);

		}.bind(this));
	})
	.then(function(routeIds) {
		var q2 = conn.query("SELECT bus.id AS bus_id, bus.name AS bus_name, bus_route.id AS route_id, route_name, bus.type FROM bus, bus_route" +
		 " WHERE bus_route.bid = bus.id AND bus_route.id in (?, ?)", routeIds, function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}
			if(typeof rows == "undefined") {
				this.break(1);
				return;
			}

			var payload = dmkRes.getResponse(0);
			if(rows.length > 0) {
				payload.bus_info = new Object();
			} else {
				payload.bus_info = null;
			}

			for(var i = 0; i < rows.length; i ++) {
				
				if(rows[i].type == 1) {
					payload.bus_info.departure = rows[i];
				} else if(rows[i].type == 2) {
					payload.bus_info.arrival = rows[i];
				}
			}

			this.continue(0, payload.bus_info);

		}.bind(this));
	})
	.finally(function(errCode, busInfo) {

		var payload = dmkRes.getResponse(errCode);
		if(typeof busInfo != 'undefined')
			payload.bus_info = busInfo;

		res.json(payload);
		
		conn.end();
	});


});

// 아이를 반에 배정
router.put('/:class_id/children/:cid', function(req, res, next) {

    var conn = abbdb.connection;
    flow(function() {

    	conn.query('SELECT * FROM child WHERE id = ?', [ req.params.cid ], function(err, rows) {

    		if(err) {
    			this.break(500);
    			return;
    		}

    		if(rows.length == 0) {
    			this.break(3);
    			return;
    		}

    		this.continue();

    	}.bind(this));

    })
    .then(function() {

    	conn.query("UPDATE child SET class_id = ? WHERE id = ?", [ req.params.class_id, req.params.cid ], function(err, result) {
        	if (err) {
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

// 교사를 반에 할당
router.put('/:cid/teacher/:uid', function(req, res, next) {

    var classID = req.params.cid;
    var teacherID = req.params.uid;

    var conn = abbdb.connection;
    flow(function() {
    	
        conn.query("SELECT * FROM class WHERE id = ?", [ req.params.cid ], function(err, rows) {
            if (err) {
                this.break(500, false);
                return;
            } 

            if (rows.length != 1) {
                this.break(3003, false);
                return;
            } 
            
            this.continue();

        }.bind(this));
    })

    .then(function() {
    	
        conn.query("START TRANSACTION", function(err, result) {
            if (err) {
                this.break(500, false);
                return;
            } 

            this.continue();
            
        }.bind(this));
    })

    .then(function() {
        
        conn.query("UPDATE class SET teacher_uid = null WHERE teacher_uid = ?", [ teacherID ], function(err, result) {
            if (err) {
                this.break(500, true);
                return;

            } 
            
            this.continue();
            

        }.bind(this));
    })

    .then(function() {
    	
        conn.query("UPDATE class SET teacher_uid = ? WHERE id = ?", [ teacherID, classID ], function(err, result) {

        	if(err) {
        		this.break(500, true);
        		return;
        	}

        	this.continue(0, true);

        }.bind(this));

    })
    .finally(function(errCode, isLock) {
    	
    	if(isLock) {

    		if(errCode == 0) 
    			var querystr = 'COMMIT';
    		else
    			var querystr = "ROLLBACK";

    		flow(function() { conn.query(querystr, this.continue); })
    		.finally(function(err, result) { res.json(dmkRes.getResponse(errCode)); })
    	}
    	else {
    		res.json(dmkRes.getResponse(errCode));
    	}

    });

    conn.close();

});


// 반 수정
router.put('/:cid', function(req, res, next) {

    // Check
    var teacherid = null;
    if (typeof req.body.teacher_uid != "undefined") {
        teacherid = req.body.teacher_uid;
    }

    var conn = abbdb.connection;
    flow(function() {
    	var queryStr = "UPDATE class SET name ='" + req.body.name + "', teacher_uid =" + teacherid +
        " where id=" + req.params.cid;
    	req.body.name + "', " + req.params.pid + ");"

	    conn.query(queryStr, function(err, result) {

	        if (err) {

	            res.json(dmkRes.getResponse(500));
	            this.break();
	            return;
	        }

	        var r = dmkRes.getResponse(0);
	        r.class = {
	            id: req.params.cid,
	                name: req.body.name,
	                teacher_uid: req.body.teacherid,
	        };

	        res.json(r);
	        this.continue();

	    }.bind(this));
    })
    .finally(function() {

    	conn.end();
    });
    

    

});

router.delete('/:cid', function(req, res, next) {

    var conn = abbdb.connection;
    flow(function() {
    	var queryStr = "DELETE FROM class WHERE id = " + req.params.cid;
	    conn.query(queryStr, function(err, result) {

	        if (err) {
	            res.json(dmkRes.getResponse(500));
	            this.break();
	            return;
	        }

	        res.json(dmkRes.getResponse(0));
	        this.continue();

	    }.bind(this));
	
    })
    .finally(function() {
    	
    	conn.end();
    });
    
    
});


// 노선 선택
router.put('/children/:childid/route', function(req, res, next) {

	if(typeof req.body.routeid_departure == 'undefined' || typeof req.body.routeid_arrival == 'undefined') {
		res.json(dmkRes.getReponse(2));
		conn.end();
		return;
	}

	var conn = abbdb.connection;
	var updateParams = [ req.body.routeid_departure, req.body.routeid_arrival ];
	var removeCount = 0;
	
	if(req.body.routeid_departure == 0) removeCount++;
	if(req.body.routeid_arrival == 0) removeCount++;

	flow(function() {

		conn.query('SELECT teacher_uid, route_id FROM bus, bus_route WHERE (bus_route.id = ? OR bus_route.id = ?) AND bus_route.bid = bus.id', updateParams, function(err, rows) {


			if(err) {
				this.break(500);
				return;
			}

			if(rows.length - removeCount < 0) {
				this.break(3);
				return;
			}

			for(var i = 0; i < rows.length; i++) {

				if(rows[i].teacher_uid != 0 || rows[i].route_id != 0) {
					this.break(2009);
					return;
				}

			}

			this.continue();

		}.bind(this));

	})
	.then(function() {

		var dbParam = [ req.body.routeid_departure, req.body.routeid_arrival, req.params.childid ]; 
		conn.query("UPDATE child SET routeid_departure = ?, routeid_arrival = ? WHERE id = ?", dbParam, function(error, result) {

			if(error) {
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

module.exports = router;
