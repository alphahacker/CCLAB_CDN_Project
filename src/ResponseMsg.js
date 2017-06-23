module.exports.getResponseMsg = function(url, err, line) {

    return {
        result: {
            errorFunction : url,
            errorCode : err.errorCode,
            errorMessage : err.errorMsg,
            errorLine : line
        }

    };
};