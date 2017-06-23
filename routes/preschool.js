var express = require('express');
var router = express.Router();
var aws = require('aws-sdk');
var multerS3 = require('multer-s3');

aws.config.update({
    secretAccessKey: '4n/EzMX8nTcTOG3LQSCvwUzSGs2J+D+Vte7TY6tL',
    accessKeyId: 'AKIAJPACEPUSNEAEQOPA',
    region: 'ap-northeast-2'
});

var s3 = new aws.S3();
var multer = require('multer');
var upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: 'abuba-file',
        metadata: function(req, file, cb) {
            cb(null, {
                fieldName: file.fieldname
            });
        },
        key: function(req, file, cb) {
            console.log(file);
            cb(null, 'images/' + Date.now().toString() + '.' + file.originalname.split(/[ .]+/).pop());
        }
    })
});

var flow = require('finally');
var abbDb = require('../src/abbdb.js');
var resMsg = require('../src/ResponseMsg.js');
var url = require('url');
var mariasql = require('mariasql');
// var mariaStore = require('connect-mariasql')(express);
var date = require('date-utils');
var request = require('request');
var bodyParser = require('body-parser');
var app = express();

var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");

var dmkRes = require('../src/dmkResponse.js');
var dmkParamChecker = require("../src/dmkParamChecker.js");
var dmklib = require('../src/dmklib.js');

//-----------------------------------------------------------------------------//

//매일 한번 노드 프로세스 Kill
var killNodeSchedule = require('node-schedule');
var killNodeRule = new killNodeSchedule.RecurrenceRule();
killNodeRule.dayOfWeek = [1, 2, 3, 4, 5];
killNodeRule.hour = 01;
killNodeRule.minute = 00;

//노드 프로세스 Kill
var killNode = killNodeSchedule.scheduleJob(killNodeRule, function() {
    process.kill();
});

// 매일 새벽 1시에 출석부 추가
var schedule = require('node-schedule');
var rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [1, 2, 3, 4, 5];
rule.hour = 01;
rule.minute = 05;

//출석부 추가
var j = schedule.scheduleJob(rule, function() {

    var current_time = dmklib.getWorldTime(+9);
    var year = current_time.substring(0, 4);
    var month = current_time.substring(5, 7);
    var day = current_time.substring(8, 10);

    var child_list = [];
    var last_insert_id;
    var conn = abbDb.connection;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {
                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        // 반 설정이 되어 있는 (class_id 값이 null이 아닌), 모든 아이들 Select.
        .then(function(err) {
            var query_st = 'SELECT id as child_id, class_id FROM child WHERE class_id IS NOT NULL';
            var query = conn.query(query_st, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);

                } else {
                    for (var i = 0; i < result.length; i++) {
                        child_list.push(result[i]);
                    }
                    this.continue(err);
                }
            }.bind(this));
        })
        //오늘 날짜 date 테이블에 입력
        .then(function(err) {
            var query_st = 'INSERT INTO date(year, month, day) VALUES (' + year + ',' + month + ',' + day + ')';
            var query = conn.query(query_st, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    last_insert_id = Number(result.info.insertId);
                    this.continue(err);
                }
            }.bind(this));
        })
        //아이들 리스트 attendance 테이블에 입력
        .then(function(err) {
            var index = -1;
            for (var i = 0; i < child_list.length; i++) {

                var child_query = 'SELECT id, child_id, start_time, end_time, absence_type, reason ' +
                    'FROM request_absence ' +
                    'WHERE child_id = ' + child_list[i].child_id + ' && start_time <= "' + current_time + '" && end_time >= "' + current_time + '"';
                var query1 = conn.query(child_query, function(err, result) {

                    if (err) {
                        this.break(err);

                    } else {

                        if (result.length == 0) {
                            index++;
                            var query_st = 'INSERT INTO attendance(child_id, class_id, attend, absence_type, date) VALUES (' +
                                child_list[index].child_id + ',' + child_list[index].class_id + ',' + false + ',' + 1 + ',' + last_insert_id + ')';
                            var query2 = conn.query(query_st, function(err, result) {
                                if (err) {
                                    this.break(err);
                                }
                            }.bind(this));

                        } else {
                            index++;
                            var query_st = 'INSERT INTO attendance(child_id, class_id, attend, absence_type, date) VALUES (' +
                                child_list[index].child_id + ',' + child_list[index].class_id + ',' + true + ',' + result[0].absence_type + ',' + last_insert_id + ')';
                            var query2 = conn.query(query_st, function(err, result) {
                                if (err) {
                                    this.break(err);
                                }
                            }.bind(this));
                        }

                        if (index == (child_list.length - 1)) {
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    console.log("error!");
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    console.log("done!");
                });
            }
        });

    conn.close();
});


router.get('/:pid/users/:uid/notifications', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {

            // Need redis...
            conn.query('SELECT * FROM preschool WHERE id = ?', [req.params.pid], function(err, rows) {

                if (err) {
                    console.log(err);
                    this.break(500, null);
                    return;
                }

                if (!Array.isArray(rows) || rows.length == 0) {
                    this.break(1001, null);
                    return;
                }

                this.continue();

            }.bind(this));

        })
        .then(function() {
            conn.query('SELECT * FROM user WHERE id = ?', [req.params.uid], function(err, rows) {

                if (err) {
                    this.break(500, null);
                    return;
                }

                if (!Array.isArray(rows) || rows.length == 0) {
                    this.break(3, null);
                    return;
                }

                this.continue();

            }.bind(this));

        })
        .then(function(userType) {

            conn.query('\
            SELECT id, content_type, content_id, noti_title, noti_body, \
            sender_name, send_datetime \
            FROM noti_history WHERE preschool_id = ? AND receiver_uid = ? ORDER BY send_datetime LIMIT 20', [req.params.pid, req.params.uid], function(err, rows) {

                if (err) {

                    this.break(500);
                    return;
                }

                this.continue(0, rows);

            }.bind(this));

        })
        .finally(function(errCode, historyList) {

            var payload = dmkRes.getResponse(errCode);

            payload.histories = historyList;
            if (payload.histories == null) {
                payload.histories = new Array();
            }

            res.json(payload);
        });

    conn.end();

});

