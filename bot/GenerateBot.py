from multiprocessing import Process
import os, sys, time
import json

def getCurrentDir():
    return os.getcwd()

def setEnvPath(path):
    path += "\\src"
    sys.path.append(path)

BOT_FILE="Bot.py"

def findBotFile():
    global BOT_FILE

    currentPath = os.getcwd()
    botFilePath = currentPath + "\\" + BOT_FILE

    return os.path.exists(botFilePath)

def getUsersInfoFromDB(botNumber, botTotal):
    DBPSServer = DBPS()
    userInfoList = DBPSServer.getUserInfoList(botNumber, botTotal)

    return userInfoList

def mainStart(botNumber, botTotal):
    if not findBotFile():
        print "[Error] Can't find botFile"
        sys.exit(1)

    try:
        usersInfoList = getUsersInfoFromDB(botNumber, botTotal)
        if len(usersInfoList) < 1:
            print "[Error] There is no user data"
            sys.exit(1)

        operateMultiProcess(usersInfoList, botTotal)
    except Exception as e:
        print "[Error] Abnormally exit"
        print e
        sys.exit(1)

def operateMultiProcess(usersInfoList, botTotal):
    procList = []

    for i in range(0, len(usersInfoList)):
        procList.append(Process(target = fn_process, args = (usersInfoList[i]["userId"], usersInfoList[i]["userLocation"],)))

    procNumber = 0
    for eachBot in procList:
        eachBot.start()
        print "[Debug] Process [%d] : [%s] is started " % (procNumber + 1, usersInfoList[procNumber]["userId"])

        if procNumber >= (int(botTotal) - 1):
            break

        time.sleep(1)
        procNumber += 1

    for eachBot in procList:
        eachBot.join()

def fn_process(*argv):
    command_user_id = argv[0]
    command_user_location = argv[1]

    currentPath = os.getcwd()
    botFilePath = currentPath + "\\" + BOT_FILE

    #completedCommand = botFilePath + " " + command_user_id + " " + command_user_location
    completedCommand = "python " + botFilePath + " " + command_user_id + " " + command_user_location
    os.system(completedCommand)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print "Usage : [Bot Number] [Bot Total Number]"
        sys.exit(1)

    currentPath = getCurrentDir()
    setEnvPath(currentPath)

    from Network import *
    from JsonTools import *

    print "**************************************"
    print "*************Generate Bot*************"
    print "**************************************"

    botNumber = sys.argv[1]
    botTotal = sys.argv[2]
    mainStart(botNumber, botTotal)

    print "**************************************"
    print "****************Finish****************"
    print "**************************************"