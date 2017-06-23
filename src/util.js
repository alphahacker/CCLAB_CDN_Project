var os = require('os');
var count = 0;

var util = {
  serverIp : function () {
      var ifaces = os.networkInterfaces();
      var result = '';
      for (var dev in ifaces) {
          var alias = 0;
          ifaces[dev].forEach(function(details) {
              if (details.family == 'IPv4' && details.internal === false) {
                  result = details.address;
                  ++alias;
              }
          });
      }
      return result;
  },
  getContentId : function () {
    //contentId 값을 분산된 서버를 고려했을 때도, 그 숫자가 중복되지 않게 하기 위해서,
    //각 서버의 IP를 이용한다. 근본적인 해결 방법은 될 수 없겠지만, 실험하는 정도에선 크게 무리가 없을 듯.
    var thisServerIp = util.serverIp();
    var contentId = parseInt(thisServerIp) + count;
    count = count + 1;
    return contentId;
  },
  getServerLocation : function () {
    var serverLocation;
    var thisServerIp = util.serverIp();
    console.log("this server ip : " + thisServerIp);
    if(thisServerIp == '192.168.0.27') {
        serverLocation = 'newyork';
    }
    else if (thisServerIp == '165.132.120.244') {
        console.log("Wrong access IP!");
    }
    else {
        console.log("Wrong access IP!");
    }
    return serverLocation;
  }
}

module.exports = util;
