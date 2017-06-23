var express = require('express');
var router = express.Router();

// DMK Modules
var abbDb = require('../src/abbdb.js');
var dmkRp = require('../src/dmkResponse.js');
var dmkParamChecker = require("../src/dmkParamChecker.js");
var flow = require('finally');
var utillib = require('util');

/*
	Bus 수정
*/
router.put('/:bid', function(req, res, next) {

    var params = [
        req.body.name,
        req.body.bus_desc,
        req.body.number,

        req.body.driver_name,
        req.body.driver_phone,

        req.params.bid
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(params)) {
        res.json(dmkRes.getResponse(2));
        return;
    }
    
    var conn = abbDb.connection;
    var queryStr = "UPDATE bus SET name = ?, bus_desc = ?, number = ?, driver_name = ?, driver_phone = ? WHERE id = ?";
    conn.query(queryStr, params, function(err, result) {

        if (err) {
            res.json(dmkRp.getResponse(500));
            return;
        }

        /*
        if (result.info.affectedRows != 1) {
            res.json(dmkRp.getResponse(1));
            return;
        }
		*/

        var r = dmkRp.getResponse(0);
        r.bus = {
            id: req.params.bid,
            name: req.body.name,
            bus_desc: req.body.bus_desc,
            number: req.body.number,

            driver_name: req.body.driver_name,
            driver_phone: req.body.driver_phone,
            pid: req.params.pid
        };

        res.json(r);
    });

    conn.close();

});

router.delete('/:bid', function(req, res, next) {

	
	if(req.params.bid == 0) {
		res.json(dmkRp.getReponse(3));
		conn.close();
		return;
	}

	// @TODO : Transaction or Lock?
	var conn = abbDb.connection;
	flow(function() {

		conn.query('SELECT teacher_uid, route_id FROM bus WHERE id = ?', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}
			
			if (rows.length != 1) {
			
				this.break(3);
				return;
			} 
			
			if (rows[0].teacher_uid != 0 || rows[0].route_id !=0) {
				this.break(2009);
				console.log(rows[0]);
				return;
			} 

			this.continue();
			

		}.bind(this));

	})
	.then(function() {
		
		// Do delete
		conn.query('DELETE FROM bus WHERE id = ?', [ req.params.bid ], function(err, result) {
			if (err) {
        		this.break(500);
        		return;
	        }	
	        
	        /*
        	if (result.info.affectedRows != 1) {
                this.break(3);
                return;
            }
            */

            this.continue(0);

		}.bind(this));

	})
	.finally(function(errCode) {

		var payload = dmkRp.getResponse(errCode);
		res.json(payload);

	});

    conn.close();

});

// 등원 지도 중 등/하원 여부
router.put('/routes/:routeid/children/commute', function(req, res, next) {
	/*
	Input Format
	{
		board_children = [ 1, 2, 3, 4 ];
		nonboard_children = [ 2,3, 4, 5 ];	
	}
	*/
	var conn = abbDb.connection;

	if(req.params.routeid == 0 || !utillib.isArray(req.body.board_children) || !utillib.isArray(req.body.nonboard_children)) {
		res.json(dmkRp.getResponse(2));
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

		conn.query('SELECT bus.type FROM bus, bus_route WHERE bus.id = bus_route.bid AND bus_route.id = ?', [ req.params.routeid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				this.break(3);
				return;
			}

			this.continue(rows[0].type);

		}.bind(this));

	})
	.then(function(commuteType) {
		
		if(req.body.board_children.length == 0) {
			this.continue();
		}

		var querystr = 'UPDATE commute_history SET is_board = 1, route_id = ? WHERE commute_date = CURDATE() AND commute_type = ? AND child_id IN ' + getInCluase(req.body.board_children);
		
		conn.query(querystr, [ req.params.routeid, commuteType ], function(err, result) {

			if(err) {
				console.log(err);
				this.break(500);
			} else {
				this.continue(commuteType);
			}
		}.bind(this));
	})
	.then(function(commuteType) {

		if(req.body.nonboard_children.length == 0) {
			this.continue(0);
		}

		var querystr = 'UPDATE commute_history SET is_board = 0, route_id = ? WHERE commute_date = CURDATE() AND commute_type = ? AND child_id IN ' + getInCluase(req.body.nonboard_children);
		console.log(querystr);
		conn.query(querystr, [ req.params.routeid, commuteType ], function(err, result) {

			if(err) {
				console.log('Err #2', err);
				this.break(500);
			} else {
				this.break(0);
			}
		}.bind(this));

	})
	.finally(function(errCode) {

		res.json(dmkRp.getResponse(errCode));

	});

	conn.close();

});

