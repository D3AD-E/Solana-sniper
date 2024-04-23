import dotenv from 'dotenv';
import logger from './src/utils/logger';
import listen from './src/listener';

dotenv.config();
logger.info('Started');
listen();
