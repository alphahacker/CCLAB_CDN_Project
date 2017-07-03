var coord = require('./coord.js');

var monitoring = {
  getCacheHitRatio : function () {
    return (monitoring.cacheHit/(monitoring.cacheHit + monitoring.cacheMiss));
  },

  getLatencyDelay : function (location1, location2) {
    var lat1, lng1, lat2, lng2;

    lat1 = coord[location1].lat;
    lng1 = coord[location1].lng;
    lat2 = coord[location2].lat;
    lng2 = coord[location2].lng;

    function deg2rad(deg) {
        return deg * (Math.PI/180)
    }

    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lng2-lng1);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c; // Distance in km

    console.log("distance (user, surrogate server)= " + d);
    var latency_delay = 0;  //ms
    if(d==0){
      latency_delay = 20;
    } else {
      latency_delay = Math.round(0.02 * d + 5);
    }

    return latency_delay;
  },

  getExecutionDelay : function () {

  },

  getTrafficPerHour : function () {

  },

  getTrafficPerDay : function () {

  }
};

module.exports = monitoring;
