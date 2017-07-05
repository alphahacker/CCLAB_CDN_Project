import logging

class Log:
    def __init__(self, userID):
        filePath = "./Log/" + userID + ".log"
        logging.basicConfig(filename=filePath, level=logging.DEBUG, format='%(asctime)s [%(levelname)s] %(message)s',
                            datefmt='%Y-%m-%d %p %I:%M:%S')

    @staticmethod
    def debug(message):
        logging.debug('%s', message)

    @staticmethod
    def info(message):
        logging.info('%s', message)

    @staticmethod
    def warning(message):
        logging.warning('%s', message)

    @staticmethod
    def error(message):
        logging.error('%s', message)

    @staticmethod
    def critical(message):
        logging.critical('%s', message)












