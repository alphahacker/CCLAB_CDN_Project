class JobList:
	def __init__(self):
		self.oneHourList = []

	def insertJobValueByKey(self, jobToWork):
		self.oneHourList.append(jobToWork)

	def dequeJobValueByKey(self):
		if self.checkLengthOfTimeList() < 1:
			return 0

		FIRST_QUEUE_IN_LIST = 0
		selectedJob = self.oneHourList.pop(FIRST_QUEUE_IN_LIST)
		return selectedJob

	def checkLengthOfTimeList(self):
		return len(self.oneHourList)

class JobHashMap:
	TOTAL_TIME_COUNT = 24

	def __init__(self):
		self.oneDayTimeListPerOneHour = []

		for i in range(0, self.TOTAL_TIME_COUNT):
			timeListPerOneHour = []
			self.oneDayTimeListPerOneHour.append(timeListPerOneHour)

	def insertJobValueByKey(self, jobValue, mapKey):
		if not self.checkLengthOfDayTimeList():
			return 0

		if not self.checkMapKey(mapKey):
			return 0

		listInOneHour = self.oneDayTimeListPerOneHour[mapKey]
		listInOneHour.append(jobValue)
		return 1

	def dequeJobValueByKey(self, mapKey):
		if not self.checkMapKey(mapKey):
			return 0

		selectedTimeList = self.oneDayTimeListPerOneHour[mapKey]
		if self.checkLengthOfTimeList(selectedTimeList) < 1:
			return 0

		FIRST_QUEUE_IN_LIST = 0
		selectedJob = selectedTimeList.pop(FIRST_QUEUE_IN_LIST)
		return selectedJob

	def checkLengthOfDayTimeList(self):
		return (len(self.oneDayTimeListPerOneHour) == self.TOTAL_TIME_COUNT)

	def checkMapKey(self, mapKey):
		return (mapKey < self.TOTAL_TIME_COUNT)

	def checkLengthOfTimeList(self, timeList):
		return len(timeList)