// 현재 버스의 운행중인 교사 정보
router.get('/:bid/teacher', function(req, res, next) {

	var conn = abbDb.connection;

	flow(function() {
		conn.query('SELECT * FROM teacher, bus WHERE bus.id = ? AND bus.teacher_uid = teacher.id', [ req.params.bid ], function(err, teacherList) {

			if(err) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;
			}

			var payload = dmkRp.getResponse(0);
			if(teacherList.length == 0) {
				payload.teacher = null;
			}
			else { 
				payload.teacher = teacherList[0];
			}

			res.json(payload);
			this.continue();

		}.bind(this));
	})
	.finally(function() {

		conn.close();

	});

	

});

// 버스 정보
router.get('/:bid', function(req, res, next) {

	var conn = abbDb.connection;
	var params = [ req.params.bid ];

	flow(function() {
		var query = conn.query("SELECT * FROM bus WHERE id = ?", params, function(err, rows) {
		
			if(err) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;
			}

			if(!Array.isArray(rows)) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;	
			}

			var payload = dmkRp.getResponse(0);
			if(rows.length == 1) {
				payload.bus = rows[0];	
			} else {
				payload.bus = null;
			}		
			res.json(payload);
			this.continue();

		}.bind(this));

	})
	.finally(function() {

		conn.end();
	});
	
});

// 버스의 라우트 리스트
router.get('/:bid/routes', function(req, res, next) {

	var conn = abbDb.connection;
	var params = [ req.params.bid ];

	flow(function() {
		var query = conn.query("SELECT * FROM bus_route WHERE bid = ?", params, function(err, rows) {
			
			if(err) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;
			}

			var payload = dmkRp.getResponse(0);
			payload.routes = rows;
			res.json(payload);
			this.continue();

		}.bind(this));
	})
	.finally(function() {
	
		conn.end();
	});


});

