import urllib2
import json

class DBPS:
    dbPoolServerIPAddress = "165.132.104.211"

    def __init__(self):
        pass

    def getUserInfoList(self, botNumber, botTotal):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/userInfoList/botNum/" + botNumber + "/botTotal/" + botTotal
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        #print parsedJsonData["userInfoList"]

        userList = parsedJsonData["userInfoList"]
        return userList