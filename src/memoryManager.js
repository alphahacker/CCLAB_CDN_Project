var dbPool = require('../src/db.js');
var redisPool = require('../src/caching.js');
var util = require('./util.js');
var config = require('./configs.js');

var memoryManager = {
	checkMemory : function(tweetObject) {
		var dataSize = tweetObject.content.length;
		var userId = tweetObject.userId;
		try{
			memoryManager.getUserMemory(userId, function(remainUserMemory){
				console.log("!!!! user : " + userId);
				var currRemainMemory = parseInt(remainUserMemory) - parseInt(dataSize);

				if(currRemainMemory >= 0){
					console.log("current remain memory > 0 : " + currRemainMemory);
					memoryManager.setUserMemory(userId, currRemainMemory, function(){
						memoryManager.setDataInMemory(tweetObject, currRemainMemory);
					});
				}
				else{
					var promise = new Promise(function(resolved, rejected){
						console.log("current remain memory < 0 : " + currRemainMemory);
						//1. 해당 유저의 index 메모리 값들 가지고 오기
						memoryManager.getUserIndexMemory(userId, function(userContents){
							resolved(userContents);
						});
					});

					promise
					.then(function(userContents){
						return new Promise(function(resolved, rejected){
							//2. 추출되어야하는 데이터 리스트 가지고 오기
							var extractedIndexList = [];
							console.log("userContents["+userId+"]:");
							console.log(userContents);
							memoryManager.getExtIndexList(userContents, extractedIndexList, currRemainMemory, function(){
								console.log("extractedIndexList ["+userId+"]:");
								console.log(extractedIndexList);
								//rejected();
								resolved(extractedIndexList);
							});
						})
					}, function(err){
							console.log(err);
					})
					.then(function(extractedIndexList){
						return new Promise(function(resolved, rejected){
							for(var i=0; i<extractedIndexList.length; i++){
								var removeData = function(j){
									console.log("delete " + j + "th element of extractedIndexList");
									console.log("extractedIndexList["+j+"].index = " + extractedIndexList[j].index);
									redisPool.dataMemory.del(extractedIndexList[j].index, function(err, response) {
										if(err)	{ console.log("delete data error! "); rejected("delete data error!! "); }
										else {
											//if (response == 1) {
													var updatedMemory;
													updatedMemory = currRemainMemory + extractedIndexList[j].data.length;
													console.log("update memory " + j + "th element of extractedIndexList");
													console.log("updatedMemory = " + updatedMemory);
													console.log("user id = " + userId);
													memoryManager.setUserMemory(userId, updatedMemory, function(){
														if(j == (extractedIndexList.length - 1)) {
															console.log("Deleted Successfully!");
															memoryManager.setDataInMemory(tweetObject, updatedMemory);
															resolved();
														}
													});

											//}
											//  else{
											// 	 if(i == (extractedIndexList.length - 1)) {
											// 		 console.log("Cannot delete");
											// 		 memoryManager.setDataInMemory(tweetObject, currRemainMemory);
											// 		 resolved();
											// 	 }
											//  }
										}
									})
								}(i);
							} // end for
						})
					}, function(err){
							console.log(err);
					})
				} // end else
			})
		} catch (e) {
			console.log("get user memory error! : " + e);
		}
	},

	//남아 있는 해당 사용자에게 할당된 메모리 양 (레디스에서 메모리 가져온다, 레디스에 없으면 Mysql 디비에서 가져온다)
  getUserMemory : function(userId, cb){
			//0. redis pool로 redis연결한다
		  var key = userId;
		  redisPool.socialMemory.get(key, function(err, value){
		    if(err)	throw err;
		    var remainMemory = value;

		    //1. cache에 값이 있는지 검사한다
		    if(!value) {
		      //2-1. 없으면, mysql pool 로 db에 연결한다
		      dbPool.getConnection(function(err, conn) {
				      var query_stmt = 'SELECT * FROM ' + util.getServerLocation() + ' WHERE id = "' + key + '"';
				      conn.query(query_stmt, function(err, rows) {
		  			      if(err) {
						         console.log("db err");
					        }
					        else {
						          //3. 없으면 디비에 가져와서 캐쉬에 올리고 리턴
						          var value = JSON.stringify(rows[0]);
											//value *= config.totalMemory;
											value = (value * config.totalMemory);
											remainMemory = value;
						          redisPool.socialMemory.set(key, value, function (err) {
							            console.log("!!! reset data in social memory (cuz, there's no in redis) : " + value);
													conn.release();
													cb(remainMemory);
						          });
					        }
				      });
			    });
		    }
		    else {
		      //2-2. 있으면 가져와서 리턴
					cb(remainMemory);
					//return remainMemory;
		    }
		  })
  },

	//남아 있는 해당 사용자에게 할당된 메모리 양 업데이트
  setUserMemory : function(userId, currMemory, cb){
		var key = userId;
		var value = currMemory;
		redisPool.socialMemory.set(key, value, function (err) {
				if(err) console.log("fail to update the social memory in Redis");
				console.log("now, user [" + userId + "]'s memory : " + value);
				cb();
		});
  },

	//해당 사용자의 index memory에 저장되어 있는 timeline content list 반환
	getUserIndexMemory : function(userId, cb) {
		var contentList = [];

		var key = userId;
		var start = 0;
		var end = -1;
		redisPool.indexMemory.lrange(key, start, end, function (err, result) {
				if(err) console.log("fail to get the user index memory contents in redis!");
				contentList = result;
				cb(contentList);
		});
		//return contentList;
	},

	//추출되어야 하는 데이터 리스트
	getExtIndexList : function(userContents, extractedIndexList, currRemainMemory, cb){
		console.log("userContents.length = " + userContents.length);
		for(var i=userContents.length-1; i>=0; i--){
			var eachContent = function (index) {
				console.log("index = " + index);
				//console.log("index : " + index);
				var key = userContents[index];
				//console.log("key : " + key);
				redisPool.dataMemory.get(key, function (err, result) {
						if(err) console.log("fail to push the content from data memory in redis! ");
						if(result == undefined || result == null){
							return false;
						}
						else {
							//3. 추출 데이터 리스트에 추가
							extractedIndexList.push({	index : key,
																				data : result });

							//5. 해당 사이즈를 메모리에 뺏을때 남는 메모리가 0보다 크면, break
							if(currRemainMemory + result.length > 0){
								//return extractedIndexList;
								console.log("here----------------------------------------------");
								cb();
								i = -1;
								return false;
							}
						}
				});
			}(i);
		}
	},

	setDataInMemory : function(tweetObject, expectedRemainMemory) {
		 if(expectedRemainMemory >= 0){
			 var key = tweetObject.contentId;
			 var value = tweetObject.content;
			 redisPool.dataMemory.set(key, value, function (err) {
					 if(err) rejected("fail to push the content into friend's data memory in Redis");
			 });
		 }
	 }
};

