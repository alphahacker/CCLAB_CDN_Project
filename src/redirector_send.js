var util = require('util');
var request = require('request');
var util = require('../src/util.js');
var config = require('./configs.js');

var redirect = {
	send : function(tweetObject) {

    //여기서 하나 뺴고, 자기의 IP빼고 다른 IP들이 어떤건지 추출해야함.
    var ipList = config.ipList;
    //var ipList = ['192.168.120.16', '165.132.122.242'];
    var thisServerIp = util.serverIp();

    /*
    var option = {
      url : util.format('https://iid.googleapis.com/iid/v1/%s/rel/topics/%s', token, topicName),
      method : 'POST',
      headers : {
        'Content-Type': 'application/json'
      }
    }

		request({
			url: url,
			method: "POST",
			headers: { 'Content-Type': 'application/json', 'Authorization': 'key=' + fcmKey },
            }, function (error, response, body) {
				console.log(response);
			});
      */

    //  var formData = {
    //     user_id: tweetObject.userId,
    //     content_id: tweetObject.contentId,
    //     content: tweetObject.content
    //  };
      for(var i=0; i<ipList.length; i++){
          var deliverData = function(index){
							console.log("ipList["+index+"] : " + ipList[index]);
              if(ipList[index] != thisServerIp){
									console.log("redirect target ip : " + ipList[index]);
                  request.post({
                      url: 'http://' + ipList[index] + '/redirector/' + tweetObject.user_id,
                  //    url: 'https://todoist.com/oauth/access_token',
                      form: {contentData : tweetObject.contentData}
                  },
                  function (err, httpResponse, body) {
										if(err) throw err;
										console.log(httpResponse);
										console.log(body);
										return httpResponse;
                  });
              }
          }(i);
      }
	}

};

module.exports = redirect;


  /*
  function PostCode(codestring) {
  // Build the post string from an object
  var post_data = querystring.stringify({
      'compilation_level' : 'ADVANCED_OPTIMIZATIONS',
      'output_format': 'json',
      'output_info': 'compiled_code',
        'warning_level' : 'QUIET',
        'js_code' : codestring
  });

  // An object of options to indicate where to post to
  var post_options = {
      host: 'closure-compiler.appspot.com',
      port: '80',
      path: '/compile',
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(post_data)
      }
  };

  // Set up the request
  var post_req = http.request(post_options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
          console.log('Response: ' + chunk);
      });
  });

  // post the data
  post_req.write(post_data);
  post_req.end();

}

// This is an async file read
fs.readFile('LinkedList.js', 'utf-8', function (err, data) {
  if (err) {
    // If this were just a small part of the application, you would
    // want to handle this differently, maybe throwing an exception
    // for the caller to handle. Since the file is absolutely essential
    // to the program's functionality, we're going to exit with a fatal
    // error instead.
    console.log("FATAL An error occurred trying to read in the file: " + err);
    process.exit(-2);
  }
  // Make sure there's data before we post it
  if(data) {
    PostCode(data);
  }
  else {
    console.log("No data to post");
    process.exit(-1);
  }
});
  */