router.delete('/:pid/children/:cid', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {
            conn.query("UPDATE child SET preschool_id = null, class_id = null WHERE id = ?", [req.params.cid], function(err, result) {
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

// memo, history 수정
router.put('/:pid/children/:cid', function(req, res, next) {

    var updateParams = [
        req.body.memo,
        req.body.history,
        req.params.cid
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(updateParams)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;

    flow(function() {

            conn.query('SELECT * FROM child WHERE id = ?', [req.params.cid], function(err, rows) {

                if (err) {
                    this.break(500);
                    console.log(err);
                    return;
                }

                if (rows.length != 1) {
                    this.break(4001);
                    return;
                }

                this.continue();

            }.bind(this));
        })
        .then(function() {
            conn.query('UPDATE child SET memo = ?, history = ? WHERE id = ?', updateParams, function(err, result) {

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

router.get('/:pid/children', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {

            conn.query("SELECT \
            DISTINCT child.id AS child_id, child.name AS name, child.birthday AS birthday, \
            child.preschool_id AS preschool_id, child.class_id AS class_id, \
            user.address, \
            user.id AS parent_id, user.name AS parent_name, user.phone AS parent_phone, \
            approval_state, last_updated, memo, history, resign_text \
         FROM child, parent_child, user WHERE child.id = parent_child.child_id AND parent_child.parent_uid = user.id AND child.preschool_id = ?", [req.params.pid], function(err, rows) {
                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var payload = dmkRes.getResponse(0);
                payload.children = new Array();

                for (var i = 0; i < rows.length; i++) {

                    payload.children.push({
                        id: rows[i].child_id,
                        name: rows[i].name,
                        birthday: rows[i].birthday,
                        preschool_id: rows[i].preschool_id,
                        class_id: rows[i].class_id,
                        relation: rows[i].relation,
                        approval_state: rows[i].approval_state,
                        memo: rows[i].memo,
                        history: rows[i].history,
                        last_updated: rows[i].last_updated,
                        resign_text: rows[i].resign_text,
                        parent: {
                            id: rows[i].parent_id,
                            name: rows[i].parent_name,
                            phone: rows[i].parent_phone
                        },
                        address: rows[i].address
                    });
                }

                res.json(payload);
                this.continue();

            }.bind(this));
        })
        .finally(function() {

            conn.end();
        });

});

// 원아 가입 승인
router.put('/:pid/children/:cid/approve', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {

        var query = conn.query("UPDATE child SET last_updated = CURDATE(), approval_state = 1, resign_type = -1, resign_text = '' WHERE id = ?", [req.params.cid], function(err, result) {

            if (err) {
                this.break(500);
                return;
            }

            if (result.affectedRow == 0) {

                this.break(2);
                return;
            }

            this.continue();

        }.bind(this));

     })
    .then(function() {

        // Topic 등록
        conn.query('SELECT user.device_token FROM user, parent_child WHERE parent_child.child_id = ? AND parent_child.child_id = user.id', [ req.params.cid ], function(err, rows) {

            if(err) {
                this.break(500);
                return;

            }

            if(rows.length == 0) {
                this.break(3);
                return;
            }

            var topicName = 'preschool' + req.params.pid;
            dmklib.addFcmTopic(rows[0].device_token, topicName);
            dmklib.sendPushToUser(rows[0].device_token, null, '원아가 가입 승인 되었습니다');

            this.continue(0);

        }.bind(this));
    })
    .finally(function(errCode) {

        res.json(dmkRes.getResponse(errCode));
        conn.end();
    });

});

router.put('/:pid/children/:cid/resign', function(req, res, next) {

    var params = [
        req.body.resign_type,
        req.body.resign_text
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(params)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;
    flow(function() {
            conn.query("\
            UPDATE child SET last_updated = CURDATE(), approval_state = 2, \
            resign_type = ?, resign_text = ?, class_id = null, routeid_departure = 0, routeid_arrival = 0 \
            WHERE id = ?", [req.body.resign_type, req.body.resign_text, req.params.cid], function(err, result) {

                if (err) {

                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                if (result.affectedRow == 0) {
                    res.json(dmkRes.getResponse(1));
                    this.break();
                    return;
                }

                res.json(dmkRes.getResponse(0));
                this.contiune();

            }.bind(this));
        })
        .finally(function() {

            conn.end();
        });



})

// 교사 가입승인
router.put('/:pid/teachers/:uid/approve', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {

            var query = conn.query("UPDATE teacher SET last_updated = CURDATE(), approval_state = 1, resign_type = -1, resign_text = '' WHERE user_id = ?", [req.params.uid], function(err, result) {

                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                if (result.affectedRow == 0) {
                    res.json(dmkRes.getResponse(2));
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

router.put('/:pid/teachers/:uid/resign', function(req, res, next) {

    var params = [
        req.body.resign_type,
        req.body.resign_text
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(params)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;
    flow(function() {

            conn.query('START TRANSACTION', function(err, result) {
                if (err) {
                    this.break(500, false);
                    return;
                }

                this.continue();

            }.bind(this));
        })
        .then(function() {
            var query = conn.query("\
            UPDATE teacher SET last_updated = CURDATE(), approval_state = 2, \
            resign_type = ?, resign_text = ? \
            WHERE user_id = ?", [req.body.resign_type, req.body.resign_text, req.params.uid], function(err, result) {

                if (err) {

                    this.break(500, true);
                    return;
                }

                if (result.affectedRow == 0) {
                    this.break(500, true);
                    return;
                }

                this.continue();

            }.bind(this));
        })
        .then(function() {
            conn.query('UPDATE class SET teacher_uid = null WHERE teacher_uid = ?', [req.params.uid], function(err, result) {

                if (err) {
                    this.break(500, true);
                    return;
                }

                this.continue(0, true);

            }.bind(this));

        })
        .finally(function(errCode, isLock) {

            if (!isLock) {
                res.json(dmkRes.getResponse(errCode));
            } else {
                if (errCode == 0) {
                    var querystr = 'COMMIT';
                } else {
                    var querystr = 'ROLLBACK';
                }

                flow(function() {
                        conn.query(querystr, this.continue);
                    })
                    .finally(function(err, result) {
                        res.json(dmkRes.getResponse(errCode));
                    });
            }
        });


    conn.end();
});

/*
	Teacher List
*/
router.get('/:pid/teachers', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {
            var queryStr = "\
            SELECT user.id, teacher.approval_state, teacher.preschool_id, user.name, user.phone, user.email, last_updated, memo, history, user.birthday, user.address, resign_text \
            FROM teacher, user \
            WHERE user.id = teacher.user_id AND preschool_id = " + req.params.pid;
            conn.query(queryStr, function(err, rows) {

                if (err) {

                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var payload = dmkRes.getResponse(0);
                payload.teachers = new Array();

                for (var i = 0; i < rows.length; i++) {
                    payload.teachers.push(rows[i]);
                }

                res.json(payload);
                this.continue();

            }.bind(this));
        })
        .finally(function() {

            conn.end();
        });
});



/*
	Bus List
*/
router.get('/:pid/busses', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {
            var queryStr = "SELECT * FROM bus WHERE pid = " + req.params.pid;
            conn.query(queryStr, function(err, rows) {

                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                if (!Array.isArray(rows)) {
                    res.json(dmkRes.getResponse(1));
                    this.break();
                    return;
                }

                var r = dmkRes.getResponse(0);
                r.busses = new Array();
                for (var i = 0; i < rows.length; i++) {

                    if (typeof rows[i] === 'undefined' || rows[i] == null)
                        continue;

                    r.busses.push({
                        id: rows[i].id,
                        name: rows[i].name,
                        bus_desc: rows[i].bus_desc,
                        number: rows[i].number,
                        type: rows[i].type,

                        driver_name: rows[i].driver_name,
                        driver_phone: rows[i].driver_phone,

                        teacher_uid: rows[i].teacher_uid,
                        route_id: rows[i].route_id,

                        pid: req.params.pid
                    });
                }

                res.json(r);
                this.continue();

            }.bind(this));
        })
        .finally(function() {
            conn.end();
        });


});

/*
	Bus 등록
*/
router.post('/:pid/busses', function(req, res, next) {

    var params = [
        req.body.name,
        req.body.bus_desc,
        req.body.driver_name,
        req.body.driver_phone,
        req.body.number,
        req.body.type,
        req.params.pid
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(params)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;
    flow(function() {

            var queryStr = "INSERT INTO bus(name, bus_desc, driver_name, driver_phone, number, type, pid) VALUES(?, ?, ?, ?, ?, ?, ?)";

            conn.query(queryStr, params, function(err, result) {

                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var r = dmkRes.getResponse(0);
                r.bus = {
                    id: result.info.insertId,
                    name: req.body.name,
                    bus_desc: req.body.bus_desc,
                    number: req.body.number,
                    type: req.body.type,

                    driver_name: req.body.driver_name,
                    driver_phone: req.body.driver_phone,

                    pid: req.params.pid
                };

                res.json(r);
                this.continue();

            }.bind(this));
        })
        .finally(function() {
            conn.end();
        });


});

/*
	List of Class
*/
router.get('/:pid/classes', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {

            var queryStr = "select * from class where preschool_uid = " + req.params.pid;
            var query = conn.query(queryStr, function(err, rows) {

                if (typeof rows == undefined) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var data = new Array();
                for (var i = 0; i < rows.length; i++) {
                    data.push(rows[i]);
                }

                var r = dmkRes.getResponse(0);
                r.classes = data;
                res.json(r);
                this.continue();

            }.bind(this)); // Db callback
        })
        .finally(function() {

            conn.close();
        });
});

router.post('/:pid/classes', function(req, res, next) {

    var conn = abbDb.connection;

    if (typeof req.body.teacher_uid == 'undefined' || req.body.teacher_uid == null) {
        var queryStr = 'INSERT INTO class(name, preschool_uid, teacher_uid) VALUES(?, ?)';
        var inputParams = [
            req.body.name,
            req.params.pid,
        ];
    } else {
        var queryStr = 'INSERT INTO class(name, preschool_uid, teacher_uid) VALUES(?, ?, ?)';
        var inputParams = [
            req.body.name,
            req.params.pid,
            req.body.teacher_uid
        ];
    }

    flow(function() {

            conn.query('INSERT INTO class(name, preschool_uid, teacher_uid) VALUES(?, ?, ?)', [req.body.name, req.params.pid, req.body.teacher_uid], function(err, result) {

                if (err) {
                    console.log(err);
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var payload = dmkRes.getResponse(0);
                payload.class = {
                    id: result.info.insertId,
                        name: req.body.name,
                        teacher_uid: req.body.teacher_uid
                };

                res.json(payload);
                this.continue();

            }.bind(this));
        })
        .finally(function() {

            conn.close();
        });
});

//유치원 검색
router.get('/search', function(req, res, next) {

    var conn = abbDb.connection;
    var bLocaleSet = false;
    var queryStr = "SELECT * FROM preschool WHERE";

    if (req.query.state !== undefined && req.query.city !== undefined) {
        queryStr += ' address_state = ' + req.query.state + ' AND address_city = ' + req.query.city;
        bLocaleSet = true;
    }
    console.log('log 31');
    if (req.query.name !== undefined) {
        console.log('log #2')
        if (bLocaleSet) queryStr += " AND ";
        queryStr += (" name LIKE '%" + req.query.name + "%'"); // LIKE '%adfaf%'
    }
    console.log('log #3')
    console.log(queryStr);
    flow(function() {
            var query = conn.query(queryStr, function(err, rows) {
                if (err) {
                    console.log(err);
                    res.json(dmkRes.getResponse(500));
                    res.end();
                    this.break();
                    return;
                }

                res.json(rows);
                this.continue();

            }.bind(this));

        })
        .finally(function() {
            conn.end();
        });

});

//유치원 등록
router.post('/', function(req, res, next) {

    var paramChecker = dmkParamChecker.getParamChecker();
    var paramArray = [req.body.name, req.body.address_state, req.body.address_city, req.body.address_detail, req.body.phone, req.body.director_id];
    if (!paramChecker.nullChecker(paramArray)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;
    flow(function() {

            var queryStr = 'INSERT INTO preschool(name, address_state, address_city, address_detail, phone, director_id) VALUES("' +
                req.body.name + '","' +
                req.body.address_state + '","' +
                req.body.address_city + '","' +
                req.body.address_detail + '","' +
                req.body.phone + '","' +
                req.body.director_id + '")';

            var query = conn.query(queryStr, function(err, result) {

                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                var rMsg = dmkRes.getResponse(0);
                rMsg.preschool = {
                    id: result.info.insertId,
                    name: req.body.name,
                    address_state: req.body.address_state,
                    address_city: req.body.address_city,
                    address_detail: req.body.address_detail,
                    phone: req.body.phone,
                };

                res.json(rMsg);
                this.continue();

            }.bind(this));
        })
        .finally(function() {
            conn.close();
        });

});

router.put('/:pid', function(req, res, next) {

    var params = [
        req.body.name,
        req.body.phone,
        req.body.address_state,
        req.body.address_city,
        req.body.address_detail,
        req.params.pid
    ];

    var paramChecker = dmkParamChecker.getParamChecker();
    if (!paramChecker.nullChecker(params)) {
        res.json(dmkRes.getResponse(2));
        return;
    }

    var conn = abbDb.connection;
    flow(function() {

            var query = conn.query("UPDATE preschool SET name = ?, phone = ?, address_state = ?, address_city = ?, address_detail = ? WHERE id = ?", params, function(err, result) {

                if (err) {

                    res.json(dmkRes.getResponse(500))
                    this.break();
                    return;
                }

                if (result.affectedRow == 0) {
                    res.json(dmkRes.getResponse(2));
                    this.break();
                    return;
                }

                var payload = dmkRes.getResponse(0);
                payload.preschool = {
                    id: req.params.pid,
                    name: req.body.name,
                    phone: req.body.phone,
                    address_state: req.body.address_state,
                    address_city: req.body.address_city,
                    address_detail: req.body.address_detail
                };

                res.json(payload);
                this.continue();

            }.bind(this));

        })
        .finally(function() {
            conn.close();
        });



});

router.delete('/:pid', function(req, res, next) {

    var conn = abbDb.connection;
    flow(function() {
            var query = conn.query("DELETE FROM preschool WHERE id = ?", [req.params.pid], function(err, result) {
                if (err) {
                    res.json(dmkRes.getResponse(500));
                    this.break();
                    return;
                }

                if (result.affectedRow == 0) {
                    res.json(dmkRes.getResponse(1));
                    this.break();
                    return;
                }

                // Just send status
                res.json(dmkRes.getResponse(0));
                this.continue();

            }.bind(this));
        })
        .finally(function() {
            conn.close();
        })

});

//공지사항 추가
router.post('/notice', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var notice_id;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.body.allow_reply, req.body.pid, req.body.uid, req.body.isNotice];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.body.pid, req.body.uid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var class_id = req.body.cid;
            if (class_id == -1) {
                class_id = null;
            }
            var insert_query = 'INSERT INTO notice (title, body, allow_reply, read_count, preschool_id, class_id, author_uid, isNotice) VALUES("' +
                req.body.title + '","' + req.body.body + '",' + req.body.allow_reply + ',' +
                req.body.read_count + ',' + req.body.pid + ',' + class_id + ',' + req.body.uid + ',' + req.body.isNotice + ')';

            var query = conn.query(insert_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    //	last_insert_id = Number(result.info.insertId);
                    resultMessage.result.notice_id = Number(result.info.insertId);
                    notice_id = Number(result.info.insertId);
                    this.continue(err);
                }
            }.bind(this));
        })
        //image, notice_image 테이블에 업로드
        .then(function(err) {
            if (req.files != null && req.files.length != 0) {
                var image_query = 'INSERT INTO image (image_url) VALUES ';

                for (i = 0; i < req.files.length; i++) {
                    image_query += '("' + req.files[i].location + '")';

                    if (i < req.files.length - 1) {
                        image_query += ',';
                    }
                }
                var query = conn.query(image_query, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);

                    } else {
                        var first_order_of_image = Number(result.info.insertId);
                        var notice_image = 'INSERT INTO notice_image (notice_id, image_id) VALUES ';

                        for (i = 0; i < req.files.length; i++) {
                            notice_image += '(' + notice_id + ',' + (first_order_of_image + i) + ')';

                            if (i < req.files.length - 1) {
                                notice_image += ',';
                            }
                        }
                        var query = conn.query(notice_image, function(err, result) {

                            if (err) {
                                resultMessage.statusCode = 601;
                                this.break(err);

                            } else {
                                this.continue(err);
                            }
                        }.bind(this));
                    }
                }.bind(this));

            } else {
                this.continue(err);
            }
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//공지사항 불러오기
router.get('/:pid/notices', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var query = conn.query('SELECT id, title, body, allow_reply, date, read_count, preschool_id, class_id, author_uid, isNotice FROM notice WHERE isNotice=1 and preschool_id =' + req.params.pid, function(err, rows) {

        if (err) {
            resultMessage.statusCode = 604;
            error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            var list = [];
            for (var i = 0; i < rows.length; i++) {
                list.push(rows[i]);
            }
            resultMessage.statusCode = 0;
            resultMessage.result = list;
            res.json(resultMessage);

            operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + req.headers['content-length']);
        }
    });

    conn.close();
});

//공지사항 특정반 + 전체 공지 목록 불러오기
router.get('/:pid/class/:cid/notices', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var notice_query = 'SELECT * ' +
        'FROM notice ' +
        'WHERE isNotice = 1 && ((class_id is NULL && preschool_id = ' + req.params.pid + ') || (class_id = ' + req.params.cid + ' && preschool_id = ' + req.params.pid + '))';

    var query = conn.query(notice_query, function(err, rows) {

        if (err) {
            resultMessage.statusCode = 604;
            error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            var list = [];
            for (var i = 0; i < rows.length; i++) {
                list.push(rows[i]);
            }
            resultMessage.statusCode = 0;
            resultMessage.result = list;
            res.json(resultMessage);

            operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + req.headers['content-length']);
        }
    });

    conn.close();
});


//공지 상세 내용 보기
router.get('/:pid/notice/:id', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var err;

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var resultValues;
    var bNoticeImage;

    flow(function() {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var bNoticeImage_query = 'SELECT * FROM notice_image WHERE notice_id = ' + req.params.id;
            var query = conn.query(bNoticeImage_query, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result.length != 0) { //image 있음
                        bNoticeImage = true;
                    } else { //image 없음
                        bNoticeImage = false;
                    }
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {

            var sql_stmt = 'SELECT A.id, A.title, A.body, A.allow_reply, A.date, A.read_count, A.class_id, A.author_uid, C.image_url as author_img_url, B.name as author_name, A.preschool_id, A.isNotice ' +
                'FROM notice A ' +
                'LEFT OUTER JOIN user B ' +
                'ON A.author_uid = B.id ' +
                'LEFT OUTER JOIN image C ' +
                'ON B.photo = C.id ' +
                'WHERE A.id = ' + req.params.id;
            console.log(sql_stmt);
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result[0] == undefined) {
                        console.log("[[[result]]]", result);
                        resultMessage.statusCode = 800;
                        err = 'parameter null or undefined';
                        this.break(err);

                    } else {
                        resultValues = result[0];
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .then(function(err) {
            var bNoticeImage_query = 'SELECT A.notice_id, A.image_id, B.image_url ' +
                'FROM notice_image A ' +
                'JOIN image B ' +
                'ON A.image_id = B.id ' +
                'WHERE A.notice_id = ' + req.params.id;
            var query = conn.query(bNoticeImage_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    var list = [];
                    for (var i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultValues.image = list;
                    resultMessage.result = resultValues;
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var read_count = resultValues.read_count;
            read_count++;
            var query = conn.query('UPDATE notice SET read_count = ' + read_count +
                ' WHERE id = ' + req.params.id,
                function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });
    conn.close();
});

//공지사항 개별 수정
router.put('/:pid/notice/:id', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var err;

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.id, req.body.author_uid, req.body.class_id];
            console.log("[[paramList]]", paramList)

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.body.author_uid, req.body.class_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        //내용 Update
        .then(function(err) {
            var class_id = req.body.class_id;
            if (class_id == -1) {
                class_id = null;
            }
            var query = conn.query('UPDATE notice SET title = "' + req.body.title +
                '", body = "' + req.body.body +
                '", allow_reply = ' + req.body.allow_reply +
                ', read_count = ' + req.body.read_count +
                ', class_id = ' + class_id +
                ', author_uid =' + req.body.author_uid +
                ' WHERE id = ' + req.params.id,
                function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//공지사항 개별 삭제
router.delete('/:pid/notice/:id', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();
    var err;

    flow(function() {

            var paramList = [req.params.id, req.params.pid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.id, req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var query = conn.query('DELETE FROM notice WHERE id = ' + req.params.id, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notice/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});


//공지 Push 수신 대상 리스트
router.get('/notice/:notice_id/targetUsers/', function(req, res, next) {

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

    var alarm_list = [];
    var parent_child_list = [];
    var resultValuesList = [];
    var temp_result = {};

    flow(function() {
            var paramList = [req.params.notice_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.notice_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            var notice_alarm_query = 'SELECT notice_id, child_id, B.name as child_name, is_read ' +
                'FROM notice_alarm A LEFT OUTER JOIN child B ON A.child_id = B.id ' +
                'WHERE notice_id = ' + req.params.notice_id;

            var query = conn.query(notice_alarm_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    if (rows.length == 0) {
                        resultMessage.statusCode = 610; // 해당 결과가 없을 때
                        res.json(resultMessage);

                    } else {
                        for (i = 0; i < rows.length; i++) {
                            alarm_list.push(rows[i]);

                            if (i == rows.length - 1) {
                                this.continue(err);
                            }
                        }
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            if (alarm_list.length == 0) {
                this.continue(err);

            } else {
                var index = 0;
                for (alarm_index = 0; alarm_index < alarm_list.length; alarm_index++) {
                    var parent_id_query = 'SELECT parent_uid, child_id ' +
                        'FROM parent_child ' +
                        'WHERE child_id = ' + alarm_list[alarm_index].child_id;
                    var query = conn.query(parent_id_query, function(err, rows) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            if (rows.length == 0) {
                                resultMessage.statusCode = 800;
                                err = "Wrong empty data";
                                this.break(err);

                            } else {
                                temp_result = alarm_list[index];
                                temp_result.parent_id = rows[0].parent_uid;
                                parent_child_list.push(temp_result);

                                index++;

                                if (index == alarm_list.length) {
                                    this.continue(err);
                                }
                            }
                        }
                    }.bind(this));
                }
            }
        })
        .then(function(err) {

            if (alarm_list.length == 0 || parent_child_list.length == 0) {
                this.continue(err);

            } else {
                var index = 0;
                for (alarm_index = 0; alarm_index < parent_child_list.length; alarm_index++) {
                    var parent_id_query = 'SELECT name ' +
                        'FROM user ' +
                        'WHERE id = ' + alarm_list[alarm_index].parent_id;
                    var query = conn.query(parent_id_query, function(err, rows) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            if (rows.length == 0) {
                                resultMessage.statusCode = 800;
                                err = "Wrong empty data";
                                this.break(err);
                            } else {
                                temp_result = parent_child_list[index];
                                temp_result.parent_name = rows[0].name;
                                resultValuesList.push(temp_result);

                                index++;

                                if (index == alarm_list.length) {
                                    resultMessage.result = resultValuesList;
                                    this.continue(err);
                                }
                            }
                        }
                    }.bind(this));
                }
            }
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});


//공지 Push 수신 미확인 수
router.get('/notice/:notice_id/unconfirmed_num/', function(req, res, next) {

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

    flow(function() {
            var paramList = [req.params.notice_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.notice_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var notice_alarm_query = 'SELECT * ' +
                'FROM notice_alarm ' +
                'WHERE notice_id = ' + req.params.notice_id + ' && ' +
                'is_read = false';
            var query = conn.query(notice_alarm_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    resultMessage.result = rows.length;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//공지 Push 테이블 업데이트 (수신 미확인 -> 확인)
router.put('/notice/:notice_id/confirm', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.notice_id, req.body.child_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.notice_id, req.body.child_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var notice_alarm_query = 'UPDATE notice_alarm ' +
                'SET is_read = true ' +
                'WHERE notice_id = ' + req.params.notice_id + ' && ' +
                'child_id = ' + req.body.child_id;
            var query = conn.query(notice_alarm_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//교육계획안 추가
router.post('/:pid/user/:uid/eduplan', upload.any(), function(req, res, next) {

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var edu_plan_id;
    var paramChecker = dmkParamChecker.getParamChecker();

    flow(
            function() {
                conn.query('START TRANSACTION', function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            })
        .then(function(err) {
            var paramList = [req.body.title, req.body.plan_type, req.body.author_uid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.body.plan_type, req.body.author_uid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var current_time = dmklib.getWorldTime(+9);
            var insert_query = 'insert into edu_plan (date, title, body, type, author_uid) values("' +
                current_time + '","' + req.body.title + '","' + req.body.body + '",' + req.body.plan_type + ',' + req.body.author_uid + ')';
            var query = conn.query(insert_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    edu_plan_id = result.info.insertId;
                    resultMessage.result.edu_plan_id = edu_plan_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var class_id_list = JSON.parse(req.body.class_id_list);
            var class_edu_plan = 'insert into class_edu_plan (edu_plan_id, class_id, preschool_id) values ';
            for (i = 0; i < class_id_list.length; i++) {
                class_edu_plan += '(' + edu_plan_id + ',' + class_id_list[i].class_id + ',' + req.params.pid + ')';
                if (i != class_id_list.length - 1) {
                    class_edu_plan += ',';
                }
            }
            var query = conn.query(class_edu_plan, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }

            }.bind(this));

        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {});
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            } else {
                var query = conn.query('COMMIT', function(err, rows) {});
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan'" + ", " + req.method + ", " + req.headers['content-length']);
            }
            res.json(resultMessage);
        });

    conn.close();
});

//교육계획안 수정
router.put('/:pid/user/:uid/eduplan/:id', upload.any(), function(req, res, next) {

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    var edu_plan_id;
    var paramChecker = dmkParamChecker.getParamChecker();

    var conn = abbDb.connection;

    flow(
            function() {
                conn.query('START TRANSACTION', function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            })

        .then(function(err) {
            var paramList = [req.body.title, req.body.plan_type, req.body.author_uid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.body.plan_type, req.body.author_uid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })

        .then(function(error) {
            var current_time = dmklib.getWorldTime(+9);
            edu_plan_id = req.params.id;

            var update_query = 'update edu_plan set title="' +
                req.body.title + '", body="' + req.body.body + '", type=' + req.body.plan_type +
                ', author_uid=' + req.body.author_uid + ' where id=' + edu_plan_id;

            var query = conn.query(update_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 602;
                    this.break(err);
                } else {
                    this.continue(err);
                }

            }.bind(this))
        })
        .then(function(error) {

            var class_edu_plan;

            var query = conn.query('delete from class_edu_plan where edu_plan_id=' + edu_plan_id, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 603;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));

        })
        .then(function(error) {
            var class_id_list = JSON.parse(req.body.class_id_list);

            var class_edu_plan = 'insert into class_edu_plan (edu_plan_id, class_id, preschool_id) values ';

            for (i = 0; i < class_id_list.length; i++) {
                class_edu_plan += '(' + edu_plan_id + ',' + class_id_list[i].class_id + ',' + req.params.pid + ')';
                if (i != class_id_list.length - 1) {
                    class_edu_plan += ',';
                }
            }

            var query = conn.query(class_edu_plan, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));

        })
        .finally(function(error) {
            if (error) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {});
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        })
    conn.close();
});

//교육계획안  삭제
router.delete('/:pid/user/:uid/eduplan/:id', function(req, res, next) {

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var query = conn.query('delete from edu_plan where id = ' + req.params.id, function(err, rows) {

        if (err) {
            resultMessage.statusCode = 603;
            error_log.error(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/:pid/user/:uid/eduplan/:id'" + ", " + req.method + ", " + req.headers['content-length']);
        }
        res.json(resultMessage);
    });

    conn.close();
});

//주간교육계획안 목록 불러오기
router.get('/:pid/user/:uid/weduplans', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var resultValuesList = [];
    var class_id_list = [];
    var list = [];

    flow(function() {
            var sql_stmt = 'SELECT distinct edu_plan_id FROM class_edu_plan ' +
                'WHERE preschool_id = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (k = 0; k < result.length; k++) {
                        resultValuesList.push(result[k]);
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
                for (j = 0; j < resultValuesList.length; j++) {
                    var sql_stmt = 'SELECT id, title FROM edu_plan ' +
                        'WHERE type = 0 && id = ' + resultValuesList[j].edu_plan_id;
                    var query = conn.query(sql_stmt, function(err, result) {

                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            for (var i = 0; i < result.length; i++) {
                                list.push(result[i]);
                            }
                            if (index == resultValuesList.length - 1) {
                                resultMessage.result = list;
                                this.continue();
                            } else {
                                index++;
                            }
                        }
                    }.bind(this));
                }
            }
        })
        .finally(function(error) {
            if (error) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/user/:uid/weduplan/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/user/:uid/weduplan/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        })

    conn.close();
});

//주간교육계획안 조회
router.get('/:pid/user/:uid/weduplan/:wplan_id', function(req, res, next) {

    var wplan_id = req.params.wplan_id;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;
    var resultValues = {};

    flow(function() {
            var edu_plan_query = 'select id, author_uid, title, body, date, read_count from edu_plan where id =' + wplan_id;

            var query = conn.query(edu_plan_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    //resultMessage.result = rows[0];
                    resultValues = rows[0];
                    this.continue(err);

                }
            }.bind(this));
        })
        .then(function(err) {
            //SELECT A.photo, B.image_url FROM user A JOIN image B ON A.photo = B.id WHERE A.id = 1;
            var profile_photo_query = 'SELECT A.photo, B.image_url as profile_image_url ' +
                'FROM user A ' +
                'JOIN image B ' +
                'ON A.photo = B.id ' +
                'WHERE A.id = ' + resultValues.author_uid;
            var query = conn.query(profile_photo_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    if (rows[0] == undefined) {
                        resultValues.image_url = null;
                        this.continue(err);
                    } else {
                        //resultMessage.result.image_url = rows[0].image_url;
                        resultValues.profile_image_url = rows[0].profile_image_url;
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            var image_query = 'select a.id, a.image_url from image a, edu_plan_image b where b.edu_plan_id=' +
                wplan_id + ' and a.id = b.image_id';

            var list = [];

            var query = conn.query(image_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);
                } else if (rows.length != 0) {

                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    //resultMessage.result.images = list;
                    resultValues.image = list;
                    this.continue(err);
                } else {
                    this.continue(err);
                }

            }.bind(this));


        })

        .then(function(err) {
            var list = [];
            var image_query = 'select class_id from class_edu_plan where edu_plan_id=' +
                wplan_id;
            var query = conn.query(image_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);
                } else if (rows.length != 0) {
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    //resultMessage.result.class_id_list = list;
                    resultValues.class_id_list = list;
                    this.continue(resultMessage);
                } else {
                    this.continue(resultMessage);
                }

            }.bind(this));


        })

        .then(function(err) {

            var image_query = 'select a.id, a.name from user a, edu_plan b where b.id=' +
                wplan_id + ' and b.author_uid = a.id';

            var list = [];

            var query = conn.query(image_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else if (rows.length != 0) {
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    //resultMessage.result.author_info = list;
                    resultValues.author_info = list;
                    this.continue(err);
                } else {
                    this.continue(err);
                }

            }.bind(this));
        })

        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/user/:uid/weduplan/:wplan_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);
            } else {
                resultMessage.result = resultValues;
                var query = conn.query('UPDATE edu_plan SET read_count = read_count + 1 WHERE id = ' + wplan_id, function(err, rows) {

                    if (err) {
                        resultMessage.statusCode = 602;
                        error_log.error(ip + ", role" + ", ID" + ", '/:pid/user/:uid/weduplan/:wplan_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    } else {
                        resultMessage.statusCode = 0;
                        operation_log.info(ip + ", role" + ", ID" + ", '/:pid/user/:uid/weduplan/:wplan_id'" + ", " + req.method + ", " + req.headers['content-length']);
                    }

                    res.json(resultMessage);
                });

            }

        });

    conn.close();
});

//월간교육계획안 목록 불러오기
router.get('/:pid/user/:uid/meduplans', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var resultValuesList = [];
    var class_id_list = [];
    var list = [];

    flow(function() {
            var sql_stmt = 'SELECT distinct edu_plan_id FROM class_edu_plan ' +
                'WHERE preschool_id = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (k = 0; k < result.length; k++) {
                        resultValuesList.push(result[k]);
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
                for (j = 0; j < resultValuesList.length; j++) {
                    var sql_stmt = 'SELECT id, title FROM edu_plan ' +
                        'WHERE type = 1 && id = ' + resultValuesList[j].edu_plan_id;
                    var query = conn.query(sql_stmt, function(err, result) {

                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            for (var i = 0; i < result.length; i++) {
                                list.push(result[i]);
                            }
                            if (index == resultValuesList.length - 1) {
                                resultMessage.result = list;
                                this.continue();
                            } else {
                                index++;
                            }
                        }
                    }.bind(this));
                }
            }
        })
        .finally(function(error) {
            if (error) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/user/:uid/weduplan/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/user/:uid/weduplan/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        })

    conn.close();
});

//앨범 추가
router.post('/:pid/album', upload.any(), function(req, res, next) {

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var album_id;
    var child_id;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(error) {
            var class_id = req.body.class_id;
            if (class_id == -1) {
                class_id = null;
            }
            var album_insert_query = 'INSERT INTO album (name, body, author_uid, class_id, preschool_id) VALUES("' +
                req.body.title + '","' + req.body.body + '",' + req.body.author_uid + ',' +
                class_id + ',' + req.params.pid + ')';
            var query = conn.query(album_insert_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    album_id = result.info.insertId;
                    resultMessage.result.album_id = album_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(error) {
            if (req.files.length != 0) {
                var image_query = 'insert into image (image_url) values ';
                for (i = 0; i < req.files.length; i++) {
                    image_query += '("' + req.files[i].location + '")';
                    if (i < req.files.length - 1) {
                        image_query += ',';
                    }
                }

                var query = conn.query(image_query, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);
                    } else {
                        var first_order_of_image = Number(result.info.insertId);

                        var album_image = 'insert into album_image (album_id, image_id) values ';
                        for (i = 0; i < req.files.length; i++) {
                            album_image += '(' + album_id + ',' + (first_order_of_image + i) + ')';
                            if (i < req.files.length - 1) {
                                album_image += ',';
                            }
                        }

                        var query = conn.query(album_image, function(err, result) {

                            if (err) {
                                resultMessage.statusCode = 601;
                                this.break(err);
                            } else {
                                this.continue(err);
                            }

                        }.bind(this));
                    }
                }.bind(this));

            } else {
                this.continue(error);
            }
        })
        .finally(function(error) {
            if (error) {
                var query = conn.query('ROLLBACK', function(err, rows) {});
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/album/:aid/child/:child_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);

            } else {
                var query = conn.query('COMMIT', function(err, rows) {});
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/album/:aid/child/:child_id'" + ", " + req.method + ", " + req.headers['content-length']);
            }
            res.json(resultMessage);
        });

    conn.close();
});

//사진 전체 목록 불러오기
router.get('/:pid/album', function(req, res, next) {

    var lastIndex = req.query.lastIndex;
    var child_id = req.params.child_id;
    var count = req.query.count;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var album_count = 0;

    flow(
            function() {

                var album_query = 'select A.id as album_id, A.name as title, A.body as body_content, A.dateTime, B.name as author_name, D.image_url as author_image_url ' +
                    'from album A ' +
                    'JOIN user B ' +
                    'ON A.author_uid = B.id ' +
                    'LEFT OUTER JOIN image D ' +
                    'ON B.photo = D.id ' +
                    'where A.preschool_id=' + req.params.pid +
                    ' order by A.id LIMIT ' + count + ' OFFSET ' + lastIndex * count;
                console.log(album_query);
                var query = conn.query(album_query, function(err, rows) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err, resultMessage);
                    } else {
                        album_count = rows.length;
                        var formerAlbumData = {};

                        var list = [];
                        for (i = 0; i < rows.length; i++) {
                            list.push(rows[i]);
                        }
                        resultMessage.result.albums = list;
                        this.continue(resultMessage);

                    }
                }.bind(this));
            })

        .then(function(resultMessage) {
            var index = 0;
            var list = [];

            for (var i = 0; i < resultMessage.result.albums.length; i++) {
                var qryStr = "select count(*) as replyCount from album_reply where album_id = " + resultMessage.result.albums[i].album_id;

                console.log(qryStr);

                conn.query(qryStr, function(err, result) {
                    if (err) {
                        console.log(err);
                        resultMessage.statusCode = 601;
                        this.break(err, resultMessage);
                    } else {
                        console.log("result", result[0].replyCount);

                        list.push(result[0].replyCount);
                        index++;

                        if (index == resultMessage.result.albums.length - 1) {
                            resultMessage.result.replyCount = list;
                            this.continue(resultMessage);
                        }
                    }
                }.bind(this))
            }
        })

        .then(function(resultMessage) {
            var index = 0;
            for (i = 0; i < album_count; i++) {
                var list = [];
                var image_query = 'select a.album_id, a.image_id as img_id, b.image_url as img_path from album_image a, image b where a.image_id = b.id and a.album_id=' +
                    resultMessage.result.albums[i].album_id;
                var query = conn.query(image_query, function(err, rows) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err, resultMessage);
                    } else {
                        for (j = 0; j < rows.length; j++) {
                            list.push(rows[j]);
                        }
                        if (index == album_count - 1) {
                            this.continue(err, resultMessage, list);
                        } else {
                            index++;
                        }
                    }
                }.bind(this));

            }
        })


        .finally(function(err, resultMessage, list) {

            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/album/:aid/child/:child_id/photo'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            } else {
                for (i = 0; i < resultMessage.result.albums.length; i++) {
                    resultMessage.result.albums[i].images = [];
                    for (j = 0; j < list.length; j++) {
                        if (list[j].album_id == resultMessage.result.albums[i].album_id) {
                            var image = {
                                img_id: list[j].img_id,
                                img_path: list[j].img_path
                            };
                            resultMessage.result.albums[i].images.push(image);
                        }
                    }
                }
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/album/:aid/child/:child_id/photo'" + ", " + req.method + ", " + req.headers['content-length']);
            }

            res.json(resultMessage);
        });


    conn.close();
});


