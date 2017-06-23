var express = require('express');
var router = express.Router();

var aws = require('aws-sdk');
var multerS3 = require('multer-s3');

aws.config.update({
secretAccessKey: '4n/EzMX8nTcTOG3LQSCvwUzSGs2J+D+Vte7TY6tL',
accessKeyId: 'AKIAJPACEPUSNEAEQOPA',
region: 'ap-northeast-2'
});

//var app = express(),
var s3 = new aws.S3();

var multer = require('multer');
var upload = multer({
   storage: multerS3({
      s3: s3,
      bucket: 'abuba-file',
      metadata: function (req, file, cb) {
         cb(null, {fieldName: file.fieldname});
      },
      key: function (req, file, cb) {
         cb(null, 'images/'+Date.now().toString()+'.'+file.originalname.split(/[ .]+/).pop());
      }
   })
});

var flow = require('finally');
var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");
var utillib = require('util');
var url = require('url');

// DMK Modules
var dmkRp = require('../src/dmkResponse.js');
var dmkParamChecker = require("../src/dmkParamChecker.js");
var abbDb = require('../src/abbdb.js');
var resMsg = require('../src/ResponseMsg.js');
var dmklib = require('../src/dmklib.js');

/* GET users listing. */
router.get('/', function(req, res, next) {
	res.send('parents page');
});

router.get('/children/:cid/busses/:bid/commute', function(req, res, next) {

	if(req.params.bid == 0 || req.params.cid == 0) {
		res.json(dmkRp.getResponse(2));
		return;
	}

	var conn = abbDb.connection;
	flow(function() {

		conn.query('SELECT type FROM bus WHERE id = ?', [ req.params.bid ], function(err, types) {
			if(err) {
				this.break(500);
			} else if(types.length == 0) {

				this.break(1);
			} else {
				this.continue(types[0].type);
			}

		}.bind(this));

	})
	.then(function(commuteType) {

		var columnName = commuteType == 1 ? 'routeid_departure' : 'routeid_arrival';
		var querystr = utillib.format(
		'INSERT INTO commute_history (child_id, commute_type, commute_date) \
		SELECT child.id, %d, CURDATE() FROM child \
		WHERE NOT EXISTS \
		( \
		SELECT * FROM commute_history \
		WHERE child.id = commute_history.child_id AND commute_history.commute_date = CURDATE() AND commute_history.commute_type = %d \
		) AND child.id = %d', commuteType, commuteType, req.params.cid);

		conn.query(querystr, function(err, result) {
			if(err) {

				this.break(500);
			} else {
				this.continue(commuteType);
			}
		}.bind(this));

	})
	.then(function(commuteType) {

		conn.query('SELECT * FROM commute_history WHERE child_id = ? AND commute_type = ? AND commute_date = CURDATE()',
			[ req.params.cid, commuteType ], function(err, rows) {
				console.log(rows);
				if(err) {
					this.break(500);
				} else if(rows.length != 1) {
					this.break(1);
				} else {
					this.continue(0, rows[0]);
				}

			}.bind(this));

	})
	.finally(function(errCode, commuteInfo) {

		var payload = dmkRp.getResponse(errCode);
		payload.commuteInfo = commuteInfo;
		res.json(payload);

	});

	conn.close();

});


router.put('/children/:cid/busses/:bid/commute', function(req, res, next) {
	/*
	{
		'nonboard_reason' : '이유 없습니다',
		'nonboard_reason_type' : '3'
	}
	*/
	if(typeof req.body.nonboard_reason_type == 'undefined' || req.body.nonboard_reason_type == null
			|| typeof req.body.nonboard_reason == 'undefined') {
		res.json(dmkRp.getResponse(2));

		return;
	}

	var conn = abbDb.connection;
	flow(function() {

		conn.query('SELECT type FROM bus WHERE id = ?', [ req.params.bid ], function(err, types) {
			if(err) {
				this.break(500);
			} else if(types.length == 0) {
				this.break(1);
			} else {
				this.continue(Number(types[0].type));
			}

		}.bind(this));

	})
	.then(function(commuteType) {

		conn.query('UPDATE commute_history SET nonboard_reason_type = ?, nonboard_reason = ? WHERE child_id = ?',
			[ req.body.nonboard_reason_type, req.body.nonboard_reason, req.params.cid ],
			function(err, result) {
				if(err) {
					this.break(500);
				} else if(result.info.affectedRows == 0) {
					// this.break(1);
					this.continue(0);
				} else {
					this.continue(0);
				}
			}.bind(this));

	})
	.finally(function(errCode) {

		var payload = dmkRp.getResponse(errCode);
		res.json(payload);

	});

	conn.end();

});

