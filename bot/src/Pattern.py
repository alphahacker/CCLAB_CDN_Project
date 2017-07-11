from Structure import *
from Network import *
from Log import *
import random
import pdb

class PatternDelegator:
    def __init__(self, userID):
        self.userID = userID

    def startToGetPattern(self, jobHashMap):
        self.initializePattern()

        #time pattern
        writtenNumInOneDay = self.getOneDayList()
        Log.debug("Complete deciding time pattern\n")
        if not writtenNumInOneDay:
            return

        self.makeHashMap(jobHashMap, writtenNumInOneDay)

    def initializePattern(self):
        self.timePattern = TimePattern(self.userID)
        self.behaviorPattern = BehaviorPattern(self.userID)

    def getOneDayList(self):
        return self.timePattern.startToMakePattern()

    def getOneDayWorkList(self, writtenNumInOneDay):
        return self.behaviorPattern.startToMakeBehaviorPattern(writtenNumInOneDay)

    def makeHashMap(self, jobHashMap, workListInOneDay):
        for hour in range(0, len(workListInOneDay)):
            workListInOneHour = workListInOneDay[hour]
            jobHashMap.insertJobValueByKey(workListInOneHour, hour)


class AbstractPattern:
	TOTAL_TIME_COUNT = 24
	INIT_COUNT = 0

	def initialize(self):
		pass

	def deinitailize(self):
		pass

	def startToMakePattern(self):
		pass


class TimePattern(AbstractPattern):
    MAX_TWEET_NUM = 150

    def __init__(self, userID):
        self.initialize()
        self.userID = userID

        self.jobCountByTimeList = []
        for i in range(0, self.TOTAL_TIME_COUNT):
            self.jobCountByTimeList.append(self.INIT_COUNT)

    def startToMakePattern(self):
        Log.debug("=============================================")
        Log.debug("=========== Generate Time Pattern ===========")
        Log.debug("=============================================")

        return self.startToMakeTimePattern()

    def startToMakeTimePattern(self):
        writtenNumInHouList = self.getAllDataFromDataBase()
        if not writtenNumInHouList:
            return

        self.generalizeAllDataAsOneDay(writtenNumInHouList)
        return self.getWorkCountByEachHour()

    def getAllDataFromDataBase(self):
        DBPSServer = DBPS()
        tweetList = DBPSServer.getUserTweetList(self.userID)
        self.numAllTweetOfUser = len(tweetList)

        hourList = []
        for i in range(0, len(tweetList)):
            dateArr = tweetList[i].split("T")
            timeArr = dateArr[1].split(":")
            hourList.append(int(timeArr[0]))

        return hourList

    def generalizeAllDataAsOneDay(self, writtenNumInHourList):
        for i in range(0, len(writtenNumInHourList)):
            hourValue = writtenNumInHourList[i]

            if not self.checkProperHourValue(hourValue):
                continue

            self.inputValueByHour(hourValue)

    def checkProperHourValue(self, hourValue):
        if hourValue >= self.TOTAL_TIME_COUNT:
            return False
        return True

    def inputValueByHour(self, hourValue):
        self.jobCountByTimeList[hourValue] += 1

    def getWorkCountByEachHour(self):
        totalWrittenNum = self.getTotalWrittenCountInList()

        writtenNumInOneDayList = []
        for selectedTime in range(0, self.TOTAL_TIME_COUNT):
            finalWrittenNum = self.getWrittenValueByRatio(totalWrittenNum, selectedTime)

            writtenNumInOneDayList.append(finalWrittenNum)

        return writtenNumInOneDayList

    def getTotalWrittenCountInList(self):
        return self.numAllTweetOfUser

    def getWrittenValueByRatio(self, totalWrittenNum, selectedTime):
        # total tweet count of a user at the corresponding unit time
        selectedTimeCount = self.jobCountByTimeList[selectedTime]

        selectedTimeRatio = float(selectedTimeCount) / float(totalWrittenNum) * float(self.MAX_TWEET_NUM)
        Log.debug("Total written num in [" + str(selectedTime) + "]: " + str(selectedTimeCount) + "/" + str(int(round(selectedTimeRatio))))
        return int(round(selectedTimeRatio))

class BehaviorPattern(AbstractPattern):
    RW_RATIO = 10
    WORK_FOR_ME 	= 1
    WORK_FOR_YOU 	= 2

    READ_TYPE 		= 1
    WRITE_TYPE 		= 2

    MSG_WRITE 		= 1
    MSG_REPLY 		= 2
    MSG_NOTHING		= 0

    def __init__(self, userID):
        self.initialize()
        self.userID = userID

    def startToMakeBehaviorPattern(self, writtenNumInOneDay):
        if not writtenNumInOneDay:
            return

        Log.debug("=============================================")
        Log.debug("========= Generate Behavior Pattern =========")
        Log.debug("=============================================")

        return self.decideBehaviorByEachHour(writtenNumInOneDay)

    def decideBehaviorByEachHour(self, writtenNumInOneDay):

        workListInOneDay = []

        for selectedHour in range(0, self.TOTAL_TIME_COUNT):
            writtenNumInHour = writtenNumInOneDay[selectedHour]

            writeOperation = int(round(writtenNumInHour))
            readOperation = int(round(writtenNumInHour))

            operationList = []
            if writeOperation != 0:
                operationList.append("W")

            if readOperation != 0:
                operationList.append("R")

            workInHour = []
            while (operationList):
                toWork = []

                operationIndex = random.randrange(0, len(operationList))
                operationValue = operationList[operationIndex]

                if operationValue == "MW":
                    toWork.append(self.WORK_FOR_ME)
                    toWork.append(self.WRITE_TYPE)
                    toWork.append("")
                    toWork.append(self.MSG_WRITE)

                    finalWriteMyself -= 1

                    if finalWriteMyself == 0:
                        operationList.pop(operationIndex)

                if operationValue == "FW":
                    friendIndex = random.randrange(0, len(wFriendList))
                    friendName = wFriendList[friendIndex].getName()

                    toWork.append(self.WORK_FOR_YOU)
                    toWork.append(self.WRITE_TYPE)
                    toWork.append(friendName)
                    toWork.append(self.MSG_REPLY)

                    wFriendList[friendIndex].decreaseNumOperation()

                    if wFriendList[friendIndex].getNumOperation() == 0:
                        wFriendList.pop(friendIndex)

                    finalWriteFriend -= 1

                    if finalWriteFriend == 0:
                        operationList.pop(operationIndex)

                if operationValue == "FR":
                    friendIndex = random.randrange(0, len(rFriendList))
                    friendName = rFriendList[friendIndex].getName()

                    toWork.append(self.WORK_FOR_YOU)
                    toWork.append(self.READ_TYPE)
                    toWork.append(friendName)
                    toWork.append(self.MSG_NOTHING)

                    rFriendList[friendIndex].decreaseNumOperation()

                    if rFriendList[friendIndex].getNumOperation() == 0:
                        rFriendList.pop(friendIndex)

                    finalReadFriend -= 1

                    if finalReadFriend == 0:
                        operationList.pop(operationIndex)

                workInHour.append(toWork)

            workListInOneDay.append(workInHour)
            Log.debug("Behavior in [" + str(selectedHour) + "] is generated")

            time.sleep(1)

        return workListInOneDay