//사진 전체 목록 불러오기 (반별)
router.get('/:pid/class/:class_id/album', function(req, res, next) {

    var lastIndex = req.query.lastIndex;
    var count = req.query.count;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var album_count = 0;

    flow(function() {
            var class_id = req.body.class_id;
            if (class_id == -1) {
                class_id = null;
            }

            var album_query = 'select A.id as album_id, A.name as title, A.body as body_content, A.dateTime, B.name as author_name, D.image_url as author_image_url ' +
                'from album A ' +
                'JOIN user B ' +
                'ON A.author_uid = B.id ' +
                'LEFT OUTER JOIN image D ' +
                'ON B.photo = D.id ' +
                'WHERE ((A.class_id is null && A.preschool_id = ' + req.params.pid + ') || (A.class_id = ' + class_id + ' && A.preschool_id = ' + req.params.pid + ')) ' +
                'ORDER BY A.id LIMIT ' + count + ' OFFSET ' + lastIndex * count;
            var query = conn.query(album_query, function(err, rows) {

                if (err) {
                    console.log(err);
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);
                } else {
                    album_count = rows.length;

                    var formerAlbumData = {};

                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result.albums = list;

                    this.continue(resultMessage);

                }
            }.bind(this));
        })

        .then(function(resultMessage) {
            var index = 0;
            var list = [];

            for (var i = 0; i < resultMessage.result.albums.length; i++) {
                var qryStr = "select count(*) as replyCount from album_reply where album_id = " + resultMessage.result.albums[i].album_id;

                console.log(qryStr);

                conn.query(qryStr, function(err, result) {
                    if (err) {
                        console.log(err);
                        resultMessage.statusCode = 601;
                        this.break(err, resultMessage);
                    } else {
                        console.log("result", result[0].replyCount);

                        list.push(result[0].replyCount);
                        index++;

                        if (index == resultMessage.result.albums.length - 1) {
                            resultMessage.result.replyCount = list;
                            this.continue(resultMessage);
                        }
                    }
                }.bind(this))
            }
        })

        .then(function(resultMessage) {

            for (i = 0; i < album_count; i++) {

                var image_query = 'select a.album_id, a.image_id as img_id, b.image_url as img_path from album_image a, image b where a.image_id = b.id and a.album_id=' +
                    resultMessage.result.albums[i].album_id;

                var list = [];

                var query = conn.query(image_query, function(err, rows) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err, resultMessage);
                    }

                    for (j = 0; j < rows.length; j++) {
                        list.push(rows[j]);

                        if (list[list.length - 1].album_id == resultMessage.result.albums[album_count - 1].album_id && j == rows.length - 1) {
                            this.continue(err, resultMessage, list);
                        }
                    }
                }.bind(this));

            }
        })
        .finally(function(err, resultMessage, list) {

            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/album/:aid/photo/class/:class_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            } else {
                for (i = 0; i < resultMessage.result.albums.length; i++) {
                    resultMessage.result.albums[i].images = [];
                    for (j = 0; j < list.length; j++) {
                        if (list[j].album_id == resultMessage.result.albums[i].album_id) {
                            var image = {
                                img_id: list[j].img_id,
                                img_path: list[j].img_path
                            };
                            resultMessage.result.albums[i].images.push(image);
                        }
                    }
                }
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/album/:aid/photo/class/:class_id'" + ", " + req.method + ", " + req.headers['content-length']);
            }

            res.json(resultMessage);
        });


    conn.close();
});