router.get('/children/:cid/busses', function(req, res, next) {

	var conn = abbDb.connection;
	flow(function() {

		var querystr = 'SELECT bus.id AS bus_id, route_id AS route_id, bus.name, bus.type, bus.number, bus.driver_name, bus_route.id, bus_route.route_name, bus_route.latitude, bus_route.longitude FROM child, bus, bus_route \
			WHERE bus.id = bus_route.bid AND child.id = ? AND \
			(child.routeid_departure = bus_route.id OR child.routeid_arrival = bus_route.id)';

		conn.query(querystr, [ req.params.cid ], function(err, busList) {
			if(err) {

				this.break(500);
			} else {

				this.continue(0, busList);
			}
		}.bind(this));

	})
	.finally(function(errCode, busList) {
		var payload = dmkRp.getResponse(errCode);
		if(errCode == 0) {
			payload.busses = busList;
		}

		res.json(payload);
	});

	conn.close();
});

// 원 가입 신청
router.post('/:uid/children/:cid/preschool/:pid', function(req, res, next) {

	var conn = abbDb.connection;
	var query = conn.query("UPDATE child SET last_updated = CURDATE(), preschool_id = ? WHERE id = ?", [ req.params.pid, req.params.cid ], function(err, result) {

		if(err) {
			res.json(dmkRp.getResponse(500));
			return;
		}

		res.json(dmkRp.getResponse(0));

	});

	conn.end();

});

router.get('/:uid/children', function(req, res, next) {

	var conn = abbDb.connection;
	var queryParams = [ req.params.uid ];

	flow(function() {

    var query = conn.query("SELECT A.id, A.name, A.birthday, A.preschool_id, A.class_id, A.approval_state, C.name as class_name, D.name as preschool_name " +
    	"FROM child A " +
      "JOIN parent_child B " +
      "ON A.id = B.child_id " +
      "LEFT OUTER JOIN class C " +
      "ON A.class_id = C.id " +
      "LEFT OUTER JOIN preschool D " +
      "ON A.preschool_id = D.id " +
    	"WHERE B.parent_uid = ?", queryParams, function(err, result) {

    // var query = conn.query("SELECT child.id, child.name, child.birthday, child.preschool_id, child.class_id, child.approval_state " +
		// 	"FROM child, parent_child " +
		// 	"WHERE child.id = parent_child.child_id AND parent_child.parent_uid = ?", queryParams, function(err, result) {

			if(err) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;
			}

			var rp = dmkRp.getResponse(0);
			rp.children = result;

			res.json(rp);
			this.continue();

		}.bind(this));
	})
	.finally(function() {
		conn.close();
	});

});

