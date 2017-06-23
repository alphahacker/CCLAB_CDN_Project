/*
	Log Definition

	1XX : Account Errors
	5XX : DB Errors

*/

module.exports.getResponse = function(errCode) {

	return {
		result: {
			errorCode : errCode,
			errorMsg : statusMessages[errCode]
		}

	};
};

//new status code
var statusMessages = {
   0 : "Success",
   1 : "Unknown Error",
   2 : "InvalidParameter",
   3 : "Invalid ID",
   101 : "No user id",
   102 : "Wrong Password",
   103 : "Already Registered",
   104 : "WrongEmailFormat",
   105 : "WrongUserIdFormat",
   106 : "WrongDateFormat",
   107 : "InvalidPasswordFormat",
   108 : "NoUserInfo",

   500 : "DB Err",
   600 : "DB Connection fail",
   601 : "Insert fail",
   602 : "Update fail",
   603 : "Delete fail",
   604 : "Select fail",
   700 : "Wrong parameter",
   800 : "Wrong empty data",
   900 : "Push request error",
   901 : "Push response error",

   // Bus
   2004 : "",
   2005 : "Guduied By Other",
   2009 : "Bus is running",	// 원 설정시 불가능함을 표현
   2011 : "Invalid BusID",
   2012 : "Invalid RouteID",
   2013 : "Invalid RouteOrder",
   2014 : "Route Remains",

   3001 : "AlreadyHasTeacher",   // 반에 교사가 이미 할당시
   3002 : "AlreadyHasClass",
   3003 : "InvalidClassId",

   4001 : "InvalidTeacherId",
   


};

module.exports.getStatusMessage = function(statusCode) {
	return statusMessages[statusCode];
};
