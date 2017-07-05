import json

class JsonGenerator:
	def __init__(self):
		self.jsonDic = {}

	def appendElement(self, key, value):
		self.jsonDic[key] = value

	def toString(self):
		return json.dumps(self.jsonDic)

class JsonParser:
	def __init__(self, jsonData):
		self.jsonData = jsonData

	def getJsonObject(self):
		return json.loads(self.jsonData)

	def getValue(self, key):
		jsonObject = self.getJsonObject()
		return jsonObject[key]