module.exports = memoryManager;


// 	console.log("current remain memory < 0 : " + currRemainMemory);
//
// 	//1. 해당 유저의 index 메모리 값들 가지고 오기
// 	memoryManager.getUserIndexMemory(userId, function(userContents){
//
// 		//2. 추출되어야하는 데이터 리스트 가지고 오기
// 		var extractedIndexList = [];
// 		memoryManager.getExtIndexList(userContents, extractedIndexList, currRemainMemory, function(){
//
// 			console.log("extractedIndexList:");
// 			console.log(extractedIndexList);
//
// 			//3. 해당 인덱스의 데이터를 data memory에서 삭제 (extractedIndexList 길이만큼 반복)
// 			for(var i=0; i<extractedIndexList.length; i++){
// 				var removeData = function(j){
// 					console.log("delete " + j + "th element of extractedIndexList");
// 					redisPool.dataMemory.del(extractedIndexList[j].index, function(err, response) {
// 						 if (response == 1) {
// 								var updatedMemory;
// 								updatedMemory = currRemainMemory + extractedIndexList[j].data.length;
// 								console.log("update memory " + j + "th element of extractedIndexList");
// 								memoryManager.setUserMemory(userId, updatedMemory);
// 								console.log("Deleted Successfully!");
// 						 } else{
// 							console.log("Cannot delete");
// 						 }
// 					})
// 				}(i);
// 			}
// 		});
// 		console.log("extracted index list : " + extractedIndexList);
// 	});
// }