//앨범 하나 불러오기
router.get('/album/:album_id', function(req, res, next) {

    var album_id = req.params.album_id;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var conn = abbDb.connection;

    var album_count = 0;

    flow(function() {
            var album_query = 'SELECT A.id, A.name, A.body, A.author_uid, B.photo, D.image_url as author_img_url, B.name as author_name, A.dateTime, A.class_id, C.name as class_name, A.child_id, A.preschool_id ' +
                'FROM album A ' +
                'JOIN user B ' +
                'ON A.author_uid = B.id ' +
                'LEFT OUTER JOIN class C ' +
                'ON A.class_id = C.id ' +
                'LEFT OUTER JOIN image D ' +
                'ON B.photo = D.id ' +
                'WHERE A.id = ' + album_id;
            var query = conn.query(album_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);

                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result.album = list;
                    this.continue(resultMessage);
                }
            }.bind(this));
        })
        .then(function(resultMessage) {

            var image_query = 'select a.id, a.image_url from image a, album_image b where b.album_id=' +
                album_id + ' and a.id = b.image_id';

            var list = [];

            var query = conn.query(image_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result.images = list;

                    this.continue(resultMessage);
                }

            }.bind(this));


        })

        .then(function(resultMessage) {
            var list = [];
            var image_query = 'SELECT A.author_uid, B.name as author_name, A.body, A.date as dateTime ' +
                'FROM album_reply A ' +
                'JOIN user B ' +
                'ON A.author_uid = B.id '
            'WHERE A.album_id = ' + album_id;
            var query = conn.query(image_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err, resultMessage);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result.replies = list;

                    this.continue(err, resultMessage);
                }

            }.bind(this));
        })

        .finally(function(err, resultMessage) {

            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/album/:album_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/album/:album_id'" + ", " + req.method + ", " + req.headers['content-length']);
            }
            res.json(resultMessage);
        });

    conn.close();
});

