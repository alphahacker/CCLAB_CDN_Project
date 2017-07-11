from datetime import datetime, date, time


class BotDate:
    def __init__(self):
        self.year = 0
        self.month = 0
        self.day = 0

    def setYear(self, year):
        self.year = year

    def setMonth(self, month):
        self.month = month

    def setDay(self, day):
        self.day = day

    def getYear(self):
        return self.year

    def getMonth(self):
        return self.month

    def getDay(self):
        return self.day


class BotTime:
    def __init__(self):
        self.hour = 0
        self.minute = 0
        self.second = 0

    def setHour(self, hour):
        self.hour = hour

    def setMinute(self, minute):
        self.minute = minute

    def setSecond(self, second):
        self.second = second

    def getHour(self):
        return self.hour

    def getMinute(self):
        return self.minute

    def getSecond(self):
        return self.second


class Timer:
    def __init__(self):
        self.botDate = BotDate()
        self.botTime = BotTime()

    def setCurrentDateAndTime(self):
        currentDateTime = datetime.now()

        self.botDate.setYear(currentDateTime.year)
        self.botDate.setMonth(currentDateTime.month)
        self.botDate.setDay(currentDateTime.day)

        self.botTime.setHour(currentDateTime.hour)
        self.botTime.setMinute(currentDateTime.minute)
        self.botTime.setSecond(currentDateTime.second)

    def compareHourWithNowHour(self):
        nowDateTime = datetime.now()
        return self.botTime.getHour() == nowDateTime.hour

    def compareDayWithNowDay(self):
        nowDateTime = datetime.now()
        return self.botDate.getDay() == nowDateTime.day

    def getCurrentHour(self):
        return self.botTime.getHour()

    def getCurrentDay(self):
        return self.botDate.getDay()

    def getWaitTimeForNextHour(self):
        nowDateTime = datetime.now()

        compareMinute = 60 - nowDateTime.minute
        compareSecond = 60 - nowDateTime.second

        waitTimeInSecond = (compareMinute * 60) + compareSecond
        return waitTimeInSecond
