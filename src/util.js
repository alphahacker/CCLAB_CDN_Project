var os = require('os');
var dns = require('dns');
var ip = require('ip');
var count = 0;

var util = {
  serverIp : function (cb) {
    console.log("addr test 2 : " + ip.address());
    return ip.address();

    // dns.lookup(os.hostname(), function(err, add, fam){
    //   console.log("addr test : " + add);
    //   cb(add);
    // })

    // require('dns').lookup(require('os').hostname(), function(err,add,fam){
    //   console.log("addr test : " + add);
    //   return add;
    // })

      //
      // var ifaces = os.networkInterfaces();
      // var result = '';
      // for (var dev in ifaces) {
      //     var alias = 0;
      //     ifaces[dev].forEach(function(details) {
      //         if (details.family == 'IPv4' && details.internal === false) {
      //             result = details.address;
      //             ++alias;
      //         }
      //     });
      // }
      // return result;
  },
  getContentId : function () {

  },
  getServerLocation : function () {
    var serverLocation;
    var thisServerIp = util.serverIp();
    console.log("this server ip : " + thisServerIp);
    if(thisServerIp == '192.168.0.27') {
        serverLocation = 'newyork';
    }
    else if (thisServerIp == '165.132.104.208') {
        serverLocation = 'texas';
    }
    else {
        console.log("Wrong access IP!");
    }
    console.log("server location : " + serverLocation);
    return serverLocation;
  }
}

module.exports = util;
