var express = require('express');
var router = express.Router();

var abbdb = require('../src/abbdb.js');
var dmkRes = require('../src/dmkResponse.js');
var dmklib = require('../src/dmklib.js');
var flow = require('finally');
var dmkParamChecker = require("../src/dmkParamChecker.js");

router.post('/', function(req, res) {

	// Todo: Check if input parameters are undefined
	 var paramChecker = dmkParamChecker.getParamChecker();
	 if(!paramChecker.isValidUserID(req.body.user_id)) {
	 	res.json(dmkRes.getResponse(101));
	 	return;

	 }

	var conn = abbdb.connection;
	var params = [ req.body.user_id ];
	flow(function() {

		var query = conn.query('select * from user where user_id = ?', params, function(err, rows) {

			if(err) {	// DB Error
				this.break(500);
				return;
			}

			if(rows.length != 1) {
				// No id
				this.break(101);
				return;
			}

			var user = rows[0];
			if(user && user.password != req.body.password) {
				this.break(102);
				return;
			}
			
			if(typeof(user) == "undefined" || user == null) {
				// Unknown error
				this.break(1);
				return;
			}

			this.continue(user);

		}.bind(this));
	})
	.then(function(user) {

		if(typeof req.body.device_token != 'undefined') {

			conn.query('UPDATE user SET device_token = ? WHERE user_id = ?', [ req.body.device_token, req.body.user_id ], function(err, result) {

					if(err) {
						this.break(500);
					}	

					this.continue(0, user);

				}.bind(this));

		} else {

			this.continue(0, user);	

		}

	})
	.finally(function(errorCode, user) {

		var result = dmkRes.getResponse(errorCode);
		if(errorCode == 0) {
			result.user = user;
		}

		res.json(result);
	});

	conn.end();

});


module.exports = router;
