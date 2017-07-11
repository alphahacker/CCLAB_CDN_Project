import urllib
import urllib2
import json

from MsgSets import *
from Log import *

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

    def getUserTweetList(self, userId):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/tweetTime/" + userId
        #print url
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        tweetList = parsedJsonData["tweetList"]

        return tweetList

    def getDstLocation(self, userLocation):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/serverLocation/" + userLocation
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        dstLocation = parsedJsonData["surrogateLocation"]

        return dstLocation


class Surrogate:
    def __init__(self):
        self.surrogateIp = ""
        self.userId = ""

    def commWithSurrogate(self, surrogateIp, userId):
        self.surrogateIp = surrogateIp
        self.userId = userId
        self.writeOperation()
        self.readOperation()

    def writeOperation(self):
        url = "http://" + self.surrogateIp + "/timeline/" + self.userId
        value = getWriteMsgToSend(0)

        data = urllib.urlencode(value)
        req = urllib2.Request(url, data)
        response = urllib2.urlopen(req)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        if parsedJsonData["status"] == 'OK':
            pass
        else:
            Log.info("ERROR ! fail to communicate with surrogate server [WriteOperation][POST][" + url + "]")

    def readOperation(self):
        url = "http://" + self.surrogateIp + "/timeline/" + self.userId
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        if parsedJsonData["status"] == 'OK':
            pass
        else:
            Log.info("ERROR ! fail to communicate with surrogate server [ReadOperation][GET][" + url + "]")

