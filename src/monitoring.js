var monitoring = {
  getCacheHitRatio : function () {
    return (monitoring.cacheHit/(monitoring.cacheHit + monitoring.cacheMiss));
  },

  getLatencyDelay : function () {

  },

  getExecutionDelay : function () {

  },

  getTrafficPerHour : function () {

  },

  getTrafficPerDay : function () {

  }
};

module.exports = monitoring;