// 라우트 추가
router.post('/:bid/routes', function(req, res, next) {

	var paramChecker = dmkParamChecker.getParamChecker();
	var routeParams = [
		req.body.route_name,
		req.body.latitude,
		req.body.longitude,
		req.params.bid
	];

	if(!paramChecker.nullChecker(routeParams)) {
		res.json(dmkRp.getResponse(2));
		return;
	}

	var conn = abbDb.connection;
	var nextSeq = 1;
	flow(function() {
		conn.query('SELECT teacher_uid, route_id FROM bus WHERE id = ?', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				this.break(2011);
				return;
			}


			if(rows[0].teacher_uid != 0 || rows[0].route_id != 0) {
				this.break(2009);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {
		conn.query("SELECT max(seq) FROM bus_route WHERE bid = ?", [ req.params.bid ], function(error, rows) {
			if(error) {
				this.break(500);
			} else {
				if(rows.length > 0 && rows[0] != null)
					this.continue(rows[0]['max(seq)']);
				else
					this.break(1);
			}
		}.bind(this));
	})
	.then(function(maxSequence) {

		var nextSequence = (maxSequence == null) ? 1 : Number(maxSequence) + 1;
		routeParams.push(nextSequence);

		conn.query("INSERT INTO bus_route(route_name, latitude, longitude, bid, seq) VALUES(?, ?, ?, ?, ?)", routeParams, function(err, result) {
			if(err) {
				
				this.break(500);
			} else if(result.affectedRows == 0) {
				this.break(1);
			} else {
				
				this.continue(0, {
					id : result.info.insertId,
					route_name : req.body.route_name,
					latitude : req.body.latitude,
					longitude : req.body.longitude,
					seq : nextSequence
				});
			}

		}.bind(this));
		
	})
	.finally(function(errCode, data) {
		var payload = dmkRp.getResponse(errCode);
		if(errCode == 0) {
			payload.route = data;
		}

		res.json(payload);
	});

	conn.close();
});


router.put('/routes/:rid', function(req, res, next) {

	var paramChecker = dmkParamChecker.getParamChecker();
	var routeParams = [
		req.body.latitude,
		req.body.longitude,
		req.body.route_name,
		req.params.rid
	];

	if(!paramChecker.nullChecker(routeParams)) {
		res.json(dmkRp.getResponse(2));
		conn.end();
		return;
	}

	if(req.params.rid == 0) {
		res.json(dmkRp.getResponse(2));
		conn.end();
		return;	
	}

	var conn = abbDb.connection;
	flow(function() {
		conn.query('SELECT teacher_uid, route_id FROM bus, bus_route WHERE bus.id = bus_route.bid AND bus_route.id = ?', [ req.params.rid ] , function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				this.break(3);
				return;
			}

			if(rows[0].teacher_uid != 0 || rows[0].route_id != 0) {
				this.break(2009);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {

		var query = conn.query("UPDATE bus_route SET latitude = ?, longitude = ?, route_name = ? WHERE id = ?", routeParams, function(err, result) {
		
			if(err) {
				this.break(500);
				return;
			}

			this.continue(0);

		}.bind(this));
	})
	.finally(function(errCode) {
		// console.log(result);
		var payload = dmkRp.getResponse(errCode);
		if(errCode == 0) {
			payload.route = {
			id: req.params.rid,
			latitude: req.body.latitude,
			longitude: req.body.longitude,
			route_name: req.body.route_name,
			seq: req.body.seq
		};
		} else {
			payload.route = null;	
		}

		res.json(payload);
	});

	conn.end();

});


router.delete('/routes/:rid', function(req, res, next) {
	
	var routeParams = [ req.params.rid ];

	if(req.params.rid == 0) {
		dmkRp.getReponse(2);
		conn.end();
		return;
	}

	var bTransaction = false;
	var conn = abbDb.connection;
	flow(function() {

		conn.query('SELECT teacher_uid, route_id, bus_route.seq FROM bus, bus_route WHERE bus.id = bus_route.bid AND bus_route.id = ?', [ req.params.rid ], function(err, rows) {

			if(err) {
				console.log(err);
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				this.break(3);
				return;
			}

			if(rows[0].teacher_uid != 0 || rows[0].route_id != 0) {
				this.break(2009);
				return;
			}

			this.continue(rows[0].seq);

		}.bind(this));

	})
	.then(function(routeSequence) {

		conn.query('START TRANSACTION', function(err, result) {

			if(err) {
				console.log(err);
				this.break(500);
				return;
			}

			// Pass param
			bTransaction = true;
			this.continue(routeSequence);

		}.bind(this));

	})
	.then(function(routeSequence) {

		conn.query('DELETE FROM bus_route WHERE id = ? AND seq = ?', [ req.params.rid, routeSequence ], function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			if(result.info.affectedRows != 1) {
				this.break(1);
				return;
			}

			this.continue(routeSequence);

		}.bind(this));

	})
	.then(function(routeSequence) {

		conn.query('UPDATE bus_route SET seq = seq - 1 WHERE seq > ?', [ routeSequence ], function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue(0);
		}.bind(this));

	})
	.finally(function(errCode) {

		if(errCode != 0 && bTransaction) {
			conn.query('ROLLBACK', function(err, result) {
				res.json(dmkRp.getResponse(errCode));
			});
			
		} else if(errCode == 0) {
			conn.query('COMMIT', function(err, result) {

				res.json(dmkRp.getResponse(errCode));

			});
		} else {

			res.json(dmkRp.getResponse(errCode));

		}
		

	});

	conn.end();

});

router.get('/routes/:routeid/children', function(req, res, next) {

	var conn = abbDb.connection;
	
	flow(function() {
		conn.query('SELECT type FROM bus, bus_route WHERE bus_route.id = ? AND bus.id = bus_route.bid', [ req.params.routeid ],
		 function(err, types) {
			if(err) {
				this.break(500);
			} else if(!utillib.isArray(types) || types.length != 1) {
				this.break(1);
			} else {
				this.continue(Number(types[0].type));
			}

		}.bind(this));
	})
	// Insert to commute_history table from child table if not exists
	.then(function(commuteType) {
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
			AND %s = %d', commuteType, commuteType, routeColName, commuteType);

		conn.query(querystr, function(err, result) {
			if(err) {
				//console.log(err);
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
				SELECT * FROM commute_history, child \
				WHERE commute_type = %d AND commute_date = CURDATE() AND commute_history.child_id = child.id AND %s = %d'
			, commuteType, routeColName, req.params.routeid);
		conn.query(querystr, function(err, rows) {
			if(err) {
				
				this.break(500);
			} else {
				this.continue(0, rows);
			}
		}.bind(this));
	})
	.finally(function(errCode, children) {

		var payload = dmkRp.getResponse(errCode);
		if(errCode == 0) {
			payload.children = children;
		}
		res.json(payload);
	});	
	
	conn.end();
});


router.post('/:bid/routes/:routeid/startby/:uid', function(req, res, next) {

	var conn = abbDb.connection;

	flow(function() {
		// 현재 버스 운행정보 확인
		conn.query('SELECT * FROM bus WHERE id = ?', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				this.break(2011);
				return;
			}

			if(rows[0].teacher_uid != 0 && rows[0].teacher_uid != req.params.uid) {
				// Invalid teacher. No authority
				this.break(2005);
				return;
			}

			this.continue(rows[0]);


		}.bind(this));
	})
	.then(function(currentBus) {

		conn.query('SELECT * FROM bus_route WHERE bid = ? ORDER BY seq', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length == 0) {
				// No route
				this.break(2011);
				return;
			}

			this.continue(currentBus, rows);

		}.bind(this));
	})
	.then(function(currentBus, routeList) {
		
		var currentRoute = null;
		var reqRoute = null;

		for(var i = 0; i < routeList.length; i++) {
			if(routeList[i].id == currentBus.route_id) {
				currentRoute = routeList[i];
			}

			if(routeList[i].id == req.params.routeid) {
				reqRoute = routeList[i];
			}
		}

		if(reqRoute == null) {
			this.break(2012);
			return;
		}

		console.log(currentRoute);
		console.log(reqRoute)
		if(currentRoute != null && Number(currentRoute.seq) + 1 != Number(reqRoute.seq)) {
			this.break(2013);
			return;
		}

		if(currentRoute == null && Number(reqRoute.seq) != 1) {
			this.break(2013);
			return;
		}

		this.continue(reqRoute.id);
		

	})
	.then(function(routeID) {

		conn.query('UPDATE bus SET teacher_uid = ?, route_id = ? WHERE id = ?', [ req.params.uid, routeID, req.params.bid ], function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue(0);

		}.bind(this));
	})
	.finally(function(errCode) {

		res.json(dmkRp.getResponse(errCode));
	});

	conn.end();

});

