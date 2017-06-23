/*
	Simple Param Checker
	Required 파라미터들을 체크하기 위한 것으로,
	Undefined 나 null 인 파라미터들만 체크해줍니다.

	타이트한 체크가 필요해질 경우 개선해야합니다.
*/
// var Regex = require('regex');

function paramChecker() {

    this.nullChecker = function(paramList) {
        if (!Array.isArray(paramList)) {
            return false;
        }

        for (var i = 0; i < paramList.length; i++) {
            if (typeof paramList[i] == "undefined") return false;
            if (paramList[i] == null) return false;
        }

        return true;
    };

    this.isEmail = function(email) {
        if(typeof email != 'string')
            return false;

        var emailRegx=/^[0-9a-zA-Z]([-_\.]?[0-9a-zA-Z])*@[0-9a-zA-Z]([-_\.]?[0-9a-zA-Z])*\.[a-zA-Z]{2,3}$/i;
        return emailRegx.test(email);
    };

    this.isValidUserID = function(userID) {
        if(typeof userID != 'string')
            return false;

        if(userID.length < 4 || userID.length > 12)
            return false;

        var languageCheck = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
        var idRegx=/^[a-z]+[a-z0-9]{4,12}$/i;
        
        return idRegx.test(userID) && !languageCheck.test(userID);
    };

    
    this.isValidPassword = function(userPassword) {
        if(typeof userPassword != 'string')
            return false;


         var passRegx=/^[a-zA-Z]+[a-zA-Z0-9]{8,15}$/;
         return passRegx.test(userPassword);
         
    };
    

    this.isValidDate = function(date) {
        if(typeof date == "number")
            date = date.toString();

        if(typeof date != 'string') {
            return false;
        }

        var dateRegx = /^(19[7-9][0-9]|20\d{2})-(0[0-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/;
        return dateRegx.test(date);
    };

    // this.wrongParamChecker.numericChecker = function (paramList) {
    // 		if(!Array.isArray(paramList)) {
    // 			return false;
    // 		}
    //
    // 		for(var i = 0; i < paramList.length; i++){
    // 			if(paramList[i].match(/[^0-9]/)){	//문자가 섞여있는 경우
    // 				return false;
    // 			}
    // 		}
    // 		return true;
    // };

    this.numericChecker = function(paramList) {
        // if(!Array.isArray(paramList)) {
        // 	return false;
        // }
        //
        // for(var i = 0; i < paramList.length; i++){
        // 	if(typeof(paramList[i]) == string && paramList[i].match(/[^0-9]/)){	//문자가 섞여있는 경우
        // 		return false;
        // 	}
        // }
        return true;
    };

    /*
    var stringChecker = function () {

    }

    ...
    */
}

module.exports.getParamChecker = function() {
    return new paramChecker();
};
