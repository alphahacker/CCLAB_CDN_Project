var abbdb = require('../src/abbdb.js'),
	paramChecker = require('../src/dmkParamChecker.js');

var util = require('util');
var request = require('request');

var fcmKey = 'AAAAyEOs33k:APA91bGvUb5ZiPiKfMWnVxv-XE4rwht4WeayykRhIE-hSs05HMQd3TIjfVtPvr6d1pphQidn2ZZaJCuAgDBcIhoU3WVA_Tk1nKGCwgtzAgJFTlJMxbgqBn905N-Bnr4zZVyw_tPppXPz';
// Noti History Content Type 을 정해야 합니다

var libobj = {
	addFcmTopic : function(token, topicName) {

		var url = util.format('https://iid.googleapis.com/iid/v1/%s/rel/topics/%s', token, topicName);
		console.log(url);

		request({
			url: url,
			method: "POST",
			headers: { 'Content-Type': 'application/json', 'Authorization': 'key=' + fcmKey },
            }, function (error, response, body) {
				console.log(response);
			});

	},

	removeFcmTopic : function(token, topicName) {

		var url = util.format('https://iid.googleapis.com/iid/v1:batchRemove');
		var tokens = [ token ];
		request({
			url: url,
			method: "POST",
			headers: { 'Content-Type': 'application/json', 'Authorization': 'key=' + fcmKey },
			body: {
				"to": "/topics/" + topicName,
				"registration" : tokens
			}
		}, function(err, response, body) {
			console.log(response);
		});

	},

	sendPushToTopic : function(topicName, title, msg) {

	},

	sendPushToUser : function(deviceToken, title, msg) {
		
		var body = {
			"to" : deviceToken,
			"notification" : {
				"body" : msg,
				"sound" : 'default'
			}
		};

		request({
			url: 'https://fcm.googleapis.com/fcm/send',
			method: "POST",
			headers: { 'Content-Type': 'application/json', 'Authorization': 'key=' + fcmKey },
			body: body
		}, function(err, response, body) {
			console.log(response);
		});
	},

	logNotiHistory : function(preschoolID, receiverUserID, contentType, contentID, senderName, notiTitle, notiBody) {
		var conn = abbdb.connection;
		if(!conn) {
			return;
		}

		// Check required parameters
		var requiredVars = [ preschoolID, receiverUserID, contentType, senderName, notiTitle, notiBody ];
		if(!paramChecker.getParamChecker().nullChecker(requiredVars)) {
			throw new Error('Need required parameters: prechoolID, content type, sender name, noti title, noti body');
		}

		if(typeof contentID == 'undefined') {
			contentID = null;
		}

		var dbValues = requiredVars.slice();
		dbValues.push(contentID);

		var queryStr = 'INSERT INTO noti_history(preschool_id, receiver_uid, content_type, sender_name, noti_title, noti_body, send_datetime, content_id)' +
						' VALUES(?, ?, ?, ?, ?, ?, NOW(), ?)';
		conn.query(queryStr, dbValues, function(err, result) {
			if(err) {
				throw new Error('Database Error');
			}

		});

		conn.close();
	},

	getWorldTime : function (tzOffset) { // 24시간제
	    var now = new Date();
	    var tz = now.getTime() + (now.getTimezoneOffset() * 60000) + (tzOffset * 3600000);
	    now.setTime(tz);

	    var s =
	        leadingZeros(now.getFullYear(), 4) + '-' +
	        leadingZeros(now.getMonth() + 1, 2) + '-' +
	        leadingZeros(now.getDate(), 2) + ' ' +

	        leadingZeros(now.getHours(), 2) + ':' +
	        leadingZeros(now.getMinutes(), 2) + ':' +
	        leadingZeros(now.getSeconds(), 2);

	    return s;
	}
};

function leadingZeros(n, digits) {
    var zero = '';
    n = n.toString();

    if (n.length < digits) {
        for (i = 0; i < digits - n.length; i++)
            zero += '0';
    }
    return zero + n;
}

module.exports = libobj;
