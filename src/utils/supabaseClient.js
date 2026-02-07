/**
 * Supabase Client Initialization
 * تهيئة عميل Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');
const { logger } = require('./logger');

let supabase = null;

if (config.supabaseUrl && config.supabaseKey) {
  try {
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
    logger.info('Supabase client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Supabase client:', error);
  }
} else {
  logger.warn('Supabase credentials not found in environment variables');
}

module.exports = { supabase };
