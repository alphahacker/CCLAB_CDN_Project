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

//var pool = require("../src/db_pooling");

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

// 이미지 삭제
router.delete('/', function(req, res, next) {

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

    var content_id = req.body.insert_id;
    var image_list = JSON.parse(req.body.image_list);
    var image_list_length = image_list.length;

    //image 테이블에서, 이미지 id 이용해서 데이터 삭제
    flow(function(err) {
      if(image_list_length == 1) {
        var image_query = 'DELETE FROM image WHERE id = ' + image_list[0].image_id;
        var query = conn.query(image_query, function(err, result) {

            if (err) {
                resultMessage.statusCode = 603;
                this.break(err);
            } else {
                this.continue(err);
            }
        }.bind(this));
      } else {
        var img_ids = image_list[0].image_id;
        for(var i=1; i<image_list.length; i++){
          img_ids += ("," + image_list[i].image_id);
        }
        var image_query = 'DELETE FROM image WHERE id IN (' + img_ids + ')';
        var query = conn.query(image_query, function(err, result) {

            if (err) {
                resultMessage.statusCode = 603;
                this.break(err);
            } else {
                this.continue(err);
            }
        }.bind(this));
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

// 이미지 추가
router.post('/', upload.any(), function(req, res, next) {

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
    var last_image_id;

    flow(function() {
        if (req.files.length != 0) {
            var image_query = 'INSERT INTO image (image_url) VALUES ("' + req.files[0].location + '")';
            console.log(image_query);
            var query = conn.query(image_query, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 601;
                    this.break(err);
                } else {
                    last_image_id = Number(result.info.insertId);
                    resultMessage.result.last_image_id = last_image_id;
                    this.continue(err);
                }

            }.bind(this));
        } else {
            this.continue(err);
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


// 이미지 관리 테이블 추가
// tid = 1 (album_image), tid = 2 (edu_plan_image), tid = 3 (notice_image), tid = 4 (schedule_image)
router.post('/table/:tid', function(req, res, next) {

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

    var service_type = req.params.tid;
    var TABLE_NAME = "";
    var COLUMN_NAME = "";

    if(service_type == 1) {         //album_image
      TABLE_NAME = "album_image";
      COLUMN_NAME = "album_id";
    }
    else if(service_type == 2) {    //edu_plan_image
      TABLE_NAME = "edu_plan_image";
      COLUMN_NAME = "edu_plan_id";
    }
    else if(service_type == 3) {    //notice_image
      TABLE_NAME = "notice_image";
      COLUMN_NAME = "notice_id";
    }
    else if(service_type == 4) {    //schedule_image
      TABLE_NAME = "schedule_image";
      COLUMN_NAME = "schedule_id";
    }
    else {
      console.log("error!");
    }

    var insert_id = req.body.insert_id;
    var image_list = JSON.parse(req.body.image_list);
    var image_list_length = image_list.length;
    console.log(image_list);

    if(image_list_length == 1){
        var image_query = 'INSERT INTO ' + TABLE_NAME + '(' + COLUMN_NAME + ', image_id' + ') '
                        + 'VALUES (' + insert_id + ', ' + image_list[0].image_id + ')';
        console.log(image_query);
        var query = conn.query(image_query, function(err, result) {

            if (err) {
                resultMessage.statusCode = 601;
                error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                res.json(resultMessage);
                conn.close();
            } else {
                resultMessage.statusCode = 0;
                operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + req.headers['content-length']);
                res.json(resultMessage);
                conn.close();
            }
        }.bind(this));
    }
    else {
        insertImageTable = function(i, callback) {

            var image_query = 'INSERT INTO ' + TABLE_NAME + '(' + COLUMN_NAME + ', image_id' + ') '
                            + 'VALUES (' + insert_id + ', ' + image_list[i].image_id + ')';
            console.log(image_query);
            var query = conn.query(image_query, function(err, result) {

                if (err) {
                    resultMessage.statusCode = 601;
                    error_log.error(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + resultMessage.statusCode + ", " + dmkRes.getStatusMessage(resultMessage.statusCode) + ", " + req.headers['content-length']);
                    res.json(resultMessage);
                    conn.close();
                //    this.break(err);
                } else {
                    if(i >= image_list.length -1) {
                        callback();
                    }
                    else {
                        insertImageTable(i+1, callback);
                    }
                }
            }.bind(this));
        }

        insertImageTable(0, function() {
            resultMessage.statusCode = 0;
            operation_log.info(ip + ", role" + ", ID" + ", '/preschools/notice/:notice_id/targetUsers/'" + ", " + req.method + ", " + req.headers['content-length']);
            res.json(resultMessage);
            conn.close();
        });
    }
});

module.exports = router;