router.post('/:uid/children', function(req, res, next) {

	var paramChecker = dmkParamChecker.getParamChecker();
	var params = [ req.body.name, req.body.relation, req.body.birthday, req.body.gender ];

	if(!paramChecker.nullChecker(params)) {
		res.json(dmkRp.getResponse(2));
		console.log(params);
		return;
	}

	var conn = abbDb.connection;
	flow(function() {
		conn.query('START TRANSACTION', function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {
		var param = [ req.body.name, req.body.birthday, req.body.gender ];
		conn.query("INSERT INTO child(name, birthday, gender) VALUES(?, ?, ?)", param, function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue(result.info.insertId);

		}.bind(this));
	})
	.then(function(childId) {
		res.childId = childId;	// Cache

		var param = [ req.body.relation, null, req.params.uid, childId ];
		conn.query("INSERT INTO parent_child VALUES(NULL, ?, ?, ?, ?)", param, function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {

		conn.query('COMMIT', function(err, result) {

			if(err) {
				this.break(500);
				return;
			}

			this.continue();

		}.bind(this));
	})
	.then(function() {
		conn.query('SELECT * FROM child WHERE id = ?', [ res.childId ] , function(err, rows) {
			if(err) {
				this.break(500);
				return;
			}

			this.continue(0, rows[0]);

		}.bind(this));
	})
	.finally(function(errorCode, child) {

		var payload = dmkRp.getResponse(errorCode);
		payload.child = null;
		if(errorCode == 0) {
			payload.child = child;
		}

		if(errorCode != 0) {
			flow(function() { conn.query('ROLLBACK', this.continue); })
			.finally(function() {
				res.json(payload);
				conn.end();
			})

		} else {

			res.json(payload);
			conn.end();
		}

	});

});

router.delete('/:uid/children/:cid', function(req, res, next) {

	// parent_child 테이블의 child_id 와 child 테이블의 PK 는 Casecade
	var routeParams = [ req.params.cid ];
	var conn = abbDb.connection;
	var query = conn.query("DELETE FROM parent_child WHERE child_id = ?", routeParams, function(err, result) {

		if(err) {
			res.json(dmkRp.getResponse(500));
			return;
		}

		if(result.info.affectedRows == 0) {
			res.json(dmkRp.getResponse(1));
			return;
		}

		res.json(dmkRp.getResponse(0));

	});

	conn.close();

});

router.put('/:uid/children/:cid', function(req, res, next) {

	var paramChecker = dmkParamChecker.getParamChecker();
	var params = [ req.body.name, req.body.birthday ];

	if(!paramChecker.nullChecker(params)) {
		res.json(dmkRp.getResponse(2));
		return;
	}

	if(!paramChecker.isValidDate(req.body.birthday)) {
		res.json(dmkRp.getResponse(2));
		return;
	}

	var conn = abbDb.connection;
	var dbParams = [ req.body.name, req.body.birthday, req.params.cid ];
	flow(function() {
		var query = conn.query("UPDATE child SET name = ?, birthday = ? WHERE id = ?", dbParams, function(err, result) {

			if(err) {
				res.json(dmkRp.getResponse(500));
				this.break();
				return;
			}

			console.log(result);
			var rp = dmkRp.getResponse(0);
			rp.child = {
				id : req.params.cid,
				name : req.body.name
			};

			res.json(rp);
			this.continue();

		}.bind(this));
	})
	.finally(function() {
		conn.close();
	});

});

//투약 의뢰서 추가
var mediPicUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'sign', maxCount: 1 }])
router.post('/mediRequest', mediPicUpload, function(req, res, next) {

  var conn = abbDb.connection;
  var err;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_date_insert_id;
	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;

  flow(function () {
		conn.query('START TRANSACTION', function (err, result) {

				 if (err) {
						resultMessage.statusCode = 600;
						this.break(err);
				 }
				 else{
						this.continue(err);
				 }
			}.bind(this));
	})
  .then(function(err){
			var paramList = [req.body.symptom, req.body.medicine, req.body.dosage];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	.then(function(err){

    var date_time = dmklib.getWorldTime(+9);
		var year = date_time.substring(0,4);
		var month = date_time.substring(5,7);
		var day = date_time.substring(8,10);
		var hour = date_time.substring(11,13);
		var min = date_time.substring(14,16);
		var sec = date_time.substring(17,19);

		var image_query = 'INSERT INTO date (year, month, day, hour, min, sec) ' +
											'VALUES (' + Number(year) + ', ' + Number(month) + ', ' + Number(day) + ', ' + Number(hour) + ', ' + Number(min) + ', ' + Number(sec) + ')';
    var query = conn.query(image_query, function (err, result) {

			if (err) {
				resultMessage.statusCode = 601;
				this.break(err);
			}
			else{
				last_date_insert_id = Number(result.info.insertId);
				this.continue(err);
			}
		}.bind(this));
	})
	.then(function (err) {
    var photo_id;
    if(req.body.photo_id == undefined  || req.body.photo_id == -1) {
      photo_id = null;
    }
    else {
      photo_id = req.body.photo_id;
    }

		var req_medi_query = 'INSERT INTO request_medi (author_id, child_id, class_id, date, symptom, medicine, ' +
															'dosage, injection_time, storage_method, photo, sign, ' +
															'confirm, confirm_time, confirm_person, etc) VALUES('
														+ req.body.author_id + ',' + req.body.child_id + ',' + req.body.class_id + ',"'
														+ last_date_insert_id + '","' + req.body.symptom + '","' + req.body.medicine + '","'
														+ req.body.dosage + '","' + req.body.injection_time + '","' + req.body.storage_method  + '",'
														+ photo_id + ',' + req.body.sign_id + ',"' + req.body.confirm  + '","'
														+ req.body.confirm_time + '","' + req.body.confirm_person + '","' + req.body.etc+ '")';

    console.log(req_medi_query);
    var query = conn.query(req_medi_query, function (err, result) {
				if (err) {
					resultMessage.statusCode = 601;
					this.break(err);
				}
				else{
          last_request_insert_id = Number(result.info.insertId);
					this.continue(err);
				}
		}.bind(this));
	})
	.finally(function(err){
		if(err){
      var query = conn.query('ROLLBACK', function (err, rows) {
				error_log.error(ip + ", role" + ", ID" + ", '/parents/mediRequest'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}else{
      var query = conn.query('COMMIT', function(err,rows) {
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/mediRequest'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
    	});
		}
	});

	conn.close();
});

//투약 의뢰서 수정
var mediPicUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'sign', maxCount: 1 }])
router.put('/mediRequest/:mediRequest_num', mediPicUpload, function(req, res, next) {

  var conn = abbDb.connection;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;

	var photo_id;
	var sign_id;

	flow(function () {
		conn.query('START TRANSACTION', function (err, result) {

				 if (err) {
						resultMessage.statusCode = 600;
						this.break(err);
				 }
				 else{
						this.continue(err);
				 }
			}.bind(this));
	})
	.then(function(err){
			var paramList = [req.body.symptom, req.body.medicine, req.body.dosage, req.params.mediRequest_num];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id, req.params.mediRequest_num];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	//해당 문서 업데이트 (update)
	.then(function (err) {

		var update_medi_query = 'UPDATE request_medi SET author_id = ' + req.body.author_id + ', ' +
																										'child_id = ' + req.body.child_id + ', ' +
																										'class_id = ' + req.body.class_id + ', ' +
																										'symptom = "' + req.body.symptom + '", ' +
																										'medicine = "' + req.body.medicine + '", ' +
																										'dosage = "' + req.body.dosage + '", ' +
																										'injection_time = "' + req.body.injection_time + '", ' +
																										'storage_method = "' + req.body.storage_method + '", ' +
																										'photo = ' + req.body.photo_id + ', ' +
																										'sign = ' + req.body.sign_id + ', ' +
//																										'confirm = ' + req.body.confirm + ', ' +
																										'confirm_time = "' + req.body.confirm_time + '", ' +
																										'confirm_person = "' + req.body.confirm_person + '", ' +
																										'etc = "' + req.body.etc + '" ' +
																									'WHERE id = ' + req.params.mediRequest_num;
		var query = conn.query(update_medi_query, function (err, result) {
				if (err) {
					resultMessage.statusCode = 602;
					this.break(err);
				}
				else{

					this.continue(err);
				}
		}.bind(this));
	})
	.finally(function(err){
		if(err){
			var query = conn.query('ROLLBACK', function (err, rows) {
				error_log.error(ip + ", role" + ", ID" + ", '/parents/mediRequest/:mediRequest_num'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});

		}else{
			var query = conn.query('COMMIT', function(err,rows) {
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/mediRequest/:mediRequest_num'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}
	});

	conn.close();
});

//투약 의뢰서 삭제
router.delete('/mediRequest/:mediRequest_num', function(req, res, next) {

  var conn = abbDb.connection;
  var err;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;

  flow(function () {
			var paramList = [req.params.mediRequest_num];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [req.params.mediRequest_num];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	//해당 문서 삭제 (delete)
	.then(function(err){

		// 1. request_medi 에 있는 내용을 삭제하고, (이때, req_medi_image, image 테이블에 있는 내용도 cascade로 삭제되는지 확인해야함.)
		var del_req_medi_query = 'DELETE FROM request_medi WHERE id ="' + req.params.mediRequest_num + '"';
		var query = conn.query(del_req_medi_query, function (err, result) {

			if (err) {
				resultMessage.statusCode = 603;
				this.break(err);
			}
			else{
				this.continue(err);
			}
		}.bind(this));

	})
	.finally(function(err){
		if(err){
				error_log.error(ip + ", role" + ", ID" + ", '/parents/mediRequest/:mediRequest_num'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);

		}else{
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/mediRequest/:mediRequest_num'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
		}
	});

	conn.close();
});

//투약 의뢰서 목록 조회 (부모)
router.get('/mediRequests/preschool/:pid/user/:uid', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var resultValuesList = [];
    var resultValues;

    flow(function() {
        var paramList = [req.params.pid, req.params.uid];

        if (paramChecker.nullChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 800;
            err = 'parameter null or undefined';
            this.break(err);
        }
    })
    .then(function(err) {
        var paramList = [req.params.pid, req.params.uid];

        if (paramChecker.numericChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 700;
            err = 'wrong parameter type';
            this.break(err);
        }
    })
    .then(function(err) {
        var sql_stmt = 'SELECT A.id as req_med_id, A.child_id, A.class_id, A.symptom, A.confirm, A.date, B.name as class_name, C.name as child_name ' +
										   'FROM request_medi A ' +
											 'JOIN class B ' +
											 'ON A.class_id = B.id ' +
											 'JOIN child C ' +
											 'ON A.child_id = C.id ' +
            					 'WHERE author_id = ' + req.params.uid;

        var query = conn.query(sql_stmt, function(err, result) {

            if (err) {
                resultMessage.statusCode = 604;
                this.break(err);
            } else {
  							for (k = 0; k < result.length; k++) {
                		resultValues = result[k];
                    resultValuesList.push(resultValues);
                }
								this.continue(err);
            }
        }.bind(this));
    })
    .then(function(err) {

        if (resultValuesList.length == 0) {
            this.continue(err);

				} else {
            var index = 0;
						var date;

						for (p = 0; p < resultValuesList.length; p++) {
								var sql_stmt = 'SELECT year, month, day, hour, min, sec FROM date WHERE id = ' + resultValuesList[p].date;

                var query = conn.query(sql_stmt, function(err, result) {

								    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
												date = result[0].year + "-" + result[0].month + "-" + result[0].day + " "
															+ result[0].hour + ":" + result[0].min + ":" + result[0].sec;

                        resultValuesList[index].date = date;
                        index++;

                        if (index == resultValuesList.length) {
                            resultMessage.result = resultValuesList;

                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        }
    })
    .finally(function(err) {
        if (err) {
            error_log.error(ip + ", role" + ", ID" + ", '/parents/mediRequests/preschool/:pid/user/:uid'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);
        } else {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/parents/mediRequests/preschool/:pid/user/:uid'" + ", " + req.method + ", " + req.headers['content-length']);
            res.json(resultMessage);
        }
    });

    conn.close();
});

//귀가 동의서 추가
var retPicUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'sign', maxCount: 1 }]);
router.post('/returnRequest', retPicUpload, function(req, res, next) {

  var conn = abbDb.connection;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;
	var last_date_insert_id;

	flow(function () {
		conn.query('START TRANSACTION', function (err, result) {

				 if (err) {
						resultMessage.statusCode = 600;
						this.break(err);
				 }
				 else{
						this.continue(err);
				 }
			}.bind(this));
	})
	.then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	.then(function(err){

    var date_time = dmklib.getWorldTime(+9);
		var year = date_time.substring(0,4);
		var month = date_time.substring(5,7);
		var day = date_time.substring(8,10);
		var hour = date_time.substring(11,13);
		var min = date_time.substring(14,16);
		var sec = date_time.substring(17,19);

		var image_query = 'INSERT INTO date (year, month, day, hour, min, sec) ' +
											'VALUES (' + Number(year) + ', ' + Number(month) + ', ' + Number(day) + ', ' + Number(hour) + ', ' + Number(min) + ', ' + Number(sec) + ')';
		var query = conn.query(image_query, function (err, result) {

			if (err) {
				resultMessage.statusCode = 601;
				this.break(err);
			}
			else{
				last_date_insert_id = Number(result.info.insertId);
				this.continue(err);
			}
		}.bind(this));
	})
	.then(function (err) {
    var photo_id;
    if(req.body.photo_id == undefined || req.body.photo_id == -1) {
      photo_id = null;
    }
    else {
      photo_id = req.body.photo_id;
    }

		var req_ret_query = 'INSERT INTO request_returning (author_id, child_id, class_id, date, confirm, companion, ' +
															'returning_time, reason, contact, photo, ' +
															'sign, confirm_time, confirm_person, etc) VALUES('
														+ req.body.author_id + ',' + req.body.child_id + ',' + req.body.class_id + ',"'
														+ last_date_insert_id + '","' + req.body.confirm + '","' + req.body.companion + '","'
														+ req.body.returning_time + '","' + req.body.reason + '","' + req.body.contact  + '",'
														+ photo_id + ',' + req.body.sign_id + ',"' + req.body.confirm_time  + '","'
														+ req.body.confirm_person + '","' + req.body.etc+ '")';

    console.log(req_ret_query);
		var query = conn.query(req_ret_query, function (err, result) {
			if (err) {
				resultMessage.statusCode = 601;
				this.break(err);
			}
			else{
				last_request_insert_id = Number(result.info.insertId);
				this.continue(err);
			}
		}.bind(this));
	})
	.finally(function(err){
		if(err) {
			var query = conn.query('ROLLBACK', function (err, rows) {
				error_log.error(ip + ", role" + ", ID" + ", '/parents/returnRequest'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});

		} else {
			var query = conn.query('COMMIT', function(err,rows) {
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/returnRequest'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}
	});

	conn.close();
});

//귀가 동의서 수정
var retPicUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'sign', maxCount: 1 }]);
router.put('/returnRequest/:returnRequest_num', retPicUpload, function(req, res, next) {

  var conn = abbDb.connection;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;

	var photo_id;
	var sign_id;

	flow(function () {
		conn.query('START TRANSACTION', function (err, result) {

			if (err) {
				this.break(err);
			}
			else{
				this.continue(err);
			}
		}.bind(this));
	})
	.then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id, req.params.returnRequest_num];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [req.body.author_id, req.body.child_id, req.body.class_id, req.params.returnRequest_num];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	//해당 문서 업데이트 (update)
	.then(function (err) {
		var update_ret_query = 'UPDATE request_returning SET author_id = ' + req.body.author_id + ', ' +
																												'child_id = ' + req.body.child_id + ', ' +
																												'class_id = ' + req.body.class_id + ', ' +
																												'companion = "' + req.body.companion + '", ' +
																												'reason = "' + req.body.reason + '", ' +
																												'contact = "' + req.body.contact + '", ' +
																												'returning_time = "' + req.body.returning_time + '", ' +
																												'photo = ' + req.body.photo_id + ', ' +
																												'sign = ' + req.body.sign_id + ', ' +
//																												'confirm = ' + req.body.confirm + ', ' +
																												'confirm_time = "' + req.body.confirm_time + '", ' +
																												'confirm_person = "' + req.body.confirm_person + '", ' +
																												'etc = "' + req.body.etc + '" ' +
																										'WHERE id = ' + req.params.returnRequest_num;

		var query = conn.query(update_ret_query, function (err, result) {
				if (err) {
					resultMessage.statusCode = 602;
					this.break(err);
				}
				else{
				//	last_request_insert_id = Number(result.info.insertId);
					this.continue(err);
				}
		}.bind(this));
	})
	.finally(function(err){
		if(err){
			var query = conn.query('ROLLBACK', function (err, rows) {
				error_log.error(ip + ", role" + ", ID" + ", '/parents/returnRequest/:returnRequest_num'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}else{
			var query = conn.query('COMMIT', function(err,rows) {
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/returnRequest/:returnRequest_num'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}
	});

	conn.close();
});

//귀가 동의서 삭제
router.delete('/returnRequest/:returnRequest_num', function(req, res, next) {

  var conn = abbDb.connection;
  var err;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	var last_photo_insert_id;
	var last_sign_insert_id;
	var last_request_insert_id;

  flow(function () {
		var paramList = [req.params.returnRequest_num];

		if(paramChecker.nullChecker(paramList)){
			 this.continue(err);

		} else {
			 resultMessage.statusCode = 800;
			 err = 'parameter null or undefined';
			 this.break(err);
		}
 })
 .then(function(err){
		var paramList = [req.params.returnRequest_num];

		if(paramChecker.numericChecker(paramList)){
			 this.continue(err);

		} else {
			 resultMessage.statusCode = 700;
			 err = 'wrong parameter type';
			 this.break(err);
		}
 })
	//해당 문서 삭제 (delete)
	.then(function(error){

		// 1. request_returning 에 있는 내용을 삭제하고, (이때, req_ret_image, image 테이블에 있는 내용도 cascade로 삭제되는지 확인해야함.)
		var del_req_ret_query = 'DELETE FROM request_returning WHERE id ="' + req.params.returnRequest_num + '"';
		var query = conn.query(del_req_ret_query, function (err, result) {

			if (err) {
				resultMessage.statusCode = 603;
				this.break(err);
			}
			else{
				this.continue(err);
			}
		}.bind(this));

	})
	.finally(function(err){
		if(err){
			error_log.error(ip + ", role" + ", ID" + ", '/returnRequest/:returnRequest_num'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
			res.json(resultMessage);

		}else{
			resultMessage.statusCode = 0;
			operation_log.info(ip + ", role" + ", ID" + ", '/returnRequest/:returnRequest_num'" + ", " + req.method + ", " + req.headers['content-length']);
			res.json(resultMessage);
		}
	});

	conn.close();
});

//귀가 동의서 목록 조회 (부모)
router.get('/returnRequests/preschool/:pid/user/:uid', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var resultValuesList = [];
    var resultValues;

    flow(function() {
        var paramList = [req.params.pid, req.params.uid];

        if (paramChecker.nullChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 800;
            err = 'parameter null or undefined';
            this.break(err);
        }
    })
    .then(function(err) {
        var paramList = [req.params.pid, req.params.uid];

        if (paramChecker.numericChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 700;
            err = 'wrong parameter type';
            this.break(err);
        }
    })
    .then(function(err) {
        var sql_stmt = 'SELECT A.id as id, A.child_id, A.class_id, A.companion, A.confirm, A.date, B.name as class_name, C.name as child_name ' +
										   'FROM request_returning A ' +
											 'JOIN class B ' +
											 'ON A.class_id = B.id ' +
											 'JOIN child C ' +
											 'ON A.child_id = C.id ' +
            					 'WHERE author_id = ' + req.params.uid;

        var query = conn.query(sql_stmt, function(err, result) {

            if (err) {
                resultMessage.statusCode = 604;
                this.break(err);
            } else {
  							for (k = 0; k < result.length; k++) {
                		resultValues = result[k];
                    resultValuesList.push(resultValues);
                }
								this.continue(err);
            }
        }.bind(this));
    })
    .then(function(err) {

        if (resultValuesList.length == 0) {
            this.continue(err);

				} else {
            var index = 0;
						var date;

						for (p = 0; p < resultValuesList.length; p++) {
								var sql_stmt = 'SELECT year, month, day, hour, min, sec FROM date WHERE id = ' + resultValuesList[p].date;
                var query = conn.query(sql_stmt, function(err, result) {

								    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
												date = result[0].year + "-" + result[0].month + "-" + result[0].day + " "
															+ result[0].hour + ":" + result[0].min + ":" + result[0].sec;

                        resultValuesList[index].date = date;
                        index++;

                        if (index == resultValuesList.length) {
                            resultMessage.result = resultValuesList;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        }
    })
    .finally(function(err) {
        if (err) {
            error_log.error(ip + ", role" + ", ID" + ", '/parents/returnRequests/preschool/:pid/user/:uid'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);

        } else {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/parents/returnRequests/preschool/:pid/user/:uid'" + ", " + req.method + ", " + req.headers['content-length']);
            res.json(resultMessage);
        }
    });

    conn.close();
});

//출석부 결석 신청 (학부모)
router.post('/preschool/:pid/class/:cid/attendance/child/:child_id', function(req, res, next) {

  var conn = abbDb.connection;

	var resultMessage = {
			statusCode : {},
			result : {}
	};

	var ip = req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress ||
				req.socket.remoteAddress ||
				req.connection.socket.remoteAddress;

	var paramChecker = dmkParamChecker.getParamChecker();

	flow(function () {
		conn.query('START TRANSACTION', function (err, result) {

				 if (err) {
						resultMessage.statusCode = 600;
						this.break(err);
				 }
				 else{
						this.continue(err);
				 }
			}.bind(this));
	})
	.then(function(err){
			var paramList = [];

			if(paramChecker.nullChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 800;
				 err = 'parameter null or undefined';
				 this.break(err);
			}
	 })
	 .then(function(err){
			var paramList = [];

			if(paramChecker.numericChecker(paramList)){
				 this.continue(err);

			} else {
				 resultMessage.statusCode = 700;
				 err = 'wrong parameter type';
				 this.break(err);
			}
	 })
	.then(function(err){

			var absence_query = 'INSERT INTO request_absence (preschool_id, class_id, child_id, start_time, end_time, absence_type, reason) ' +
                        'VALUES (' + req.params.pid + ', ' + req.params.cid + ', ' + req.params.child_id + ', "' + req.body.startTime + '", "' + req.body.endTime + '", ' + req.body.absenceType + ', "' + req.body.reason + '")';
			var query = conn.query(absence_query, function (err, result) {

				if (err) {
					resultMessage.statusCode = 601;
					this.break(err);
				}
				else{
					this.continue(err);
				}
			}.bind(this));

	})
	.finally(function(err){
		if(err) {
			var query = conn.query('ROLLBACK', function (err, rows) {
				error_log.error(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/class/:cid/attendance/child/:child_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});

		} else {
			var query = conn.query('COMMIT', function(err,rows) {
				resultMessage.statusCode = 0;
				operation_log.info(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/class/:cid/attendance/child/:child_id'" + ", " + req.method + ", " + req.headers['content-length']);
				res.json(resultMessage);
			});
		}
	});

	conn.close();
});

// 출석 숫자 조회 (월별) (학부모)
router.get('/preschool/:pid/attendCount/child/:child_id/date/:date', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var date_time = req.params.date;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var attendanceCount;
    var absenceCount;

    flow(function() {
        var paramList = [];

        if (paramChecker.nullChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 800;
            err = 'parameter null or undefined';
            this.break(err);
        }
    })
    .then(function(err) {
        var paramList = [];

        if (paramChecker.numericChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 700;
            err = 'wrong parameter type';
            this.break(err);
        }
    })
    .then(function(err) {
        var sql_stmt =  'SELECT COUNT(*) as attend_count ' +
                        'FROM attendance a ' +
                        'JOIN date b ' +
                        'ON a.date = b.id ' +
                        'WHERE child_id = ' + req.params.child_id + ' && year = ' + year + ' && month = ' + month + ' && attend = 1';

        var query = conn.query(sql_stmt, function(err, result) {

            if (err) {
                resultMessage.statusCode = 604;
                this.break(err);
            } else {
								attendanceCount = result[0].attend_count;
            		this.continue(err);
            }
        }.bind(this));
    })
    .then(function(err) {
        var sql_stmt =  'SELECT COUNT(*) as absence_count ' +
                        'FROM attendance a ' +
                        'JOIN date b ' +
                        'ON a.date = b.id ' +
                        'WHERE child_id = ' + req.params.child_id + ' && year = ' + year + ' && month = ' + month + ' && attend = 0';

        var query = conn.query(sql_stmt, function(err, result) {

            if (err) {
                resultMessage.statusCode = 604;
                this.break(err);
            } else {
								absenceCount = result[0].absence_count;
            		this.continue(err);
            }
        }.bind(this));
    })
    .finally(function(err) {
        if (err) {
            error_log.error(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/attendCount/child/:child_id/date/:date'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);

        } else {
            resultMessage.statusCode = 0;
            resultMessage.result.attendanceCount = attendanceCount;
            resultMessage.result.absenceCount = absenceCount;
            operation_log.info(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/attendCount/child/:child_id/date/:date'" + ", " + req.method + ", " + req.headers['content-length']);
            res.json(resultMessage);
        }
    });

    conn.close();
});

// 출석부 조회 (월별) (학부모)
router.get('/preschool/:pid/attendance/child/:child_id/date/:date', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var date_time = req.params.date;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var resultValuesList = [];
    var resultValues = {};

    flow(function() {
        var paramList = [];

        if (paramChecker.nullChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 800;
            err = 'parameter null or undefined';
            this.break(err);
        }
    })
    .then(function(err) {
        var paramList = [];

        if (paramChecker.numericChecker(paramList)) {
            this.continue(err);

        } else {
            resultMessage.statusCode = 700;
            err = 'wrong parameter type';
            this.break(err);
        }
    })
    .then(function(err) {
        var sql_stmt =  'SELECT A.id as attend_id, A.child_id, C.name as child_name, D.name as class_name, A.class_id, A.attend, A.reason, A.absence_type, B.year, B.month, B.day ' +
                        'FROM attendance A ' +
                        'JOIN date B ' +
                        'ON A.date = B.id ' +
                        'JOIN child C ' +
                        'ON A.child_id = C.id ' +
                        'JOIN class D ' +
                        'ON A.class_id = D.id ' +
                        'WHERE A.child_id = ' + req.params.child_id + ' && B.year = ' + year + ' && B.month = ' + month;
        var query = conn.query(sql_stmt, function(err, result) {

            if (err) {
                resultMessage.statusCode = 604;
                this.break(err);
            } else {
								for(var i=0; i<result.length; i++){
                  var resultValues = {};
                  resultValues.attend_id = result[i].attend_id;
                  resultValues.child_id = result[i].child_id;
                  resultValues.child_name = result[i].child_name;
                  resultValues.class_id = result[i].class_id;
                  resultValues.class_name = result[i].class_name;
                  resultValues.attend = result[i].attend;
                  resultValues.reason = result[i].reason;
                  resultValues.absence_type = result[i].absence_type;
                  resultValues.date = result[i].year + "-" + result[i].month + "-" + result[i].day;

                  resultValuesList.push(resultValues);
                }

                resultMessage.result = resultValuesList;
            		this.continue(err);
            }
        }.bind(this));
    })
    .finally(function(err) {
        if (err) {
            error_log.error(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/attendance/child/:child_id/date/:date'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRp.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);

        } else {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/parents/preschool/:pid/attendance/child/:child_id/date/:date'" + ", " + req.method + ", " + req.headers['content-length']);
            res.json(resultMessage);
        }
    });

    conn.close();
});


// function leadingZeros(n, digits) {
//     var zero = '';
//     n = n.toString();
//
//     if (n.length < digits) {
//         for (i = 0; i < digits - n.length; i++)
//             zero += '0';
//     }
//     return zero + n;
// }
//
// function getWorldTime(tzOffset) { // 24시간제
//     var now = new Date();
//     var tz = now.getTime() + (now.getTimezoneOffset() * 60000) + (tzOffset * 3600000);
//     now.setTime(tz);
//
//
//     var s =
//         leadingZeros(now.getFullYear(), 4) + '-' +
//         leadingZeros(now.getMonth() + 1, 2) + '-' +
//         leadingZeros(now.getDate(), 2) + ' ' +
//
//         leadingZeros(now.getHours(), 2) + ':' +
//         leadingZeros(now.getMinutes(), 2) + ':' +
//         leadingZeros(now.getSeconds(), 2);
//
//     return s;
// }

module.exports = router;