//사진 개별  삭제
router.delete('/album/:album_id', function(req, res, next) {

    var conn = abbDb.connection;

    var query = conn.query('delete from album where id = ' + req.params.album_id, function(err, rows) {

        var resultMessage = {
            statusCode: {},
            result: {}
        };

        var ip = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        if (err) {
            resultMessage.statusCode = 603;
            error_log.error(ip + ", role" + ", ID" + ", '/album/:album_id" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/album/:album_id" + ", " + req.method + ", " + req.headers['content-length']);
        }

        res.json(resultMessage);
    });

    conn.close();
});

// 사진 개별 수정
router.put('/album/:album_id', upload.any(), function(req, res, next) {

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var album_id;
    var child_id;

    var conn = abbDb.connection;

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.album_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.album_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var class_id = req.body.class_id;
            if (class_id == -1) {
                class_id = null;
            }

            var update_album_query = 'UPDATE album SET name = "' + req.body.title +
                '", body = "' + req.body.body +
                '", class_id = ' + class_id +
                ', author_uid =' + req.body.author_uid +
                ' WHERE id = ' + req.params.album_id;
            console.log(update_album_query);
            var query = conn.query(update_album_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 602;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(error) {
            if (error) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/album/:album_id" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/album/:album_id" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//스케쥴 추가
router.post('/:pid/class/:cid/schedule', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var last_insert_id;
    var last_schedule_insert_id;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            if (req.body.latitude && req.body.longitude) {
                var query_st = 'INSERT INTO geolocation(latitude, longitude, name) VALUES (' +
                    req.body.latitude + ',' + req.body.longitude + ',"' + req.body.geolocation_name + '")';

                var query = conn.query(query_st, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);
                    } else {
                        last_insert_id = Number(result.info.insertId);
                        this.continue(err);
                    }
                }.bind(this));

            } else {
                last_insert_id = null;
                this.continue(err);
            }
        })
        .then(function(err) {
            var query_st = 'INSERT INTO schedule(title, body, start_time, end_time, geolocation_id, alarm_timing) VALUES ("' +
                req.body.title + '","' + req.body.body + '","' + req.body.start_time + '","' + req.body.end_time + '",' + last_insert_id + ', ' + req.body.alarm_timing + ')';
            var query = conn.query(query_st, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 602;
                    this.break(err);
                } else {
                    last_schedule_insert_id = Number(result.info.insertId);
                    resultMessage.result.schedule_id = last_schedule_insert_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var class_id = req.body.cid;
            if (class_id == -1) {
                class_id = null;
            }
            var query_st = 'INSERT INTO class_schedule(schedule_id, class_id, preschool_id) VALUES (' +
                last_schedule_insert_id + ',' + class_id + ',' + req.params.pid + ')';
            var query = conn.query(query_st, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 603;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        //image, notice_image 테이블에 업로드
        .then(function(err) {
            if (req.files != null && req.files.length != 0) {
                var image_query = 'INSERT INTO image (image_url) VALUES ';

                for (i = 0; i < req.files.length; i++) {
                    image_query += '("' + req.files[i].location + '")';

                    if (i < req.files.length - 1) {
                        image_query += ',';
                    }
                }
                var query = conn.query(image_query, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
                        var first_order_of_image = Number(result.info.insertId);
                        var schedule_image = 'INSERT INTO schedule_image (schedule_id, image_id) VALUES ';

                        for (i = 0; i < req.files.length; i++) {
                            schedule_image += '(' + last_schedule_insert_id + ',' + (first_order_of_image + i) + ')';

                            if (i < req.files.length - 1) {
                                schedule_image += ',';
                            }
                        }
                        var query = conn.query(schedule_image, function(err, result) {

                            if (err) {
                                resultMessage.statusCode = 605;
                                this.break(err);

                            } else {
                                this.continue(err);
                            }
                        }.bind(this));
                    }
                }.bind(this));

            } else {
                this.continue(err);
            }
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/:cid/schedule'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:cid/schedule'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//스케쥴 목록 불러오기 (반별)
router.get('/class/:cid/schedules', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var count = req.query.count;
    var lastIndex = 0;
    if (Number(req.query.lastIndex) > 0) {
        lastIndex = Number(req.query.lastIndex) + Number(count) - 1;
    }

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var geo_list = [];
    var latitude;
    var longitude;

    flow(function() {

            var paramList = [req.params.cid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var schedule_query = 'SELECT S.id, S.title, S.body, S.start_time, S.end_time, S.geolocation_id, S.alarm_timing, G.name as geolocation_name, G.latitude, G.longitude ' +
                'FROM schedule S, class_schedule CS, class C, geolocation G ' +
                'WHERE S.id = CS.schedule_id && CS.class_id = C.id && S.geolocation_id = G.id && C.id = ' + req.params.cid + ' ' +
                'ORDER BY id LIMIT ' + count + ' OFFSET ' + lastIndex;
            var query = conn.query(schedule_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result = list;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/class/:cid/schedules'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/class/:cid/schedules'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//스케쥴 목록 불러오기 (유치원별)
router.get('/:pid/schedules', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var count = req.query.count;
    var lastIndex = 0;
    if (Number(req.query.lastIndex) > 0) {
        lastIndex = Number(req.query.lastIndex) + Number(count) - 1;
    }

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();
    var class_list = [];
    var schedule_list = [];
    var schedule_data_list = [];
    var resultValues = {};

    flow(function() {
            var paramList = [req.params.pid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            var sql_stmt = 'SELECT schedule_id, class_id ' +
                'FROM class_schedule ' +
                'WHERE preschool_id = ' + req.params.pid + ' '
            'ORDER BY id LIMIT ' + count + ' OFFSET ' + lastIndex;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result.length == 0) {
                        this.continue(err);
                    } else {
                        for (var i = 0; i < result.length; i++) {
                            schedule_list.push(result[i]);
                        }
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .then(function(err) {
            if (schedule_list.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (var i = 0; i < schedule_list.length; i++) {
                    var schedule_query = 'SELECT id, title, body, start_time, end_time, alarm_timing ' +
                        'FROM schedule ' +
                        'WHERE id = ' + schedule_list[i].schedule_id;

                    var query = conn.query(schedule_query, function(err, rows) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            schedule_data_list.push(rows[0]);
                            index++;
                            if (index == schedule_list.length) {
                                resultMessage.result = schedule_data_list;
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/schedules'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/schedules'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//스케쥴 특정반 + 전체 공지 목록 불러오기
router.get('/:pid/class/:cid/schedules', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var count = req.query.count;
    var lastIndex = 0;
    if (Number(req.query.lastIndex) > 0) {
        lastIndex = Number(req.query.lastIndex) + Number(count) - 1;
    }

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();
    var class_list = [];
    var schedule_list = [];

    flow(function() {
            var paramList = [req.params.pid, req.params.cid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid, req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            var schedule_query = 'SELECT S.id, S.title, S.body, S.start_time, S.end_time, S.geolocation_id, S.alarm_timing, G.name as geolocation_name, G.latitude, G.longitude ' +
                'FROM schedule S ' +
                'JOIN class_schedule CS ' +
                'ON S.id = CS.schedule_id ' +
                'LEFT OUTER JOIN geolocation G ' +
                'ON S.geolocation_id = G.id ' +
                'WHERE ((CS.class_id is null && CS.preschool_id = ' + req.params.pid + ') || (CS.class_id = ' + req.params.cid + ' && CS.preschool_id = ' + req.params.pid + ')) ' +
                'ORDER BY id LIMIT ' + count + ' OFFSET ' + lastIndex;
            var query = conn.query(schedule_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (j = 0; j < rows.length; j++) {
                        schedule_list.push(rows[j]);
                    }
                    resultMessage.result = schedule_list;
                    this.continue(err);
                }
            }.bind(this));

        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/schedules'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/schedules'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//스케쥴 상세 보기
router.get('/:pid/schedule/:sid', function(req, res, next) {

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

    var resultValues;
    var bScheduleImage;

    flow(function() {
            console.log("111");
            var paramList = [req.params.sid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            console.log("222");
            var paramList = [req.params.sid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            console.log("333");
            var bScheduleImage_query = 'SELECT * FROM schedule_image WHERE schedule_id = ' + req.params.sid;
            var query = conn.query(bScheduleImage_query, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result.length != 0) { //image 있음
                        bScheduleImage = true;
                    } else { //image 없음
                        bScheduleImage = false;
                    }
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log("444");
            var sql_stmt = 'SELECT A.id, A.title, A.body, A.start_time, A.end_time, A.geolocation_id, A.alarm_timing, B.class_id ' +
                'FROM schedule A ' +
                'JOIN class_schedule B ' +
                'ON A.id = B.schedule_id ' +
                'WHERE A.id = ' + req.params.sid;

            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result[0] == undefined) {
                        resultMessage.statusCode = 800;
                        err = 'parameter null or undefined';
                        this.break(err);

                    } else {
                        resultValues = result[0];
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log("555");
            if (resultValues.class_id) {
                var sql_stmt = 'SELECT id as class_id, name as class_name ' +
                    'FROM class ' +
                    'WHERE id = ' + resultValues.class_id;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
                        if (result[0] == undefined) {
                            resultMessage.statusCode = 800;
                            err = 'parameter null or undefined';
                            this.break(err);

                        } else {
                            resultValues.class_id = result[0].class_id;
                            resultValues.class_name = result[0].class_name;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            } else {
                this.continue(err);
            }
        })
        .then(function(err) {
            console.log("666");
            if (resultValues.geolocation_id) {
                var sql_stmt = 'SELECT id as geolocation_id, name as geolocation_name, latitude, longitude ' +
                    'FROM geolocation C ' +
                    'WHERE id = ' + resultValues.geolocation_id;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
                        resultValues.geolocation_id = result[0].geolocation_id;
                        resultValues.geolocation_name = result[0].geolocation_name;
                        resultValues.latitude = result[0].latitude;
                        resultValues.longitude = result[0].longitude;
                        this.continue(err);
                    }
                }.bind(this));

            } else {
                this.continue(err);
            }
        })
        .then(function(err) {
            console.log("777");
            var bScheduleImage_query = 'SELECT A.schedule_id, A.image_id, B.image_url ' +
                'FROM schedule_image A ' +
                'LEFT OUTER JOIN image B ' +
                'ON A.image_id = B.id ' +
                'WHERE A.schedule_id = ' + req.params.sid;
            var query = conn.query(bScheduleImage_query, function(err, rows) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    var list = [];
                    for (var i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultValues.image = list;
                    resultMessage.result = resultValues;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            console.log("888");
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/schedule/:sid'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/schedule/:sid'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//스케쥴 개별 수정
router.put('/schedule/:sid', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var last_insert_id;
    var geolocation_id;
    var last_geolocation_id;
    var bGeolocation;
    var bScheduleImage;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log('111');
            var paramList = [req.params.sid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            console.log('222');
            var paramList = [req.params.sid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        //기존 Geolocation 정보 있는지 검사
        .then(function(err) {
            console.log('333');
            var select_geo_query = 'SELECT geolocation_id ' +
                'FROM schedule ' +
                'WHERE id = ' + req.params.sid;
            var query = conn.query(select_geo_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    if (rows[0].geolocation_id != null) {
                        bGeolocation = true;
                        geolocation_id = rows[0].geolocation_id;
                        this.continue(err);
                    } else {
                        bGeolocation = false;
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log('444');
            if (bGeolocation) {
                if (req.body.latitude && req.body.longitude) {
                    var geo_update_query = 'UPDATE geolocation ' +
                        'SET latitude = ' + req.body.latitude +
                        ', longitude = ' + req.body.longitude +
                        ', name = "' + req.body.geolocation_name + '" ' +
                        'WHERE id = ' + geolocation_id;
                    console.log(geo_update_query);
                    var query = conn.query(geo_update_query, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 602;
                            this.break(err);
                        } else {
                            this.continue(err);
                        }
                    }.bind(this));
                }
            } else {
                if (req.body.latitude && req.body.longitude) {
                    var query_st = 'INSERT INTO geolocation(latitude, longitude, name) VALUES (' +
                        req.body.latitude + ',' + req.body.longitude + ',"' + req.body.geolocation_name + '")';
                    console.log(query_st);
                    var query = conn.query(query_st, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 601;
                            this.break(err);
                        } else {
                            last_insert_id = Number(result.info.insertId);
                            this.continue(err);
                        }
                    }.bind(this));
                } else {
                    last_insert_id = null;
                    this.continue(err);
                }
            }
        })
        .then(function(err) {
            console.log('555');
            if (last_insert_id) {
                var update_schedule_query = 'UPDATE schedule ' +
                    'SET title = "' + req.body.title + '"' +
                    ', body = "' + req.body.body + '"' +
                    ', start_time = "' + req.body.start_time + '"' +
                    ', end_time = "' + req.body.end_time + '" ' +
                    ', geolocation_id = ' + last_insert_id + ' ' +
                    'WHERE id = ' + req.params.sid;
                console.log("1: " + update_schedule_query);
                var query = conn.query(update_schedule_query, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 602;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            } else {
                var update_schedule_query = 'UPDATE schedule ' +
                    'SET title = "' + req.body.title + '"' +
                    ', body = "' + req.body.body + '"' +
                    ', start_time = "' + req.body.start_time + '"' +
                    ', end_time = "' + req.body.end_time + '" ' +
                    'WHERE id = ' + req.params.sid;
                console.log("2: " + update_schedule_query);
                var query = conn.query(update_schedule_query, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 602;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            console.log('666');
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/schedule/:sid'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/schedule/:sid'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//스케쥴 삭제
router.delete('/schedule/:sid', function(req, res, next) {

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
    var geolocation_id;

    flow(function() {
            var paramList = [req.params.sid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.sid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var select_geo_query = 'SELECT geolocation_id ' +
                'FROM schedule ' +
                'WHERE id = ' + req.params.sid;
            var query = conn.query(select_geo_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    geolocation_id = rows[0].geolocation_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var del_schedule_query = 'DELETE FROM schedule ' +
                'WHERE id = ' + req.params.sid;
            var query = conn.query(del_schedule_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 603;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var query = conn.query('DELETE FROM geolocation ' +
                'WHERE id = ' + geolocation_id,
                function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 603;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/schedule/:sid'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/schedule/:sid'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//투약 의뢰서 목룍 조회 (날짜별) (원장)
router.get('/:pid/mediRequests/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT id FROM class WHERE preschool_uid = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (i = 0; i < result.length; i++) {
                        class_id_list.push(result[i]['id']);

                        if (i == result.length - 1) {
                            this.continue(err);
                        }
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            var index = 0;
            for (j = 0; j < class_id_list.length; j++) {

                var sql_stmt = 'SELECT A.id as req_med_id, child_id, class_id, symptom, confirm FROM request_medi A JOIN date B ON A.date = B.id ' +
                    'WHERE A.class_id = ' + class_id_list[j] + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        for (k = 0; k < result.length; k++) {
                            resultValuesList.push(result[k]);
                        }
                        if (index == class_id_list.length - 1) {
                            this.continue(err);
                        } else {
                            index++;
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result[0]['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                //	console.log("inner index value : " + index);
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/mediRequests/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/mediRequests/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});


//투약 의뢰서 목룍 조회 (날짜별) (선생)
router.get('/:pid/classes/:cid/mediRequests/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.cid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            sql_stmt = 'SELECT A.id as req_med_id, child_id, class_id, symptom, confirm FROM request_medi A JOIN date B ON A.date = B.id ' +
                'WHERE A.class_id = ' + req.params.cid + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {

                    for (k = 0; k < result.length; k++) {
                        resultValuesList.push(result[k]);
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
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result[0]['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                //	console.log("inner index value : " + index);
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/mediRequests/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/mediRequests/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//투약 의뢰서 내용 조회 (상세)
router.get('/:pid/mediRequest/:id', function(req, res, next) {

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

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            sql_stmt = 'SELECT id, author_id, child_id, class_id, symptom, photo, photo as photo_id, sign, sign as sign_id, date, confirm, ' +
                'confirm_time, confirm_person, medicine, dosage, injection_time, storage_method, etc ' +
                'FROM request_medi ' +
                'WHERE id = ' + req.params.id;
            console.log(sql_stmt);
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    resultValues = result[0];
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {

                sql_stmt = 'SELECT image_url FROM image WHERE id = ' + resultValues.photo;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result[0] == undefined) {
                            this.continue(err);
                        } else {
                            resultValues.photo = result[0].image_url;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {

                sql_stmt = 'SELECT image_url FROM image WHERE id = ' + resultValues.sign;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result[0] == undefined) {
                            this.continue(err);
                        } else {
                            resultValues.sign = result[0].image_url;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);
            } else {

                sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValues.class_id;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        resultValues.class_name = result[0]['name'];
                        this.continue(err);
                    }
                }.bind(this));

            }

        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                sql_stmt = 'SELECT name FROM user WHERE id = ' + resultValues.author_id;
                console.log(sql_stmt);
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result.length == 0 || result == undefined) {
                            resultMessage.statusCode = 800;
                            err = 'parameter null or undefined';
                            this.break(err);

                        } else {
                            resultValues.author_name = result[0]['name'];
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                if (resultValues.confirm == true) {
                    sql_stmt = 'SELECT name FROM user WHERE id = ' + resultValues.confirm_person;
                    console.log(sql_stmt);
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            if (result.length == 0 || result == undefined) {
                                resultMessage.statusCode = 800;
                                err = 'parameter null or undefined';
                                this.break(err);

                            } else {
                                resultValues.confirm_person_name = result[0]['name'];
                                this.continue(err);
                            }
                        }
                    }.bind(this));

                } else {
                    this.continue(err);
                }
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);
            } else {

                sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValues.child_id;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        resultValues.child_name = result[0]['name'];
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);
            } else {

                sql_stmt = 'SELECT id, year, month, day, hour, min, sec FROM date WHERE id = ' + resultValues.date;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        var date_time = result[0]['year'] + "/" + result[0]['month'] + "/" + result[0]['day'] + " " +
                            result[0]['hour'] + ":" + result[0]['min'] + ":" + result[0]['sec'];
                        resultValues.date = date_time;
                        resultMessage.result = resultValues;
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/mediRequest/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/mediRequest/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//투약의뢰서 수신확인 업데이트
router.put('/:pid/mediRequest/:id/confirm', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();
    var confirm_person_name;

    var confirm_time = dmklib.getWorldTime(+9);
    var receiverUserID;
    var senderName;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.id, req.body.confirm_person_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.id, req.body.confirm_person_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        //request_medi 테이블에 있는 confirm_person과 확인 유무, confirm_time 업데이트
        .then(function(err) {
            var update_query = 'UPDATE request_medi SET confirm_person = "' + req.body.confirm_person_id +
                '", confirm = ' + true +
                ', confirm_time = "' + confirm_time +
                '" WHERE id = ' + req.params.id;
            var query = conn.query(update_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        //작성자 id 가져오기
        .then(function(err) {
            sql_stmt = 'SELECT author_id FROM request_medi WHERE id = ' + req.params.id;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    this.break(err);
                } else {
                    receiverUserID = result[0].author_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        //보내는 사람 이름 가져오기
        .then(function(err) {
            sql_stmt = 'SELECT name FROM user WHERE id = ' + req.body.confirm_person_id;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    this.break(err);
                } else {
                    senderName = result[0].name;
                    this.continue(err);
                }
            }.bind(this));
        })
        //알림 메뉴 테이블(noti_history)에 insert
        .then(function(err) {
            //preschoolID, receiverUserID, contentType, contentID, senderName, notiTitle, notiBody
            dmklib.logNotiHistory(req.params.pid, receiverUserID, 2, req.params.id, senderName, "투약의뢰서 확인", "작성하신 투약의뢰서를 확인했습니다.");
            this.continue(err);
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/mediRequest/:id/confirm'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/mediRequest/:id/confirm'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//투약의뢰서 수신확인 (push)
router.post('/:pid/mediRequest/:id/push', function(req, res, next) {

    var conn = abbDb.connection;
    //    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var token_query = 'SELECT device_token ' +
        'FROM user ' +
        'WHERE id = ' +
        '(SELECT author_id ' +
        'FROM request_medi ' +
        'WHERE id = ' + req.params.id + ')';

    var query = conn.query(token_query, function(err, rows) {

        if (err) {
            resultMessage.statusCode = 600;
            error_log.error(ip + ", role" + ", ID" + ", '/push/:pid/mediRequest/:id/push'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);
        } else {

            var receiver = rows[0].device_token;
            sendTopicMessage(receiver, "투약의뢰서 확인", "작성하신 투약의뢰서를 확인했습니다.");

            function sendTopicMessage(receiver, title, content) {
                var message = {
                    title: title,
                    content: content
                };
                //    console.log(message);
                request({
                    url: 'https://fcm.googleapis.com/fcm/send',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'key=AAAAyEOs33k:APA91bGvUb5ZiPiKfMWnVxv-XE4rwht4WeayykRhIE-hSs05HMQd3TIjfVtPvr6d1pphQidn2ZZaJCuAgDBcIhoU3WVA_Tk1nKGCwgtzAgJFTlJMxbgqBn905N-Bnr4zZVyw_tPppXPz'
                    },
                    // body: JSON.stringify({
                    //     "data": {
                    //         "message": message
                    //     },
                    //     "to": receiver
                    // })
                    body: JSON.stringify({
                        "data": {
                            "message": message
                        },
                        "to": receiver,
                        "notification": {
                            "title": "투약의뢰서 확인",
                            "body": "작성하신 투약의뢰서를 확인했습니다.",
                            "sound": "default"
                        }
                    })
                }, function(error, response, body) {
                    if (error) {
                        resultMessage.statusCode = 900;
                        //    console.error(error, response, body);
                    } else if (response.statusCode >= 400) {
                        resultMessage.statusCode = 901;
                        //    console.error('HTTP Error: ' + response.statusCode + ' - '
                        //       + response.statusMessage + '\n' + body);
                    } else {
                        //    console.log('Done');
                        resultMessage.statusCode = 0;
                        res.json(resultMessage);
                        //  res.json(response.statusMessage);
                    }
                });
            }
        }
    });

    conn.close();
});

//귀가 동의서 목록 조회 (날짜별) (원장)
router.get('/:pid/returnRequests/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT id FROM class WHERE preschool_uid = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    this.break(err);
                } else {
                    for (i = 0; i < result.length; i++) {
                        class_id_list.push(result[i]['id']);

                        if (i == result.length - 1) {
                            this.continue(err);
                        }
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            var index = 0;
            for (j = 0; j < class_id_list.length; j++) {

                sql_stmt = 'SELECT A.id as id, child_id, class_id, companion, confirm FROM request_returning A JOIN date B ON A.date = B.id ' +
                    'WHERE A.class_id = ' + class_id_list[j] + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {

                        for (k = 0; k < result.length; k++) {
                            //	console.log(result[k]);
                            resultValuesList.push(result[k]);
                        }
                        if (index == class_id_list.length - 1) {
                            //	console.log("result length : " + resultValuesList.length);
                            this.continue(err);
                        } else {
                            index++;
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result[0]['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                //	console.log("inner index value : " + index);
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/returnRequests/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/returnRequests/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//귀가 동의서 목룍 조회 (날짜별) (선생)
router.get('/:pid/classes/:cid/returnRequests/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.cid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            sql_stmt = 'SELECT A.id as id, child_id, class_id, companion, confirm FROM request_returning A JOIN date B ON A.date = B.id ' +
                'WHERE A.class_id = ' + req.params.cid + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {

                    for (k = 0; k < result.length; k++) {
                        //	console.log(result[k]);
                        resultValuesList.push(result[k]);
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
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                //	console.log("inner index value : " + index);
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/returnRequests/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/returnRequests/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });
});

//귀가 동의서 내용 조회 (상세)
router.get('/:pid/returnRequest/:id', function(req, res, next) {

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

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid, req.params.id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {

            sql_stmt = 'SELECT id, author_id, child_id, class_id, photo, photo as photo_id, sign, sign as sign_id, date, companion, confirm, ' +
                'confirm_time, confirm_person, contact, returning_time, reason, etc ' +
                'FROM request_returning ' +
                'WHERE id = ' + req.params.id;

            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    resultValues = result[0];
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {

                sql_stmt = 'SELECT image_url FROM image WHERE id = ' + resultValues.photo;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result[0] == undefined) {
                            this.continue(err);
                        } else {
                            resultValues.photo = result[0].image_url;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {

                sql_stmt = 'SELECT image_url FROM image WHERE id = ' + resultValues.sign;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result[0] == undefined) {
                            this.continue(err);
                        } else {
                            resultValues.sign = result[0].image_url;
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValues.class_id;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        resultValues.class_name = result[0]['name'];
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValues.child_id;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);

                    } else {
                        resultValues.child_name = result[0]['name'];
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                sql_stmt = 'SELECT name FROM user WHERE id = ' + resultValues.author_id;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        if (result.length == 0 || result == undefined) {
                            resultMessage.statusCode = 800;
                            err = 'parameter null or undefined';
                            this.break(err);

                        } else {
                            resultValues.author_name = result[0]['name'];
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                if (resultValues.confirm == true) {
                    sql_stmt = 'SELECT name FROM user WHERE id = ' + resultValues.confirm_person;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            if (result.length == 0 || result == undefined) {
                                resultMessage.statusCode = 800;
                                err = 'parameter null or undefined';
                                this.break(err);

                            } else {
                                resultValues.confirm_person_name = result[0]['name'];
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                } else {
                    this.continue(err);
                }
            }
        })
        .then(function(err) {

            if (resultValues == undefined) {
                this.continue(err);

            } else {
                sql_stmt = 'SELECT id, year, month, day, hour, min, sec FROM date WHERE id = ' + resultValues.date;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        var date_time = result[0]['year'] + "/" + result[0]['month'] + "/" + result[0]['day'] + " " +
                            result[0]['hour'] + ":" + result[0]['min'] + ":" + result[0]['sec'];
                        resultValues.date = date_time;
                        resultMessage.result = resultValues;
                        this.continue(err);
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {

            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/returnRequest/:id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/returnRequest/:id'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//귀가동의서 수신확인 업데이트
router.put('/:pid/returnRequest/:id/confirm', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();
    var confirm_person_name;

    var receiverUserID;
    var senderName;

    var current_date = dmklib.getWorldTime(+9);

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.id, req.body.confirm_person_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.id, req.body.confirm_person_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        //request_medi 테이블에 있는 confirm_person과 확인 유무, confirm_time 업데이트
        .then(function(err) {
            var update_query = 'UPDATE request_returning SET confirm_person = "' + req.body.confirm_person_id +
                '", confirm = ' + true +
                ', confirm_time = "' + current_date +
                '" WHERE id = ' + req.params.id;

            var query = conn.query(update_query, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        //작성자 id 가져오기
        .then(function(err) {
            sql_stmt = 'SELECT author_id FROM request_returning WHERE id = ' + req.params.id;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    this.break(err);
                } else {
                    receiverUserID = result[0].author_id;
                    this.continue(err);
                }
            }.bind(this));
        })
        //보내는 사람 이름 가져오기
        .then(function(err) {
            sql_stmt = 'SELECT name FROM user WHERE id = ' + req.body.confirm_person_id;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    this.break(err);
                } else {
                    senderName = result[0].name;
                    this.continue(err);
                }
            }.bind(this));
        })
        //알림 메뉴 테이블(noti_history)에 insert
        .then(function(err) {
            //preschoolID, receiverUserID, contentType, contentID, senderName, notiTitle, notiBody
            dmklib.logNotiHistory(req.params.pid, receiverUserID, 3, req.params.id, senderName, "귀가동의서 확인", "작성하신 귀가동의서를 확인했습니다.");
            this.continue(err);
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/returnRequest/:id/confirm'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/returnRequest/:id/confirm'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//귀가동의서 수신확인 (push)
router.post('/:pid/returnRequest/:id/push', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var token_query = 'SELECT device_token ' +
        'FROM user ' +
        'WHERE id = ' +
        '(SELECT author_id ' +
        'FROM request_returning ' +
        'WHERE id = ' + req.params.id + ')';

    var query = conn.query(token_query, function(err, rows) {

        if (err) {
            resultMessage.statusCode = 600;
            error_log.error(ip + ", role" + ", ID" + ", '/push/:pid/returnRequest/:id/push'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
            res.json(resultMessage);
        } else {
            var receiver = rows[0].device_token;
            sendTopicMessage(receiver, "귀가동의서 확인", "작성하신 귀가동의서를 확인했습니다.");

            function sendTopicMessage(receiver, title, content, imgUrl, link) {
                var message = {
                    title: title,
                    content: content,
                    imgUrl: imgUrl,
                    link: link
                };
                //    console.log(message);
                request({

                    url: 'https://fcm.googleapis.com/fcm/send',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'key=AAAAyEOs33k:APA91bGvUb5ZiPiKfMWnVxv-XE4rwht4WeayykRhIE-hSs05HMQd3TIjfVtPvr6d1pphQidn2ZZaJCuAgDBcIhoU3WVA_Tk1nKGCwgtzAgJFTlJMxbgqBn905N-Bnr4zZVyw_tPppXPz'
                    },
                    // body: JSON.stringify({
                    //     "data": {
                    //         "message": message
                    //     },
                    //     "to": receiver
                    // })
                    body: JSON.stringify({
                        "data": {
                            "message": message
                        },
                        "to": receiver,
                        "notification": {
                            "title": "귀가동의서 확인",
                            "body": "작성하신 귀가동의서를 확인했습니다.",
                            "sound": "default"
                        }
                    })
                }, function(error, response, body) {
                    if (error) {
                        resultMessage.statusCode = 900;
                    } else if (response.statusCode >= 400) {
                        resultMessage.statusCode = 901;
                    } else {
                        resultMessage.statusCode = 0;
                        res.json(resultMessage);
                    }
                });
            }
        }
    });

    conn.close();
});

//출석부 조회 (날짜별) (원장)
router.get('/:pid/attendance/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT id FROM class WHERE preschool_uid = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (i = 0; i < result.length; i++) {
                        class_id_list.push(result[i]['id']);

                        if (i == result.length - 1) {
                            this.continue(err);
                        }
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            var index = 0;
            for (j = 0; j < class_id_list.length; j++) {

                sql_stmt = 'SELECT A.id as attend_id, child_id, class_id, attend, reason, absence_type, date FROM attendance A JOIN date B ON A.date = B.id ' +
                    'WHERE A.class_id = ' + class_id_list[j] + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
                console.log(sql_stmt);
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        for (k = 0; k < result.length; k++) {
                            resultValuesList.push(result[k]);
                        }
                        if (index == class_id_list.length - 1) {
                            this.continue(err);
                        } else {
                            index++;
                        }
                    }
                }.bind(this));
            }
        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);
            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result[0]['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);

            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//출석부 조회 (날짜별) (선생)
router.get('/:pid/classes/:cid/attendance/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    flow(function() {
            var paramList = [req.params.pid, req.params.cid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid, req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT A.id as attend_id, child_id, class_id, attend, reason, absence_type, date FROM attendance A JOIN date B ON A.date = B.id ' +
                'WHERE A.class_id = ' + req.params.cid + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {

                    for (k = 0; k < result.length; k++) {
                        resultValuesList.push(result[k]);
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
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM class WHERE id = ' + resultValuesList[p].class_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].class_name = result[0]['name'];
                            index++;

                            if (index == resultValuesList.length) {
                                this.continue(err);
                            }
                        }
                    }.bind(this));
                }
            }

        })
        .then(function(err) {

            if (resultValuesList.length == 0) {
                this.continue(err);

            } else {
                var index = 0;
                for (p = 0; p < resultValuesList.length; p++) {

                    sql_stmt = 'SELECT name FROM child WHERE id = ' + resultValuesList[p].child_id;
                    var query = conn.query(sql_stmt, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 604;
                            this.break(err);
                        } else {
                            resultValuesList[index].child_name = result[0]['name'];
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
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/attendance/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/classes/:cid/attendance/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});


//출석 숫자 조회 (날짜별) (원장)
router.get('/:pid/attendCount/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    var attendanceCount = 0;
    var absenceCount = 0;

    flow(function() {
            var paramList = [req.params.pid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT id FROM class WHERE preschool_uid = ' + req.params.pid;
            var query = conn.query(sql_stmt, function(err, result) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    for (i = 0; i < result.length; i++) {
                        class_id_list.push(result[i]['id']);

                        if (i == result.length - 1) {
                            this.continue(err);
                        }
                    }
                }
            }.bind(this));
        })
        .then(function(err) {

            var index = 0;
            for (j = 0; j < class_id_list.length; j++) {

                sql_stmt = 'SELECT attend, absence_type FROM attendance A JOIN date B ON A.date = B.id ' +
                    'WHERE A.class_id = ' + class_id_list[j] + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {

                        for (k = 0; k < result.length; k++) {
                            if (result[k]['attend'] == 0)
                                absenceCount++;
                            else
                                attendanceCount++;
                        }
                        if (index == class_id_list.length - 1) {
                            resultMessage.result.attendanceCount = attendanceCount;
                            resultMessage.result.absenceCount = absenceCount;
                            this.continue(err);
                        } else {
                            index++;
                        }
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/attendCount/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/attendCount/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//출석 숫자 조회 (날짜별) (선생)
router.get('/:pid/classes/:cid/attendCount/date/:date_time', function(req, res, next) {

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

    var date_time = req.params.date_time;
    date_time = date_time.replace("+", "%20");
    date_time = decodeURIComponent(date_time);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);

    var class_id_list = [];
    var resultValuesList = [];
    var resultValues;

    var attendanceCount = 0;
    var absenceCount = 0;

    flow(function() {
            var paramList = [req.params.cid, req.params.date_time];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.cid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'SELECT attend, absence_type FROM attendance A JOIN date B ON A.date = B.id ' +
                'WHERE A.class_id = ' + req.params.cid + ' && B.year = ' + year + ' && B.month = ' + month + ' && B.day = ' + day;
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {

                    for (k = 0; k < result.length; k++) {
                        if (result[k]['attend'] == 0)
                            absenceCount++;
                        else
                            attendanceCount++;
                    }
                    resultMessage.result.attendanceCount = attendanceCount;
                    resultMessage.result.absenceCount = absenceCount;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//출석부 출석 변경 요청
router.put('/:pid/attendance/child/:child_id', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var attend_id = req.body.attend_id;
    var attend = req.body.attend;
    var absence_type = req.body.absenceType;
    var reason = req.body.reason;

    flow(function() {
            conn.query('START TRANSACTION', function(err, result) {

                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var paramList = [req.params.child_id, req.body.attend, req.body.absenceType];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.child_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            sql_stmt = 'UPDATE attendance SET attend = ' + attend +
                ', reason = "' + reason +
                '", absence_type = ' + absence_type +
                ' WHERE child_id = ' + req.params.child_id + " AND id = " + attend_id;
            console.log(sql_stmt);
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 602;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/:pid/attendance/date/:date_time'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//출석부 변경 요청 (아이의 반 변경 시)
router.put('/:pid/attendance/change_class/:class_id/child/:child_id', function(req, res, next) {

    var conn = abbDb.connection;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var paramChecker = dmkParamChecker.getParamChecker();

    var date_time = dmklib.getWorldTime(+9);
    var year = date_time.substring(0, 4);
    var month = date_time.substring(5, 7);
    var day = date_time.substring(8, 10);
    var hour = date_time.substring(11, 13);
    var min = date_time.substring(14, 16);

    var date_id;
    var attend = req.body.attend;
    var absence_type = req.body.absenceType;
    var reason = req.body.reason;

    //출석부에 아이들 리스트가 Insert 된 시점 (새벽 1시) 이후 ~ 하원 시간 (오후 5시) 이전 이면, 출석부에 반 변경 사항을 바로 적용
    if (hour >= 1 && hour <= 17) {
        flow(function() {
                conn.query('START TRANSACTION', function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            })
            .then(function(err) {
                var paramList = [req.params.child_id, req.params.class_id];

                if (paramChecker.nullChecker(paramList)) {
                    this.continue(err);

                } else {
                    resultMessage.statusCode = 800;
                    err = 'parameter null or undefined';
                    this.break(err);
                }
            })
            .then(function(err) {
                var paramList = [req.params.child_id, req.params.class_id];

                if (paramChecker.numericChecker(paramList)) {
                    this.continue(err);

                } else {
                    resultMessage.statusCode = 700;
                    err = 'wrong parameter type';
                    this.break(err);
                }
            })
            .then(function(err) {

                sql_stmt = 'SELECT id FROM date WHERE year = ' + year + ' && month = ' + month + ' && day = ' + day;
                var query = conn.query(sql_stmt, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        date_id = result[0].id;
                        this.continue(err);
                    }
                }.bind(this));
            })
            .then(function(err) {
                sql_stmt = 'UPDATE attendance SET class_id = ' + req.params.class_id +
                    ' WHERE child_id = ' + req.params.child_id + " && date = " + date_id;
                var query = conn.query(sql_stmt, function(err, result) {

                    if (err) {
                        resultMessage.statusCode = 602;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            })
            .finally(function(err) {
                if (err) {
                    var query = conn.query('ROLLBACK', function(err, rows) {
                        error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/attendance/change_class/:class_id/child/:child_id'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                        res.json(resultMessage);
                    });

                } else {
                    var query = conn.query('COMMIT', function(err, rows) {
                        resultMessage.statusCode = 0;
                        operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/attendance/change_class/:class_id/child/:child_id'" + ", " + req.method + ", " + req.headers['content-length']);
                        res.json(resultMessage);
                    });
                }
            });

        conn.close();
    }
    //출석부에 반 변경 사항을 미적용
    else {
        resultMessage.statusCode = 0;
        res.json(resultMessage);
    }
});

//특정 반에 있는 아이들 리스트 가져오기
router.get('/class/:class_id/child_list', function(req, res, next) {

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

    var geo_list = [];
    var latitude;
    var longitude;

    flow(function() {
            var paramList = [req.params.class_id];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.class_id];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var child_list_query = 'SELECT * ' +
                'FROM child ' +
                'WHERE class_id = ' + req.params.class_id;
            var query = conn.query(child_list_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result = list;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/class/:class_id/child_list'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/class/:class_id/child_list'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});

//특정 유치원에 있는 아이들 리스트 가져오기
router.get('/:pid/child_list', function(req, res, next) {

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

    flow(function() {
            var paramList = [req.params.pid];

            if (paramChecker.nullChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 800;
                err = 'parameter null or undefined';
                this.break(err);
            }
        })
        .then(function(err) {
            var paramList = [req.params.pid];

            if (paramChecker.numericChecker(paramList)) {
                this.continue(err);

            } else {
                resultMessage.statusCode = 700;
                err = 'wrong parameter type';
                this.break(err);
            }
        })
        .then(function(err) {
            var child_list_query = 'SELECT A.name, A.class_id, A.id as child_id, B.name as class_name, A.preschool_id ' +
                'FROM child A ' +
                'JOIN class B ' +
                'ON A.class_id = B.id ' +
                'WHERE A.preschool_id = ' + req.params.pid;
            console.log(child_list_query);
            var query = conn.query(child_list_query, function(err, rows) {
                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    var list = [];
                    for (i = 0; i < rows.length; i++) {
                        list.push(rows[i]);
                    }
                    resultMessage.result = list;
                    this.continue(err);
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/class/:class_id/child_list'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);

            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/class/:class_id/child_list'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
            }
        });

    conn.close();
});


// 투표 등록
router.post("/vote", upload.any(), function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    console.log("tt", req.body);

    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    var resultMessage = {
        result: {}
    }

    var noticeId = null;
    var voteId = null;
    var voteItemId = null;

    flow(
            function() {
                console.log("[flow]");
                var query = conn.query("START TRANSACTION", function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 600;
                        this.break(err);
                    } else {
                        //console.log("111", result);
                        this.continue(err);
                    }
                }.bind(this));
            }
        )
        .then(
            function(err) {
                console.log("[then start]");
                //console.log(req);
                //			voteEnrollQuery = "insert into noitice (title, body, allow_reply, date, read_count, preschool_id, class_id, author_uid
                var class_id = req.body.cid;
                if (class_id == -1) {
                    class_id = null;
                }
                var query_st = 'insert into notice (title, body, allow_reply, preschool_id, class_id, author_uid, isNotice, read_count) values("' +
                    req.body.title + '", "' + req.body.body + '", ' + req.body.allow_reply + ', ' + req.body.pid + ', ' + class_id + ', ' + req.body.uid + ', ' + req.body.isNotice + ', ' + req.body.read_count + ')';
                console.log(query_st);
                //console.log("[reqBoddy]", req.body);
                var query = conn.query(query_st,
                    function(err, result) {
                        if (err) {
                            //console.log("111");
                            resultMessage.statusCode = 601;
                            this.break(err);
                        } else {
                            noticeId = result.info.insertId;
                            resultMessage.result.notice_id = Number(noticeId);
                            //console.log("[notice res]", result);
                            //console.log("[insertId]", noticeId);
                            this.continue(err);
                        }
                    }.bind(this));

            }
        )
        .then(
            function(err) {
                console.log("[22]");
                var voteInsertQuery = 'insert into vote (notice_id, final_date) values(' + noticeId + ', "' + req.body.final_date + '"' + ')';
                var query = conn.query(voteInsertQuery, function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 602;
                        this.break(err);
                    } else {
                        voteId = result.info.insertId;
                        //console.log("[vote res]", result);
                        //console.log("[insertVoteId]", voteId);
                        this.continue(err);
                    }
                }.bind(this));

            }
        )
        .then(
            function(err) {
                console.log("[body]", req.body.vote_item);
                var vote_item = JSON.parse(req.body.vote_item);
                var loopCount = vote_item.length;
                //var loopCount = req.body.vote_item.length;

                console.log("[33]", req.body.vote_item, loopCount);

                for (var i = 0; i < loopCount; i++) {
                    //console.log("vote_item", req.body.vote_item[i]);
                    var voteItemInsertQuery = 'insert into vote_item (vote_id, item_name) values(' + voteId + ', "' + vote_item[i].item_name + '"' + ')';
                    console.log("[voteItemInsertQuery]", voteItemInsertQuery);
                    var query = conn.query(voteItemInsertQuery, function(err, result) {
                        if (err) {
                            resultMessage.statusCode = 603;
                            this.break(err);
                        } else {
                            voteItemId = result.info.insertId;
                            //console.log("[vote res]", result);
                            //console.log("[insertVoteItemId]", voteItemId);
                            this.continue(err);
                        }
                    }.bind(this));
                }
            }
        )
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/vote'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    operation_log.info(ip + ", role" + ", ID" + ", '/preschools/vote'" + ", " + req.method + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                });
            }
        });
});

// 투표 수정
router.put('/:pid/vote', upload.any(), function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    flow(function() {
            console.log("[flow]");
            var query = conn.query("START TRANSACTION", function(err, result) {
                if (err) {
                    console.log("transaction err");
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log("[then start]");

            var queryStr = conn.query("UPDATE notice SET title = ?, body = ?, allow_reply = ? WHERE id = ?", [req.body.title, req.body.body, req.body.allow_reply, req.body.id], function(err, result) {
                console.log(queryStr);
                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            console.log("[next1]", req.body);

            var queryStr = conn.query("UPDATE vote SET final_date = ? WHERE id = ?", [req.body.final_date, req.body.vote_id], function(err, result) {
                console.log(queryStr);
                if (err) {
                    console.log("[errlog]", err);
                    resultMessage.statusCode = 603;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var qryStr = conn.query('delete from vote_item where vote_id = ?', [req.body.vote_id], function(err, result) {
                console.log(qryStr);
                if (err) {
                    console.log("[errr]", err);
                    resultMessage.statusCode = 604;
                    this.break(err);
                } else {
                    this.continue(err);
                }
            }.bind(this));
        })
        // .then(function(err) {
        //     console.log(req.body.vote_item)
        //     for (var i = 0; i < req.body.vote_item.length; i++) {
        //         var qryStr = conn.query('insert into vote_item(vote_id, item_name) values(' + req.body.vote_id + ', "' + req.body.vote_item[i].vote_item_name + '"' + ')', function(err, result) {
        //             console.log(qryStr);
        //             if (err) {
        //                 console.log("[errr]", err);
        //                 resultMessage.statusCode = 604;
        //                 this.break(err);
        //             } else {
        //                 this.continue(err);
        //             }
        //         }.bind(this));
        //     }
        // })
        .then(function(err) {
            var idx = 0;
            var parsing = JSON.parse(req.body.vote_item);
            console.log("[[parsing]]", parsing);
            for (var i = 0; i < parsing.length; i++) {
                var qryStr = conn.query('insert into vote_item(vote_id, item_name) values(' + req.body.vote_id + ', "' + parsing[i].vote_item_name + '"' + ')', function(err, result) {
                    console.log(qryStr);
                    if (err) {
                        console.log("[errr]", err);
                        resultMessage.statusCode = 604;
                        this.break(err);
                    } else {
                        idx++;
                        if (idx == parsing.length - 1) {
                            this.continue(err);
                        }
                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            console.log("[final]")
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    resultMessage.statusCode = 500;
                    req.headers['content-length'];
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    req.headers['content-length'];
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

// 유치원 전체 투표 목록 불러오기
router.get('/:pid/vote', function(req, res, next) {

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

    var query = conn.query('SELECT id, title, body, allow_reply, date, read_count, preschool_id, class_id, author_uid, isNotice FROM notice WHERE isNotice=0 and preschool_id =' + req.params.pid, function(err, rows) {
        console.log("[2]");
        if (err) {
            console.log("[3]");
            resultMessage.statusCode = 604;
            error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            console.log("[4]");
            var list = [];
            for (var i = 0; i < rows.length; i++) {
                list.push(rows[i]);
            }
            resultMessage.statusCode = 0;
            resultMessage.result = list;
            console.log("call notice", resultMessage);
            res.json(resultMessage);

            operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + req.headers['content-length']);
        }
    });

    conn.close();
});



// 특정 반 및 전체로 등록된 투표 목록 불러오기
router.get('/:pid/class/:cid/vote', function(req, res, next) {

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

    var qryStr = 'SELECT id, title, body, allow_reply, date, read_count, preschool_id, class_id, author_uid, isNotice FROM notice WHERE isNotice=0 and ((preschool_id = ' + req.params.pid + ' and class_id = ' + req.params.cid + ') ' + ' or (preschool_id = ' + req.params.pid + ' and class_id = null))';

    console.log(qryStr);
    var query = conn.query(qryStr, function(err, rows) {
        console.log("[2]");
        if (err) {
            console.log("[3]");
            resultMessage.statusCode = 604;
            error_log.error(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
        } else {
            console.log("[4]");
            var list = [];
            for (var i = 0; i < rows.length; i++) {
                list.push(rows[i]);
            }
            resultMessage.statusCode = 0;
            resultMessage.result = list;
            console.log("call notice", resultMessage);
            res.json(resultMessage);

            operation_log.info(ip + ", role" + ", ID" + ", '/preschools/:pid/notices'" + ", " + req.method + ", " + req.headers['content-length']);
        }
    });

    conn.close();
});

// 투표 세부 데이터 가져오기
router.get("/vote/:nid/noticeId/:author_id/author_id", function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    //console.log("vote info get start", req.params.nid);

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var notice_id = req.params.nid;
    var vote_id = null;
    var final_date = null;
    var vote_item = new Array();
    var list = [];
    var vote_info = new Object();
    var author_name = null;

    flow(
            function() {
                ///console.log("[flow]");
                var query = conn.query("START TRANSACTION", function(err, result) {
                    if (err) {
                        console.log("transaction err");
                        resultMessage.statusCode = 600;
                        this.break(err);
                    } else {
                        //console.log("111", result);
                        this.continue(err);
                    }
                }.bind(this));
            }
        )
        .then(function(err) {
            console.log("[[[[vote1111]]]]", req.params.nid);
            /*var qryStr = 'SELECT A.id, A.title, A.body, A.allow_reply, A.date, A.read_count, A.preschool_id, A.class_id, A.author_uid, A.isNotice C.image_url FROM notice A JOIN user B ON A.author_uid = B.id JOIN image C on B.photo = C.id WHERE A.isNotice=0 and A.id = ?';*/

            var qryStr = 'SELECT A.id, A.title, A.body, A.allow_reply, A.date, A.read_count, A.class_id, A.author_uid as author_img_url, C.image_url, B.name as author_name, A.preschool_id, A.isNotice ' +
                'FROM notice A ' +
                'JOIN user B ' +
                'ON A.author_uid = B.id ' +
                'LEFT OUTER JOIN image C ' +
                'ON B.photo = C.id ' +
                'WHERE A.isNotice = 0 and A.id = ?';
            conn.query(qryStr, [req.params.nid], function(err, result) {
                if (err) {
                    resultMessage.statusCode = 600;
                    this.break(err);
                } else {
                    console.log("[[resultInfo]]", result);

                    vote_info.notice_info = result[0];
                    this.continue(err);
                }
            }.bind(this));
        })
        .then(function(err) {
            var read_count = vote_info.notice_info.read_count;
            console.log("[[[[[[[[read_count]]]]]]]]", read_count, notice_id);
            read_count++;
            var query = conn.query('UPDATE notice SET read_count = ' + read_count +
                ' WHERE id = ' + notice_id,
                function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
        })
        .then(
            function(err) {
                console.log("[[[[vote222]]]]")
                console.log("[then start]", req.body, req.params);

                var query = conn.query('select id, notice_id, final_date from vote where notice_id = ?', [notice_id],
                    function(err, result) {
                        if (err) {
                            //console.log("111");
                            resultMessage.statusCode = 601;
                            this.break(err);
                        } else {
                            console.log("[resultInfo]", result);

                            vote_info.vote_id = result[0].id;
                            vote_info.final_date = result[0].final_date;

                            console.log("[vote_info]", vote_info);

                            this.continue(err);
                        }
                    }.bind(this));
            }
        )
        .then(
            function(err) {
                console.log("222");
                var query = conn.query('select * from vote_item where vote_id = ?', [vote_info.vote_id], function(err, result) {
                    //console.log("[vote item]", vote_info.vote_id, result);
                    if (err) {
                        resultMessage.statusCode = 602;
                        this.break(err);
                    } else {
                        for (var i = 0; i < result.info.numRows; i++) {
                            console.log("[ttt]", result[i]);
                            vote_item.push({
                                "vote_item_name": result[i].item_name,
                                "vote_item_id": result[i].id
                            })
                            //console.log("vote_item", vote_item);
                        }

                        //console.log("after for", vote_info.vote_item);

                        vote_info.vote_item = vote_item;

                        this.continue(err);
                    }
                }.bind(this));
            }
        )
        // 작성자 이름 가져오는 부분
        .then(function(err) {
            console.log("333");

            var sql_stmt = 'SELECT B.name as author_name ' +
                'FROM notice A ' +
                'JOIN user B ' +
                'ON A.author_uid = B.id ' +
                'WHERE A.id = ' + req.params.nid;
            console.log(sql_stmt);
            var query = conn.query(sql_stmt, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 604;
                    this.break(err);

                } else {
                    if (result[0] == undefined) {
                        resultMessage.statusCode = 800;
                        err = 'parameter null or undefined';
                        this.break(err);

                    } else {
                        author_name = result[0].author_name;
                        vote_info.author_name = author_name;
                        console.log("[[[author_name]]]", author_name);
                        this.continue(err);
                    }
                }
            }.bind(this));
        })
        .finally(function(err) {
            if (err) {

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    resultMessage.result = vote_info;

                    console.log("[resultMessage]", resultMessage);
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
})

// 투표 삭제
router.delete('/:pid/vote/:nid/noticeId', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    console.log(req.params);
    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var queryStr = "DELETE FROM notice WHERE id = " + req.params.nid;
    conn.query(queryStr, function(err, result) {
        if (err) {
            console.log("[err]", err);
            resultMessage.statusCode = 600;
            res.json(resultMessage);
            return;
        }

        resultMessage.statusCode = 0;
        res.json(resultMessage);
    });

    conn.close();
});

//급식표 등록
router.post("/:pid/foodReq", function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    console.log("food start", req.body);

    var resultMessage = {
        statucCode: {},
        result: {}
    }

    var foodId = null;

    flow(
            function() {
                var query = conn.query("START TRANSACTION", function(err, result) {
                    if (err) {
                        err.dmkRes = dmkRes.getResponse(600);
                        this.break(err);
                    } else {
                        this.continue(err);
                    }
                }.bind(this));
            }
        )
        .then(
            function(err) {
                console.log("[then start]");

                var query = conn.query('insert into food (preschool_id) values(' + req.body.pid + ')',
                    function(err, result) {
                        if (err) {
                            console.log("[1]", err);
                            resultMessage.statusCode = 600;
                            this.break(err);
                        } else {
                            foodId = result.info.insertId;
                            this.continue(err);
                        }
                    }.bind(this));

            }
        )
        .then(
            function(err) {
                console.log("[then start1]", req.body);
                for (var i = 0; i < req.body.food_list.length; i++) {
                    var qryStr = 'insert into food_menu (food_id, food_name, snack, date) values(' + foodId + ', "' + req.body.food_list[i].food + '", "' +
                        req.body.food_list[i].snack + '", "' + req.body.food_list[i].date + '"' + ')';

                    console.log(qryStr);

                    var query = conn.query(qryStr,
                        function(err, result) {
                            if (err) {
                                console.log("[2]", err);
                                resultMessage.statusCode = 601;
                                this.break(err);
                            } else {
                                this.continue(err);
                            }
                        }.bind(this));
                }
            }
        )
        .finally(function(err) {
            if (err) {
                var query = conn.query('ROLLBACK', function(err, rows) {
                    resultMessage.statusCode = 500;
                    res.json(resultMessage);
                });

            } else {
                var query = conn.query('COMMIT', function(err, rows) {
                    resultMessage.statusCode = 0;
                    res.json(resultMessage);
                });
            }
        });

    conn.close();
});

//급식표 불러오기
router.get("/:pid/foodReq", function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    //console.log("vote info get start", req.params.nid);

    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var pid = req.params.pid;
    var food_id = new Array();
    var food_list = new Array();

    flow(
            function() {
                ///console.log("[flow]");
                var query = conn.query("START TRANSACTION", function(err, result) {
                    if (err) {
                        err.dmkRes = dmkRes.getResponse(600);
                        this.break(err);
                    } else {
                        //console.log("111", result);
                        this.continue(err);
                    }
                }.bind(this));
            }
        )
        .then(
            function(err) {
                console.log("[then start]");

                var query = conn.query('select id from food where preschool_id = ?', [pid],
                    function(err, result) {
                        if (err) {
                            //console.log("111");
                            resultMessage.statusCode = 600;
                            this.break(err);
                        } else {
                            if (result.length > 0) {
                                for (var i = 0; i < result.info.numRows; i++) {
                                    food_id.push(result[i].id);
                                }
                                this.continue(err);
                            } else {
                                resultMessage.statusCode = 0;
                                res.json(resultMessage);
                            }
                        }
                    }.bind(this));
            }
        )
        .then(function(err) {
            console.log("222");
            var index = 0;
            for (var i = 0; i < food_id.length; i++) {
                var query = conn.query('select * from food_menu where food_id = ?', [food_id[i]], function(err, result) {
                    if (err) {
                        resultMessage.statusCode = 601;
                        this.break(err);

                    } else {
                        console.log(result);
                        for (var j = 0; j < result.length; j++) {
                            food_list.push(result[j]);
                        }
                        if (index == food_id.length - 1) {
                            resultMessage.result = food_list;
                            this.continue(err);
                        } else {
                            index++;
                        }

                    }
                }.bind(this));
            }
        })
        .finally(function(err) {
            if (err) {
                console.log("[errorcode]", err);
            } else {
                resultMessage.statusCode = 0;
                res.json(resultMessage);
            }
        });

    conn.close();
});

// 급식표 삭제
router.delete('/:pid/foodReq/:fid', function(req, res, next) {

    var conn = abbDb.connection;
    var err;

    console.log("[[[[reqreq]]]]", req.params.pid, req.params.fid);
    var resultMessage = {
        statusCode: {},
        result: {}
    };

    var queryStr = 'DELETE FROM food WHERE id = ? and preschool_id = ?';

    conn.query(queryStr, [req.params.fid, req.params.pid], function(err, result) {
        console.log("[[resres]]", result);
        if (err) {
            console.log("[err]", err);
            resultMessage.statusCode = 600;
            res.json(resultMessage);
            return;
        }

        resultMessage.statusCode = 0;
        res.json(resultMessage);
    });

    conn.close();
});

module.exports = router;
