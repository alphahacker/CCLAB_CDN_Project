import sys, os
import pdb


def getCurrentDir():
    return os.getcwd()


def setEnvPath(path):
    path += "\\src"
    sys.path.append(path)


if __name__ == "__main__":
    '''
        To do.
        extract user name to operate bot
    '''

    currentPath = getCurrentDir()
    setEnvPath(currentPath)

    from Log import *
    #from Scheduler import Scheduler

    # sample id
    if len(sys.argv) < 2:
        sys.exit(1)

    userID = sys.argv[1]
    userPlace = sys.argv[2]

    Log(userID)

    Log.debug("=============================================")
    Log.debug("================= Start Bot =================")
    Log.debug("=============================================")

    try:
        print "USER ID = " + userID + ", USER LOCATION = " + userPlace
        '''
        schedulerForBot = Scheduler(userID, userPlace)
        if schedulerForBot == None:
            raise Exception

        schedulerForBot.start()
       '''
    except Exception as e:
        Log.error("Fail to operate bot")

        Log.debug("=========================================================")
        Log.debug("================= Abnormally Finish Bot =================")
        Log.debug("=========================================================")
        sys.exit(1)

    Log.debug("==============================================")
    Log.debug("================= Finish Bot =================")
    Log.debug("==============================================")