router.delete('/:bid/finishby/:uid', function(req, res, next) {

	var conn = abbDb.connection;

	flow(function() {

		// 현재 버스 운행정보 확인
		conn.query('SELECT * FROM bus WHERE id = ?', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length == 0) {
				this.break(2011);
				return;
			}

			if(rows[0].teacher_uid != 0 && rows[0].teacher_uid != req.params.uid) {
				// Invalid teacher. No authority
				this.break(2005);
				return;
			}

			this.continue(rows[0]);


		}.bind(this));

	})
	.then(function(currentBus) {

		// routeList
		conn.query('SELECT * FROM bus_route WHERE bid = ? ORDER BY seq', [ req.params.bid ], function(err, rows) {

			if(err) {
				this.break(500);
				return;
			}

			if(rows.length == 1) {
				// No route
				this.break(1);
				return;
			}

			this.continue(currentBus, rows);

		}.bind(this));
	})
	.then(function(currentBus, routeList) {

		var currentRoute = null;

		for(var i = 0; i < routeList.length; i++) {
			if(routeList[i].id == currentBus.route_id) {
				currentRoute = routeList[i];
			}
		}

		if(currentRoute == null) {
			this.break(3);
			return;
		}

		if(Number(currentRoute.seq) != Number(routeList[routeList.length - 1].seq)) {
			// Remain routes
			this.break(2014);
			return;
		}

		this.continue(0);

	})
	.then(function() {

		// Update to DB
		conn.query('UPDATE bus SET teacher_uid = 0, route_id = 0 WHERE id = ?', [ req.params.bid ], function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue(0);

		}.bind(this));
	})
	.finally(function(errCode) {

		res.json(dmkRp.getResponse(errCode));
	});

	conn.end();

});


module.exports = router;