
def getWriteMsgToSend(number):
	if number == 0:
		return {'contentData' : 'Hi I am communicating to surrogate server. actually, I am posting new tweet.'}
	elif number == 1:
		return "Hello Boker"
	elif number == 2:
		return "Hi Boker"
	elif number == 3:
		return "Nice to meet you, Boker"
	elif number == 4:
		return "Glad to meet you, Boker"
	else:
		return "Good to see you, Boker"

def getReplyMsgToSend(number):
	if number == 1:
		return "I'm back"
	elif number == 2:
		return "I'll be back"
	elif number == 3:
		return "See you later"
	elif number == 4:
		return "never come back"
	else:
		return "Are you Happy?"